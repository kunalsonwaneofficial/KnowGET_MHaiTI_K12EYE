import type { Principal } from "@knowget/auth";
import { type ComfortAssessment, ComfortAssessmentService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENVIRONMENT_READ, tenantOf } from "./facilities-http";
import { FAC_COMFORT_ASSESSMENT_SERVICE } from "./facilities.tokens";

/**
 * REST surface for the live comfort assessment (P2-D20) — the smart-environment integration spine. Gated by
 * environment:read; tenant-scoped. A pure read: it measures a space's latest readings against its
 * organization's active comfort policy via the pure engine.
 */
@Controller("environment/comfort")
export class ComfortAssessmentController {
  constructor(
    @Inject(FAC_COMFORT_ASSESSMENT_SERVICE) private readonly service: ComfortAssessmentService,
  ) {}

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("space/:spaceId")
  async assessSpace(
    @CurrentPrincipal() principal: Principal,
    @Param("spaceId") spaceId: string,
  ): Promise<ComfortAssessment> {
    return this.service.assessSpace(tenantOf(principal), spaceId as Uuid);
  }
}
