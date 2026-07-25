import {
  type AttendanceEvaluationResult,
  AttendanceEvaluationService,
  type PresenceProfile,
} from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import { organizationScopeSchema } from "./attendance-presence.dto";
import { AP_EVALUATION_SERVICE } from "./attendance-presence.tokens";

/**
 * REST surface for attendance analytics (P2-D08) — evaluates a participant against the active
 * policies and recomputes their presence profile. Both operations run the pure engines over
 * persisted aggregates and publish the resulting domain events. Gated by attendance:*;
 * tenant-scoped.
 */
@Controller("attendance-presence/participants")
export class AttendanceAnalyticsController {
  constructor(
    @Inject(AP_EVALUATION_SERVICE) private readonly service: AttendanceEvaluationService,
  ) {}

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":participantId/evaluate")
  @HttpCode(200)
  async evaluate(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
    @Body() body: unknown,
  ): Promise<AttendanceEvaluationResult> {
    const dto = parseBody(organizationScopeSchema, body);
    return this.service.evaluate(
      tenantOf(principal),
      dto.organizationId as Uuid,
      participantId as Uuid,
    );
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":participantId/recompute-presence")
  @HttpCode(200)
  async recomputePresence(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
    @Body() body: unknown,
  ): Promise<PresenceProfile> {
    const dto = parseBody(organizationScopeSchema, body);
    return this.service.recomputePresence(
      tenantOf(principal),
      dto.organizationId as Uuid,
      participantId as Uuid,
    );
  }
}
