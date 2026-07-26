import type { Principal } from "@knowget/auth";
import { type AcknowledgementReceipt, AcknowledgementService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNICATION_READ, COMMUNICATION_WRITE, parseBody, tenantOf } from "./engagement-http";
import { recordAcknowledgementSchema } from "./engagement.dto";
import { EN_ACKNOWLEDGEMENT_SERVICE } from "./engagement.tokens";

/** REST surface for acknowledgement receipts (P2-D22). Gated by communication:*; tenant-scoped. */
@Controller("communication/acknowledgements")
export class AcknowledgementController {
  constructor(
    @Inject(EN_ACKNOWLEDGEMENT_SERVICE) private readonly service: AcknowledgementService,
  ) {}

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcknowledgementReceipt> {
    const dto = parseBody(recordAcknowledgementSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      announcementId: dto.announcementId as Uuid,
      personId: dto.personId as Uuid,
      acknowledgedAt: dto.acknowledgedAt,
    });
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-announcement/:announcementId/count")
  async countForAnnouncement(
    @CurrentPrincipal() principal: Principal,
    @Param("announcementId") announcementId: string,
  ): Promise<{ count: number }> {
    const count = await this.service.countForAnnouncement(
      tenantOf(principal),
      announcementId as Uuid,
    );
    return { count };
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-announcement/:announcementId")
  async listForAnnouncement(
    @CurrentPrincipal() principal: Principal,
    @Param("announcementId") announcementId: string,
  ): Promise<AcknowledgementReceipt[]> {
    return this.service.listForAnnouncement(tenantOf(principal), announcementId as Uuid);
  }
}
