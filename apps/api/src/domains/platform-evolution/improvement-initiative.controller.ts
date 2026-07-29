import type { Principal } from "@knowget/auth";
import {
  type ImprovementInitiative,
  ImprovementInitiativeService,
} from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_CONTRIBUTE,
  EVOLUTION_GOVERN,
  EVOLUTION_MANAGE,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import {
  adoptInitiativeSchema,
  proposeInitiativeSchema,
  reclassifyInitiativeSchema,
  restateInitiativeSchema,
  startPilotSchema,
  withdrawInitiativeSchema,
} from "./platform-evolution.dto";
import { PE_INITIATIVE_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for improvement initiatives (P2-D30) — proposed changes to how the institution works.
 *
 * The lifecycle here is the contract's second rule made operational: nothing on this surface changes the
 * institution, and the two steps that acknowledge a change has taken effect — approval and adoption — are
 * refused unless a governance gate satisfied first. `approve` does not decide anything; it records that the
 * approval gate cleared. `adopt` does not deploy anything; it records that the institution now works this way.
 * The platform never moves on its own, which is why there is no route here that could make it.
 *
 * Three scopes divide the lifecycle along the lines of who bears the consequence. Proposing, restating,
 * reclassifying and submitting sit under `evolution:contribute` — writing down an idea and putting it forward
 * are things the people doing the work should be able to do. Starting a review, opening a pilot and withdrawing
 * sit under `evolution:manage`, because those are scheduling acts with cost attached. Approval, rejection and
 * adoption sit under `evolution:govern`, because those are the three moments where the institution's answer
 * becomes binding.
 *
 * `reclassify` is admissible only on a draft, and the aggregate is what holds that: the change class decides
 * how many people must agree, so a class editable after submission would let a structural change be walked down
 * to a clarification and cleared by one signature.
 */
@Controller("evolution/initiatives")
export class ImprovementInitiativeController {
  constructor(
    @Inject(PE_INITIATIVE_SERVICE) private readonly service: ImprovementInitiativeService,
  ) {}

  /**
   * Put a change forward. The originating signals are the claim that this answers something somebody filed, and
   * they are fixed here: an initiative whose stated provenance could be adjusted after a gate approved it would
   * make the lineage report a statement about the present rather than about the proposal.
   */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post()
  @HttpCode(201)
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(proposeInitiativeSchema, body);
    return this.service.propose({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      initiativeKey: dto.initiativeKey,
      changeClass: dto.changeClass,
      summary: dto.summary,
      originatingSignalIds: dto.originatingSignalIds as Uuid[],
      proposedBy: actorOf(principal),
    });
  }

  /** Say it better, while it is still a proposal. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/restate")
  @HttpCode(200)
  async restate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(restateInitiativeSchema, body);
    return this.service.restate(tenantOf(principal), id as Uuid, dto.summary);
  }

  /** Correct the blast radius. Drafts only — after submission the class is what the quorum was set from. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/reclassify")
  @HttpCode(200)
  async reclassify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(reclassifyInitiativeSchema, body);
    return this.service.reclassify(tenantOf(principal), id as Uuid, dto.changeClass);
  }

  /** Put the proposal forward. The moment the class, and the quorum it implies, stop moving. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementInitiative> {
    return this.service.submit(tenantOf(principal), id as Uuid);
  }

  /** Take it up for review. A scheduling act, and the point at which the approval gate becomes convokable. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/review")
  @HttpCode(200)
  async startReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementInitiative> {
    return this.service.startReview(tenantOf(principal), id as Uuid);
  }

  /**
   * Record that the approval gate cleared. The gate is read rather than trusted — this route cannot approve
   * anything on its own, and calling it against an unsatisfied gate is refused by the service.
   */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementInitiative> {
    return this.service.approve(tenantOf(principal), id as Uuid);
  }

  /** Record that the institution said no. A rejected initiative stays, because deciding not to is a decision. */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementInitiative> {
    return this.service.reject(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Begin the trial, from the period it starts. The period is what the pilot's minimum length is measured on. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/pilot")
  @HttpCode(200)
  async startPilot(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(startPilotSchema, body);
    return this.service.startPilot(tenantOf(principal), id as Uuid, dto.startPeriod);
  }

  /**
   * Record that this is now how the institution works. The pilot-exit gate is read the same way the approval
   * gate is, and the pilot's length is checked against the period named here — a trial cut short to reach a
   * conclusion faster is refused by the aggregate rather than argued about afterwards.
   */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post(":id/adopt")
  @HttpCode(200)
  async adopt(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(adoptInitiativeSchema, body);
    return this.service.adopt(tenantOf(principal), id as Uuid, dto.asOfPeriod, actorOf(principal));
  }

  /** Withdraw it, with the reason that is the only compulsory free text on an initiative. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementInitiative> {
    const dto = parseBody(withdrawInitiativeSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /** Every initiative in the tenant. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ImprovementInitiative[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What is in flight — drafts, submissions, reviews and pilots, oldest first. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("open/:organizationId")
  async listOpen(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ImprovementInitiative[]> {
    return this.service.listOpen(tenantOf(principal), organizationId as Uuid);
  }

  /** What the institution actually changed — the worklist adoption reviews are drawn from, oldest first. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("adopted/:organizationId")
  async listAdopted(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ImprovementInitiative[]> {
    return this.service.listAdopted(tenantOf(principal), organizationId as Uuid);
  }

  /** One initiative by key. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-key/:initiativeKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("initiativeKey") initiativeKey: string,
  ): Promise<ImprovementInitiative> {
    return this.service.getByKey(tenantOf(principal), initiativeKey);
  }

  /** One initiative, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementInitiative> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
