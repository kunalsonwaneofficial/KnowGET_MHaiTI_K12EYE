import type { Principal } from "@knowget/auth";
import { type DeadLetter, DeadLetterService } from "@knowget/event-mesh";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MESH_OPERATE, MESH_READ, actorOf, parseBody, tenantOf } from "./event-mesh-http";
import {
  discardDeadLetterSchema,
  recordDeadLetterSchema,
  replayDeadLetterSchema,
} from "./event-mesh.dto";
import { EM_DEAD_LETTER_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for dead letters (P3-D02) — the deliveries that ran out of attempts, and what was done about them.
 *
 * Writes here are `mesh:operate`. Recording a failure changes nothing about what the platform carries or who may
 * read it; it is the mesh writing down that a delivery it was already authorised to make did not succeed, with
 * the reason from the domain's own vocabulary, the number of attempts spent and the trace that will let somebody
 * find the failure in the logs. Deliberately a closed vocabulary rather than free text: a consumer that raised an
 * exception, a payload the schema refused, a transport that was not there and an attempt budget that ran out are
 * four different problems with four different owners, and a platform that records all four as `error` has told
 * whoever is on call nothing they did not already know from the count.
 *
 * The pair of terminal routes is where this surface earns its shape. `replay` names the replay request that will
 * carry the message again, so a dead letter is never closed by asserting it was handled — it is closed by
 * pointing at the operation that handled it, and the replay's own record says who asked, who approved and how
 * much actually went. `discard` is the honest alternative and it takes a reason, because deciding a fact will
 * never be delivered is a decision somebody makes rather than a state a queue drifts into. Between them there is
 * no route that simply marks a dead letter resolved, and that absence is the design: a dead letter with no
 * account of its end is a delivery the institution has quietly stopped worrying about.
 *
 * `open/:organizationId` is the read this surface exists for. Everything else here answers a question about one
 * message; that route answers the only question worth waking somebody for, which is whether anything the
 * institution meant to deliver is still sitting undelivered.
 */
@Controller("event-mesh/dead-letters")
export class DeadLetterController {
  constructor(@Inject(EM_DEAD_LETTER_SERVICE) private readonly service: DeadLetterService) {}

  /**
   * Record a delivery that ran out of attempts. The failure instant comes from the caller rather than a clock,
   * because whoever reports the failure is a worker that knows when the last attempt was made, and re-stamping
   * it at this boundary would date a failure to the moment the report happened to arrive.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<DeadLetter> {
    const dto = parseBody(recordDeadLetterSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      subscriptionId: dto.subscriptionId as Uuid,
      messageId: dto.messageId as Uuid,
      reason: dto.reason,
      attempts: dto.attempts,
      traceId: dto.traceId,
      failedAt: dto.failedAt as ISODateString,
    });
  }

  /**
   * Close it by naming the replay that will carry the message again. Pointing at the operation rather than
   * asserting the outcome, so the account of what happened to this delivery is the replay's own record.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post(":id/replay")
  @HttpCode(200)
  async replay(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DeadLetter> {
    const dto = parseBody(replayDeadLetterSchema, body);
    return this.service.replay(
      tenantOf(principal),
      id as Uuid,
      dto.replayId as Uuid,
      actorOf(principal),
    );
  }

  /**
   * Decide this fact will never reach this consumer, and say why. The reason and the name are the whole value of
   * the route — without them a discarded delivery is indistinguishable from one nobody ever looked at.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post(":id/discard")
  @HttpCode(200)
  async discard(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DeadLetter> {
    const dto = parseBody(discardDeadLetterSchema, body);
    return this.service.discard(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /** Every dead letter in the tenant, settled ones included. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly DeadLetter[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What this institution still owes a consumer. The one read on this surface worth an alert. */
  @RequirePermissions(MESH_READ)
  @Get("open/:organizationId")
  async listOpen(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly DeadLetter[]> {
    return this.service.listOpen(tenantOf(principal), organizationId as Uuid);
  }

  /** One consumer's failures, oldest first — what an investigation into a broken projection walks. */
  @RequirePermissions(MESH_READ)
  @Get("by-subscription/:subscriptionId")
  async listBySubscription(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
  ): Promise<readonly DeadLetter[]> {
    return this.service.listBySubscription(tenantOf(principal), subscriptionId as Uuid);
  }

  /** The dead letter for one message on one subscription, which is how a retry checks before recording again. */
  @RequirePermissions(MESH_READ)
  @Get("by-message/:subscriptionId/:messageId")
  async getByMessage(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
    @Param("messageId") messageId: string,
  ): Promise<DeadLetter> {
    return this.service.getByMessage(
      tenantOf(principal),
      subscriptionId as Uuid,
      messageId as Uuid,
    );
  }

  /** One dead letter, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DeadLetter> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
