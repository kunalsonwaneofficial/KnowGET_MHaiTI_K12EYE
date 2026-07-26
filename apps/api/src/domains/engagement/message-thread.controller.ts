import type { Principal } from "@knowget/auth";
import { type MessageThread, MessageThreadService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNICATION_READ, COMMUNICATION_WRITE, parseBody, tenantOf } from "./engagement-http";
import { addThreadParticipantSchema, openThreadSchema } from "./engagement.dto";
import { EN_THREAD_SERVICE } from "./engagement.tokens";

/** REST surface for message threads (P2-D22). Gated by communication:*; tenant-scoped. */
@Controller("communication/threads")
export class MessageThreadController {
  constructor(@Inject(EN_THREAD_SERVICE) private readonly service: MessageThreadService) {}

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MessageThread> {
    const dto = parseBody(openThreadSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subject: dto.subject,
      participantPersonIds: dto.participantPersonIds as Uuid[],
    });
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/participants")
  @HttpCode(200)
  async addParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MessageThread> {
    const dto = parseBody(addThreadParticipantSchema, body);
    return this.service.addParticipant(tenantOf(principal), id as Uuid, dto.personId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MessageThread> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/reopen")
  @HttpCode(200)
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MessageThread> {
    return this.service.reopen(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MessageThread> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-participant/:personId")
  async listForParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<MessageThread[]> {
    return this.service.listForParticipant(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<MessageThread[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MessageThread> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
