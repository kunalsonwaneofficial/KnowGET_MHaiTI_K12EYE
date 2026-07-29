import type { Principal } from "@knowget/auth";
import { type AttentionItem, AttentionItemService } from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  COMMAND_OPERATE,
  COMMAND_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./executive-intelligence-http";
import {
  dismissAttentionSchema,
  raiseAttentionSchema,
  resolveAttentionSchema,
  restateAttentionSchema,
  sweepAttentionSchema,
} from "./executive-intelligence.dto";
import { EI_ATTENTION_ITEM_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for the attention queue (P2-D29) — what a period's arithmetic is asking somebody to go and look at.
 *
 * This is the only controller in the domain whose routes record a name. Acknowledgement, resolution and dismissal
 * are governance acts rather than data edits: each one says a person looked at a finding and decided something
 * about it, and the actor is taken from the authenticated principal rather than from the request, because an
 * accountability trail a caller could address to anybody is a field rather than a trail.
 *
 * Closure is by judgement and never by deletion. A finding the institution acted on is resolved, a finding that
 * should not have been raised is dismissed with a compulsory reason, and both stay on the record — the next
 * period's sweep is how this contract checks its own advice, and it cannot corroborate or contradict a decision
 * that was erased. That is also why {@link sweep} leaves closed items untouched: reopening one would delete the
 * evidence that a human looked, which is the only thing separating a queue from a stream of alerts.
 *
 * The queue reads loudest first, ranked by the domain rather than by the caller. An unordered queue is a list,
 * and the one thing a queue owes whoever opens it is that the top of it is the thing to do next.
 */
@Controller("command/attention")
export class AttentionItemController {
  constructor(@Inject(EI_ATTENTION_ITEM_SERVICE) private readonly service: AttentionItemService) {}

  /**
   * Run one assessment's raising engines and return the queue they produced.
   *
   * `200` rather than `201`, and it is not a formality: a sweep is idempotent by restatement, so the second run
   * of a period usually creates nothing at all. It restates findings that deteriorated, leaves closed ones alone,
   * and returns the whole queue either way — reporting a creation would misdescribe the ordinary case.
   *
   * The assessment is named in the body rather than the path because a sweep is a command against a period's
   * arithmetic and not a sub-resource read of it, and the distinction is what keeps this off the read scope.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post("sweep")
  @HttpCode(200)
  async sweep(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<readonly AttentionItem[]> {
    const dto = parseBody(sweepAttentionSchema, body);
    return this.service.sweep(tenantOf(principal), dto.assessmentId as Uuid);
  }

  /**
   * Put a finding on a period's queue by hand, beside the ones the arithmetic derived.
   *
   * The assessment is compulsory because an item is a finding *about a computed period* — one raised against
   * nothing would be a task list wearing a governance queue's clothes, and it would be swept alongside findings
   * that can be traced back to numbers. The domain refuses a key the period already holds rather than restating
   * it: a caller who meant to update an existing finding is holding the wrong operation, and doing the other one
   * for them would hide that they did not know the finding was already there.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post()
  @HttpCode(201)
  async raise(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AttentionItem> {
    const dto = parseBody(raiseAttentionSchema, body);
    return this.service.raise(tenantOf(principal), dto.assessmentId as Uuid, dto.signal);
  }

  /**
   * Update an open finding from a fresh raising of itself. Severity and observed quantity move; identity does
   * not — a problem that got worse is the same problem, and a restatement that could change the subject would let
   * a queue position outlive the thing it was raised about.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/restate")
  @HttpCode(200)
  async restate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AttentionItem> {
    const dto = parseBody(restateAttentionSchema, body);
    return this.service.restate(tenantOf(principal), id as Uuid, dto.signal);
  }

  /**
   * Say that somebody has picked this up.
   *
   * The actor is the authenticated principal and takes no body at all. From `open` only, so the interval between
   * raising and acknowledgement stays a measure of how long the institution left a finding unattended rather than
   * of how often somebody re-pressed a button.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/acknowledge")
  @HttpCode(200)
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttentionItem> {
    return this.service.acknowledge(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /**
   * Close a finding because the institution dealt with it. The note is optional: what corroborates a resolution
   * is the next period's assessment rather than the sentence somebody typed while closing it.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/resolve")
  @HttpCode(200)
  async resolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AttentionItem> {
    const dto = parseBody(resolveAttentionSchema, body);
    return this.service.resolve(
      tenantOf(principal),
      id as Uuid,
      actorOf(principal),
      dto.note ?? null,
    );
  }

  /**
   * Close a finding because it should not have been raised.
   *
   * The reason is compulsory, unlike a resolution's note. Dismissing is the one closure that says the institution
   * looked at what its own arithmetic produced and decided it did not matter, and the reason is the only feedback
   * anyone tuning these engines will ever get — a queue of unexplained dismissals is indistinguishable from a
   * queue nobody reads.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/dismiss")
  @HttpCode(200)
  async dismiss(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AttentionItem> {
    const dto = parseBody(dismissAttentionSchema, body);
    return this.service.dismiss(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly AttentionItem[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What an organization is currently being asked to look at, loudest first. */
  @RequirePermissions(COMMAND_READ)
  @Get("open/:organizationId")
  async listOpen(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly AttentionItem[]> {
    return this.service.listOpen(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * Everything one period's arithmetic raised, closed items included, loudest first. Closed items are part of the
   * answer rather than noise in it: this is the read that shows what a period asked for and what the institution
   * did about it, and a version that hid the closures would only ever show the unfinished half.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-assessment/:assessmentId")
  async listByAssessment(
    @CurrentPrincipal() principal: Principal,
    @Param("assessmentId") assessmentId: string,
  ): Promise<readonly AttentionItem[]> {
    return this.service.listByAssessment(tenantOf(principal), assessmentId as Uuid);
  }

  @RequirePermissions(COMMAND_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttentionItem> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
