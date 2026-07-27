import type { Principal } from "@knowget/auth";
import { type Assertion, AssertionService, type ProvenanceReport } from "@knowget/knowledge-graph";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { KNOWLEDGE_READ, KNOWLEDGE_WRITE, parseBody, tenantOf } from "./knowledge-graph-http";
import { makeAssertionSchema } from "./knowledge-graph.dto";
import { KG_ASSERTION_SERVICE } from "./knowledge-graph.tokens";

/** REST surface for assertions (P2-D25) — the evidence chain, with explainability. knowledge:*; tenant-scoped. */
@Controller("knowledge/assertions")
export class AssertionController {
  constructor(@Inject(KG_ASSERTION_SERVICE) private readonly service: AssertionService) {}

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post()
  @HttpCode(201)
  async make(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Assertion> {
    const dto = parseBody(makeAssertionSchema, body);
    return this.service.make({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subjectKind: dto.subjectKind,
      subjectId: dto.subjectId as Uuid,
      predicate: dto.predicate,
      value: dto.value,
      method: dto.method,
      confidence: dto.confidence,
      evidenceSource: dto.evidenceSource ?? null,
      evidenceRef: dto.evidenceRef ?? null,
      derivedFrom: (dto.derivedFrom ?? []) as Uuid[],
      assertedOn: dto.assertedOn,
    });
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/retract")
  @HttpCode(200)
  async retract(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assertion> {
    return this.service.retract(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get("by-subject/:subjectKind/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectKind") subjectKind: string,
    @Param("subjectId") subjectId: string,
  ): Promise<Assertion[]> {
    const kind = subjectKind === "relationship" ? "relationship" : "entity";
    return this.service.listForSubject(tenantOf(principal), kind, subjectId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":id/explain")
  async explain(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ProvenanceReport> {
    return this.service.explainAssertion(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assertion> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
