import type { Principal } from "@knowget/auth";
import { type ImprovementSignal, ImprovementSignalService } from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_CONTRIBUTE,
  EVOLUTION_MANAGE,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import {
  corroborateSignalSchema,
  declineSignalSchema,
  mergeSignalSchema,
  raiseSignalSchema,
  restateSignalSchema,
} from "./platform-evolution.dto";
import { PE_SIGNAL_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for improvement signals (P2-D30) — the things an institution has been told about itself.
 *
 * A signal is an observation with evidence attached, not a decision and not a change. Raising one commits the
 * institution to nothing except having heard it, which is exactly why raising is the cheapest act in this
 * domain and disposing of one is not: a signal leaves the queue only as accepted, merged into the signal it
 * duplicates, or declined with a reason and a name against it.
 *
 * The scope split follows that asymmetry. Raising, restating and corroborating sit under `evolution:contribute`
 * because an institution that cannot hear from its own staff has no improvement process worth the name, and a
 * scope narrow enough to be granted widely is what makes the queue real. Triage and disposal sit under
 * `evolution:manage`, because those are the acts that decide what the institution does about what it heard.
 *
 * Two identities are taken from the principal rather than the body — the person raising and the holder of a
 * corroborating account — and both matter for the same reason. The counts on a signal are counts of *people*,
 * and a body-supplied name would let one caller manufacture the appearance of a widely-felt problem or file an
 * unattributed complaint from an authenticated session.
 */
@Controller("evolution/signals")
export class ImprovementSignalController {
  constructor(@Inject(PE_SIGNAL_SERVICE) private readonly service: ImprovementSignalService) {}

  /** Tell the institution something, with the evidence that makes it more than an assertion. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post()
  @HttpCode(201)
  async raise(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ImprovementSignal> {
    const dto = parseBody(raiseSignalSchema, body);
    return this.service.raise({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      signalKey: dto.signalKey,
      source: dto.source,
      summary: dto.summary,
      citations: dto.citations.map((citation) => ({
        ...citation,
        attestedBy: citation.attestedBy ?? null,
      })),
      raisedBy: actorOf(principal),
    });
  }

  /** Say it better. Admissible while the signal is still open, which is the aggregate's rule to hold. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/restate")
  @HttpCode(200)
  async restate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementSignal> {
    const dto = parseBody(restateSignalSchema, body);
    return this.service.restate(tenantOf(principal), id as Uuid, dto.summary);
  }

  /**
   * Add another account of the same thing. This is the mechanism by which a signal's priority rises without
   * anybody deciding to raise it: persistence is measured in distinct people, and a second account from someone
   * who has already spoken is counted as a repeat rather than as corroboration.
   */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/corroborate")
  @HttpCode(200)
  async corroborate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementSignal> {
    const dto = parseBody(corroborateSignalSchema, body);
    return this.service.corroborate(tenantOf(principal), id as Uuid, {
      raisedBy: actorOf(principal),
      source: dto.source,
    });
  }

  /** Record that somebody has read this and judged it. The only route to any of the three disposals. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/triage")
  @HttpCode(200)
  async triage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementSignal> {
    return this.service.triage(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Accept it as something the institution will answer. Accepting is not yet proposing a change. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementSignal> {
    return this.service.accept(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Fold it into the signal it duplicates, which is how the same problem told twice stops being two problems. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/merge")
  @HttpCode(200)
  async merge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementSignal> {
    const dto = parseBody(mergeSignalSchema, body);
    return this.service.merge(
      tenantOf(principal),
      id as Uuid,
      dto.mergedIntoSignalId as Uuid,
      actorOf(principal),
    );
  }

  /**
   * Decline it, with the reason that is the only compulsory free text on a signal. The reason is what the
   * declined signal carries when the same problem is raised again against the same key — which is the whole of
   * how this domain answers recurrence.
   */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/decline")
  @HttpCode(200)
  async decline(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementSignal> {
    const dto = parseBody(declineSignalSchema, body);
    return this.service.decline(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /** Every signal in the tenant. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ImprovementSignal[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The improvement queue — raised and triaged alike, oldest first. Age is the sort because age is the failure:
   * the signal that has waited longest is the one nobody has dealt with.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("open/:organizationId")
  async listOpen(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ImprovementSignal[]> {
    return this.service.listOpen(tenantOf(principal), organizationId as Uuid);
  }

  /** One signal by key, including a settled one — which is how a repeat raising finds the earlier answer. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-key/:signalKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("signalKey") signalKey: string,
  ): Promise<ImprovementSignal> {
    return this.service.getByKey(tenantOf(principal), signalKey);
  }

  /** One signal, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementSignal> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
