import { type AttendanceRecord, AttendanceRecordService } from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_READ, ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import {
  amendRemarksSchema,
  bulkRecordSchema,
  correctSchema,
  recordSchema,
} from "./attendance-presence.dto";
import { AP_RECORD_SERVICE } from "./attendance-presence.tokens";

/** REST surface for attendance records (P2-D08). Gated by attendance:*; tenant-scoped. */
@Controller("attendance-presence/records")
export class AttendanceRecordController {
  constructor(@Inject(AP_RECORD_SERVICE) private readonly service: AttendanceRecordService) {}

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AttendanceRecord> {
    const dto = parseBody(recordSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      sessionId: dto.sessionId as Uuid,
      participantId: dto.participantId as Uuid,
      participantType: dto.participantType,
      status: dto.status,
      method: dto.method,
      ...(dto.recordedBy !== undefined ? { recordedBy: dto.recordedBy as Uuid } : {}),
      ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
    });
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post("bulk")
  @HttpCode(201)
  async bulkRecord(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AttendanceRecord[]> {
    const dto = parseBody(bulkRecordSchema, body);
    return this.service.bulkRecord({
      tenantId: tenantOf(principal),
      sessionId: dto.sessionId as Uuid,
      method: dto.method,
      ...(dto.recordedBy !== undefined ? { recordedBy: dto.recordedBy as Uuid } : {}),
      entries: dto.entries.map((entry) => ({
        participantId: entry.participantId as Uuid,
        participantType: entry.participantType,
        status: entry.status,
        ...(entry.remarks !== undefined ? { remarks: entry.remarks } : {}),
      })),
    });
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-session/:sessionId")
  async listForSession(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId") sessionId: string,
  ): Promise<AttendanceRecord[]> {
    return this.service.listForSession(tenantOf(principal), sessionId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-participant/:participantId")
  async listForParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
  ): Promise<AttendanceRecord[]> {
    return this.service.listForParticipant(tenantOf(principal), participantId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttendanceRecord> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/correct")
  @HttpCode(200)
  async correct(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AttendanceRecord> {
    const dto = parseBody(correctSchema, body);
    return this.service.correct(
      tenantOf(principal),
      id as Uuid,
      dto.toStatus,
      dto.reason,
      (dto.correctedBy as Uuid | undefined) ?? null,
    );
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/remarks")
  @HttpCode(200)
  async amendRemarks(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AttendanceRecord> {
    const dto = parseBody(amendRemarksSchema, body);
    return this.service.amendRemarks(tenantOf(principal), id as Uuid, dto.remarks);
  }
}
