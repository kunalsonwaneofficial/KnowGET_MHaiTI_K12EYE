import type { Principal } from "@knowget/auth";
import { type ReplayRequest, ReplayRequestService } from "@knowget/event-mesh";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MESH_READ, MESH_REPLAY, actorOf, parseBody, tenantOf } from "./event-mesh-http";
import {
  approveReplaySchema,
  completeReplaySchema,
  failReplaySchema,
  requestReplaySchema,
  settleReplaySchema,
} from "./event-mesh.dto";
import { EM_REPLAY_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for replay requests (P3-D02) — asking for a window of history to be delivered a second time.
 *
 * Every write here is `mesh:replay`, and the scope exists separately from `mesh:operate` because a replay is the
 * one act in this domain that delivers facts a consumer has already acted on. Every consumer downstream was
 * written to read a stream forwards, so it cannot tell that it is being handed history: what it sees is more
 * messages. The damage is not an error anybody notices but a projection in a state no sequence of real events
 * could have produced — a cohort counted twice, a fee applied twice, a notification sent again to a parent who
 * received it in March.
 *
 * Seven routes for one lifecycle, because a replay is a request somebody makes, a decision somebody else takes,
 * and an operation a worker runs — and collapsing any two of those loses the part that makes the whole thing
 * governable. Requesting and approving share a scope rather than being split into two, because the control that
 * matters is a second person rather than a second permission: the aggregate refuses an approver who is the
 * requester, and both actors come from the authenticated principal rather than the body, so an `approvedBy` a
 * caller could type would not merely record the wrong name — it would defeat the rule outright.
 *
 * `approve` takes an instant because approval is where the domain's refusals are actually evaluated: whether the
 * window still falls inside retention, whether it is inverted, too wide or holds more messages than the ceiling
 * allows, whether the stream retained bodies at all and whether the subscription can be delivered to. Those
 * answers depend on when the question is asked, and taking the instant as an argument is what makes an approval
 * reproducible rather than a function of when the request happened to be processed.
 *
 * `complete` and `fail` both carry a delivered count, and `fail` carries a reason as well. A replay that stops
 * halfway has already re-delivered part of a window, and the number that went is the only thing that tells the
 * next person whether re-running it will duplicate work or finish it. `running/:subscriptionId` is the read that
 * backs the domain's sharpest rule: one replay at a time per consumer, because two windows interleaved into one
 * consumer group arrive in an order neither requester asked for and neither can reconstruct afterwards.
 */
@Controller("event-mesh/replays")
export class ReplayRequestController {
  constructor(@Inject(EM_REPLAY_SERVICE) private readonly service: ReplayRequestService) {}

  /**
   * Ask for a window to be delivered again, with a reason. The requester comes from the principal, because it is
   * half of the two-person rule the approval enforces and not a field a caller should be able to state.
   */
  @RequirePermissions(MESH_REPLAY)
  @Post()
  @HttpCode(201)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(requestReplaySchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      subscriptionId: dto.subscriptionId as Uuid,
      fromInstant: dto.fromInstant as ISODateString,
      toInstant: dto.toInstant as ISODateString,
      reason: dto.reason,
      requestedBy: actorOf(principal),
    });
  }

  /**
   * Agree to it, as of a stated instant. Where retention, window width, message count, payload availability and
   * the subscription's own readiness are all checked — and where the aggregate refuses an approver who is the
   * person that asked.
   */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(approveReplaySchema, body);
    return this.service.approve(
      tenantOf(principal),
      id as Uuid,
      actorOf(principal),
      dto.asOf as ISODateString,
    );
  }

  /** Refuse it, with the reason written down. What a request that should not have been made ends as. */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(settleReplaySchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /**
   * Withdraw it. Distinct from rejection rather than the same settlement under a different name: a rejection is
   * somebody declining a request, a cancellation is the request being taken back, and six months later the two
   * answer completely different questions about why a window was never re-delivered.
   */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(settleReplaySchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /** Begin delivering. The transition the one-at-a-time rule is enforced against. */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReplayRequest> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  /** It finished, and this many messages went. No actor, because a worker completing its own work is not a name. */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(completeReplaySchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.deliveredCount);
  }

  /**
   * It stopped part-way, this many messages went, and this is why. The count is the load-bearing field: a replay
   * that failed at message four hundred has already re-delivered four hundred, and whoever decides whether to run
   * it again needs to know that before they decide rather than after.
   */
  @RequirePermissions(MESH_REPLAY)
  @Post(":id/fail")
  @HttpCode(200)
  async fail(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReplayRequest> {
    const dto = parseBody(failReplaySchema, body);
    return this.service.fail(tenantOf(principal), id as Uuid, dto.deliveredCount, dto.reason);
  }

  /** Every replay in the tenant, settled ones included. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ReplayRequest[]> {
    return this.service.list(tenantOf(principal));
  }

  /** One consumer's replay history, oldest first — the answer to why a projection shows an enrolment twice. */
  @RequirePermissions(MESH_READ)
  @Get("by-subscription/:subscriptionId")
  async listBySubscription(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
  ): Promise<readonly ReplayRequest[]> {
    return this.service.listBySubscription(tenantOf(principal), subscriptionId as Uuid);
  }

  /** The one replay in flight for a consumer, or null. What a second request is refused against. */
  @RequirePermissions(MESH_READ)
  @Get("running/:subscriptionId")
  async running(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
  ): Promise<ReplayRequest | null> {
    return this.service.running(tenantOf(principal), subscriptionId as Uuid);
  }

  /** One replay, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReplayRequest> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
