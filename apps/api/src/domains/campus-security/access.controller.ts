import type { Principal } from "@knowget/auth";
import {
  type AccessActivitySummary,
  AccessDecisionService,
  type AccessEvent,
  AccessEventService,
} from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import { decideAccessSchema } from "./campus-security.dto";
import { CS_ACCESS_DECISION_SERVICE, CS_ACCESS_EVENT_SERVICE } from "./campus-security.tokens";

/**
 * REST surface for access decisions and the immutable access log (P2-D21). Gated by security:*;
 * tenant-scoped. `decide` is the access-control integration spine: it evaluates a credential at a zone via
 * the pure engine and appends the decision to the door log.
 */
@Controller("security/access")
export class AccessController {
  constructor(
    @Inject(CS_ACCESS_DECISION_SERVICE) private readonly decisions: AccessDecisionService,
    @Inject(CS_ACCESS_EVENT_SERVICE) private readonly events: AccessEventService,
  ) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post("decide")
  @HttpCode(201)
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AccessEvent> {
    const dto = parseBody(decideAccessSchema, body);
    return this.decisions.decide({
      tenantId: tenantOf(principal),
      credentialId: dto.credentialId as Uuid,
      zoneId: dto.zoneId as Uuid,
      pointLabel: dto.pointLabel,
      occurredAt: dto.occurredAt,
      asOfDate: dto.asOfDate,
    });
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-credential/:credentialId")
  async listForCredential(
    @CurrentPrincipal() principal: Principal,
    @Param("credentialId") credentialId: string,
  ): Promise<AccessEvent[]> {
    return this.events.listForCredential(tenantOf(principal), credentialId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-zone/:zoneId/summary")
  async summarizeForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<AccessActivitySummary> {
    return this.events.summarizeForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-zone/:zoneId")
  async listForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<AccessEvent[]> {
    return this.events.listForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessEvent | null> {
    return this.events.getById(tenantOf(principal), id as Uuid);
  }
}
