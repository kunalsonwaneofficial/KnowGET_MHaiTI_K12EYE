import type { Principal } from "@knowget/auth";
import {
  type RankedRecommendation,
  type Recommendation,
  RecommendationService,
  citeEvidence,
} from "@knowget/decision-intelligence";
import { nowIso } from "@knowget/shared";
import type { ISODateString, Uuid } from "@knowget/types";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  DECISION_DECIDE,
  DECISION_OPERATE,
  DECISION_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./decision-intelligence-http";
import {
  asOfSchema,
  citeEvidenceSchema,
  raiseRecommendationSchema,
  resolveRecommendationSchema,
  supersedeRecommendationSchema,
} from "./decision-intelligence.dto";
import { DI_RECOMMENDATION_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for recommendations (P2-D27) — everything the platform proposes, and what it proposed it on.
 *
 * This is where the contract's second rule meets the network. A recommendation cannot be raised without a chain
 * that grounds it, every citation is checked to resolve before anything is written, and the chain is minted here
 * by the domain's own {@link citeEvidence} rather than accepted as a caller-shaped object — so an id, a
 * normalized reference and a citation timestamp are the platform's, not the request's.
 *
 * Raising and citing are `decision:operate`; answering is `decision:decide`. That split is deliberate and is the
 * whole reason there are two scopes: the service that proposes something should not also be able to accept it.
 */
@Controller("decision/recommendations")
export class RecommendationController {
  constructor(@Inject(DI_RECOMMENDATION_SERVICE) private readonly service: RecommendationService) {}

  /**
   * Raise a proposal on its root citations.
   *
   * Every citation supplied here is a root — something the recommendation rests on directly. Layered chains are
   * built by raising on the roots and then citing what rests on them through `POST :id/evidence`, using the ids
   * this call returns: `supports` names evidence *by id*, and the ids of a chain being minted in this very
   * request do not exist yet.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post()
  @HttpCode(201)
  async raise(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(raiseRecommendationSchema, body);
    return this.service.raise({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      title: dto.title,
      summary: dto.summary ?? null,
      subjectDomain: dto.subjectDomain,
      subjectId: dto.subjectId,
      impactBand: dto.impactBand,
      riskLevel: dto.riskLevel,
      requiresHumanJudgement: dto.requiresHumanJudgement ?? false,
      evidence: dto.evidence.map((piece) =>
        citeEvidence({
          source: piece.source,
          ref: piece.ref,
          strength: piece.strength,
          note: piece.note ?? null,
        }),
      ),
      proposedByUserId: deciderOf(principal),
      expiresAt: dto.expiresAt ? (dto.expiresAt as ISODateString) : null,
    });
  }

  /**
   * Settle everything whose window has closed with nobody having answered.
   *
   * Requires `decision:decide` rather than `decision:operate`: expiry closes open proposals in bulk without an
   * answer, which has the same effect on the backlog as rejecting them one at a time.
   */
  @RequirePermissions(DECISION_DECIDE)
  @Post("expire-lapsed")
  @HttpCode(200)
  async expireLapsed(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<readonly Recommendation[]> {
    const dto = parseBody(asOfSchema, body);
    return this.service.expireLapsed(tenantOf(principal), (dto.at as ISODateString) ?? nowIso());
  }

  /** Cite one more thing, which may rest on citations already on the chain. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/evidence")
  @HttpCode(200)
  async cite(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(citeEvidenceSchema, body);
    return this.service.cite(tenantOf(principal), id as Uuid, {
      source: dto.source,
      ref: dto.ref,
      strength: dto.strength,
      supports: dto.supports ?? [],
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(DECISION_DECIDE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(resolveRecommendationSchema, body);
    return this.service.accept(tenantOf(principal), id as Uuid, {
      resolvedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(DECISION_DECIDE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(resolveRecommendationSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      resolvedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  /**
   * Take a proposal back. `decision:operate` rather than `decision:decide`, because a withdrawal is not an
   * answer: nothing is decided, no decision record is written, and the institution is left exactly where it was
   * before the proposal was raised. It is the way out of a justification that no longer holds, which is a
   * question about the evidence rather than about the recommendation's merits.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(resolveRecommendationSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, {
      resolvedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  /** A revision replaced it. The successor is loaded before the link is recorded, never taken on trust. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/supersede")
  @HttpCode(200)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(supersedeRecommendationSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, dto.successorId as Uuid);
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly Recommendation[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(DECISION_READ)
  @Get("open")
  async listOpen(@CurrentPrincipal() principal: Principal): Promise<readonly Recommendation[]> {
    return this.service.listOpen(tenantOf(principal));
  }

  /**
   * The open backlog in the order it deserves attention. The instant is a query parameter rather than a clock
   * read, so the queue an administrator is shown and the queue a test asserts on are the same function of the
   * same inputs — and so "what will this look like at close of business" is answerable without waiting.
   */
  @RequirePermissions(DECISION_READ)
  @Get("prioritized")
  async prioritized(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ): Promise<readonly RankedRecommendation[]> {
    const dto = parseBody(asOfSchema, query);
    return this.service.prioritized(tenantOf(principal), (dto.at as ISODateString) ?? nowIso());
  }

  /** Everything ever raised about one subject — the whole story of one student, in one read. */
  @RequirePermissions(DECISION_READ)
  @Get("by-subject/:subjectDomain/:subjectId")
  async listBySubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectDomain") subjectDomain: string,
    @Param("subjectId") subjectId: string,
  ): Promise<readonly Recommendation[]> {
    return this.service.listBySubject(tenantOf(principal), subjectDomain, subjectId);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Recommendation> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /**
   * Take a citation back. Refused by the aggregate when what remains would no longer ground the recommendation:
   * a chain is not a list a caller may prune down to nothing while the proposal it justified stays open.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Delete(":id/evidence/:evidenceId")
  @HttpCode(200)
  async retract(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("evidenceId") evidenceId: string,
  ): Promise<Recommendation> {
    return this.service.retract(tenantOf(principal), id as Uuid, evidenceId);
  }
}
