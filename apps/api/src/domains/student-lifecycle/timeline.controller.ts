import type { Principal } from "@knowget/auth";
import { type TimelineEntry, TimelineService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { recordTimelineSchema } from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_TIMELINE_SERVICE } from "./student-lifecycle.tokens";

/** REST surface for the permanent student timeline (P2-D03). Permission-gated; tenant-scoped. */
@Controller("student-lifecycle/timeline")
export class TimelineController {
  constructor(@Inject(STUDENT_TIMELINE_SERVICE) private readonly service: TimelineService) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<TimelineEntry> {
    const dto = parseBody(recordTimelineSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      organizationId: dto.organizationId as Uuid,
      type: dto.type,
      summary: dto.summary,
      ...(dto.occurredOn !== undefined ? { occurredOn: dto.occurredOn } : {}),
      ...(dto.detail !== undefined ? { detail: dto.detail } : {}),
      ...(dto.sourceEvent !== undefined ? { sourceEvent: dto.sourceEvent } : {}),
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<TimelineEntry[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<TimelineEntry[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<TimelineEntry[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TimelineEntry> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
