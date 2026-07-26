import type { Principal } from "@knowget/auth";
import { type Message, MessageService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNICATION_READ, COMMUNICATION_WRITE, parseBody, tenantOf } from "./engagement-http";
import { postMessageSchema } from "./engagement.dto";
import { EN_MESSAGE_SERVICE } from "./engagement.tokens";

/** REST surface for messages (P2-D22). Gated by communication:*; tenant-scoped. */
@Controller("communication/messages")
export class MessageController {
  constructor(@Inject(EN_MESSAGE_SERVICE) private readonly service: MessageService) {}

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post()
  @HttpCode(201)
  async post(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Message> {
    const dto = parseBody(postMessageSchema, body);
    return this.service.post({
      tenantId: tenantOf(principal),
      threadId: dto.threadId as Uuid,
      authorPersonId: dto.authorPersonId as Uuid,
      body: dto.body,
      sentAt: dto.sentAt,
    });
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-thread/:threadId/count")
  async countForThread(
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
  ): Promise<{ count: number }> {
    const count = await this.service.countForThread(tenantOf(principal), threadId as Uuid);
    return { count };
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-thread/:threadId")
  async listForThread(
    @CurrentPrincipal() principal: Principal,
    @Param("threadId") threadId: string,
  ): Promise<Message[]> {
    return this.service.listForThread(tenantOf(principal), threadId as Uuid);
  }
}
