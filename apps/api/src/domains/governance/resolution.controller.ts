import type { Principal } from "@knowget/auth";
import { type Resolution, ResolutionService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import {
  draftResolutionSchema,
  implementResolutionSchema,
  tallyResolutionSchema,
  voteSchema,
} from "./governance.dto";
import { GOVERNANCE_RESOLUTION_SERVICE } from "./governance.tokens";

/** REST surface for resolutions (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/resolutions")
export class ResolutionController {
  constructor(@Inject(GOVERNANCE_RESOLUTION_SERVICE) private readonly service: ResolutionService) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Resolution> {
    const dto = parseBody(draftResolutionSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      governanceBodyId: dto.governanceBodyId as Uuid,
      title: dto.title,
      proposalText: dto.proposalText,
      proposedById: dto.proposedById as Uuid,
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Resolution[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-body/:governanceBodyId")
  async listForGovernanceBody(
    @CurrentPrincipal() principal: Principal,
    @Param("governanceBodyId") governanceBodyId: string,
  ): Promise<Resolution[]> {
    return this.service.listForGovernanceBody(tenantOf(principal), governanceBodyId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resolution> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async openVoting(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resolution> {
    return this.service.openVoting(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/votes")
  @HttpCode(200)
  async vote(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resolution> {
    const dto = parseBody(voteSchema, body);
    return this.service.vote(tenantOf(principal), id as Uuid, {
      voterId: dto.voterId as Uuid,
      decision: dto.decision,
      ...(dto.castOn !== undefined ? { castOn: dto.castOn } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/tally")
  @HttpCode(200)
  async tally(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resolution> {
    const dto = parseBody(tallyResolutionSchema, body);
    return this.service.tally(tenantOf(principal), id as Uuid, {
      ...(dto.effectiveOn !== undefined ? { effectiveOn: dto.effectiveOn } : {}),
      ...(dto.decidedOn !== undefined ? { decidedOn: dto.decidedOn } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/implement")
  @HttpCode(200)
  async implement(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resolution> {
    const dto = parseBody(implementResolutionSchema, body);
    return this.service.implement(
      tenantOf(principal),
      id as Uuid,
      dto.implementedOn !== undefined ? dto.implementedOn : null,
    );
  }
}
