import { type ApprovalRequest, ApprovalService } from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import { nowIso } from "@knowget/shared";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AI_APPROVE, AI_READ, deciderOf, parseBody, tenantOf } from "./agent-orchestration-http";
import { decisionSchema, expireDueSchema } from "./agent-orchestration.dto";
import { AI_APPROVAL_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for the human gate (P2-D26) — the queue of decisions the runtime is waiting on.
 *
 * The decider is taken from the authenticated principal and is never accepted from the body. An approval whose
 * decider a caller could name is a signature field, not an accountability record; the point of the gate is that
 * the platform can say who decided, not who was typed in.
 *
 * Reading the queue is `ai:read` so an operator can see what is blocked without being able to unblock it.
 */
@Controller("ai/approvals")
export class ApprovalController {
  constructor(@Inject(AI_APPROVAL_SERVICE) private readonly service: ApprovalService) {}

  @RequirePermissions(AI_READ)
  @Get("pending")
  async listPending(@CurrentPrincipal() principal: Principal): Promise<ApprovalRequest[]> {
    return this.service.listPending(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("by-subject/:subject/:subjectId")
  async listBySubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subject") subject: string,
    @Param("subjectId") subjectId: string,
    @Query("openOnly") openOnly?: string,
  ): Promise<ApprovalRequest[]> {
    const tenantId = tenantOf(principal);
    if (openOnly === "true") {
      const open = await this.service.findOpenFor(tenantId, subject, subjectId);
      return open ? [open] : [];
    }
    return this.service.listBySubject(tenantId, subject, subjectId);
  }

  @RequirePermissions(AI_APPROVE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApprovalRequest> {
    const dto = parseBody(decisionSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, {
      decidedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(AI_APPROVE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApprovalRequest> {
    const dto = parseBody(decisionSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      decidedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  /**
   * Expire every pending request whose deadline has passed. Requires `ai:approve` rather than `ai:operate`:
   * expiry closes gates without a decision, which is the same effect on the queue as rejecting them.
   */
  @RequirePermissions(AI_APPROVE)
  @Post("expire-due")
  @HttpCode(200)
  async expireDue(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ApprovalRequest[]> {
    const dto = parseBody(expireDueSchema, body ?? {});
    return this.service.expireDue(tenantOf(principal), (dto.at as ISODateString) ?? nowIso());
  }

  @RequirePermissions(AI_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<ApprovalRequest[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApprovalRequest> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
