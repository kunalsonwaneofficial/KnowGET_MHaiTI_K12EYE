import type { Principal } from "@knowget/auth";
import {
  type GovernanceDecision,
  GovernanceDecisionService,
  type GovernanceGate,
} from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_GOVERN,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import { castBallotSchema, convokeGateSchema } from "./platform-evolution.dto";
import { PE_DECISION_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for governance gates (P2-D30) — where the institution says yes, and who said it.
 *
 * This is the surface the contract's rule rests on. Nothing in this domain changes how the institution works
 * without a gate clearing here first, and a gate clears only when a required number of distinct named people
 * have recorded a verdict with a rationale. There is no route that clears a gate, no route that decides on
 * anybody's behalf, and no route that lets a recommendation become an approval by being convincing.
 *
 * Convening and voting sit under `evolution:govern`; the reads sit under `evolution:read` with the rest of the
 * domain. Narrowing the reads was considered and rejected, because the concern it would answer — deciders
 * seeing each other's ballots and voting to the room — is not one a scope can fix: everyone able to vote holds
 * `evolution:govern` and would see the trail anyway. This is an open-ballot model by construction, every verdict
 * carrying its decider and rationale, and the only thing a narrow read scope would actually accomplish is
 * hiding the governance record from everyone who is not a governor. That is the opposite of what the record is
 * for. The person who raised the signal is entitled to follow it through to the decision it produced.
 *
 * The decider is taken from the principal and is not a body field. A gate clears on a count of *distinct
 * people*, so a body-supplied decider would let one caller holding this scope clear a three-decider gate by
 * naming two colleagues — and the person directory cannot catch it, because the colleagues exist. The proposer
 * still travels in the body, because the proposer-may-not-decide rule needs to know who put the change forward,
 * and that is usually not the person convening the gate.
 */
@Controller("evolution/gates")
export class GovernanceDecisionController {
  constructor(@Inject(PE_DECISION_SERVICE) private readonly service: GovernanceDecisionService) {}

  /**
   * Open a gate in front of a change. The quorum is fixed here from the subject's own change class — for the
   * three initiative gates the service reads it off the initiative rather than believing the body, so a caller
   * cannot lower the bar by declaring a structural change a clarification on the way in.
   */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post()
  @HttpCode(201)
  async convoke(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<GovernanceDecision> {
    const dto = parseBody(convokeGateSchema, body);
    return this.service.convoke({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      initiativeId: dto.initiativeId as Uuid,
      gate: dto.gate,
      changeClass: dto.changeClass,
      proposedBy: dto.proposedBy as Uuid,
      convokedBy: actorOf(principal),
    });
  }

  /**
   * One person's verdict, with the rationale that is compulsory on every ballot including an approval. Requiring
   * a reason for yes is the whole difference between a decision record and a tally: an approval nobody had to
   * explain is indistinguishable, a year later, from an approval nobody thought about.
   */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post(":id/ballots")
  @HttpCode(200)
  async cast(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceDecision> {
    const dto = parseBody(castBallotSchema, body);
    return this.service.cast(tenantOf(principal), id as Uuid, {
      deciderId: actorOf(principal),
      verdict: dto.verdict,
      rationale: dto.rationale,
      conditions: dto.conditions,
    });
  }

  /** Every gate in the tenant, grouped by the change they stand in front of. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly GovernanceDecision[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The governance trail for one change, in the order the gates were opened. Approval, pilot exit and reversion
   * read as a sequence because that is what they are — the record of an institution changing its mind, or
   * declining to.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-initiative/:initiativeId")
  async listByInitiative(
    @CurrentPrincipal() principal: Principal,
    @Param("initiativeId") initiativeId: string,
  ): Promise<readonly GovernanceDecision[]> {
    return this.service.listByInitiative(tenantOf(principal), initiativeId as Uuid);
  }

  /**
   * Where this change stands at one named gate, or null.
   *
   * Nullable rather than a 404 because the absence is a legitimate and common answer — most changes never face
   * a reversion gate at all, and *nobody has been asked yet* is exactly what a caller checking whether a change
   * can advance needs to be told. Settled gates answer here too: a caller asking about `approval` wants the
   * decision the institution reached, not silence because it has already been reached. An unrecognised gate
   * name is the same null for the same reason, since the service filters the trail by name rather than looking
   * anything up — there is no gate of that name here, which is what the caller asked.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-initiative/:initiativeId/gate/:gate")
  async findGate(
    @CurrentPrincipal() principal: Principal,
    @Param("initiativeId") initiativeId: string,
    @Param("gate") gate: string,
  ): Promise<GovernanceDecision | null> {
    return this.service.findGate(tenantOf(principal), initiativeId as Uuid, gate as GovernanceGate);
  }

  /** One gate, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceDecision> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
