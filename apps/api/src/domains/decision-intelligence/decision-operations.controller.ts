import type { Principal } from "@knowget/auth";
import {
  type AutomationRun,
  type DecisionBacklog,
  type DecisionOperationsSummary,
  DecisionOperationsService,
  type OutstandingCompensations,
} from "@knowget/decision-intelligence";
import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { Controller, Get, Inject, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { DECISION_READ, parseBody, tenantOf } from "./decision-intelligence-http";
import { asOfSchema } from "./decision-intelligence.dto";
import { DI_OPERATIONS_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for decision operations (P2-D27) — the institution looking at its own decision-making.
 *
 * Every endpoint is `decision:read` and every endpoint is a read. That is the point of the scope being wide: a
 * governor, an auditor or a principal who holds no authority to author rules, fire them or answer for them can
 * still see the whole of what the platform is proposing, running, waiting on and owes a reversal for. Automation
 * an institution cannot look at is automation it has not really decided to run.
 *
 * These are roll-ups over the same aggregates the other controllers write, computed by the domain's own metrics
 * engine rather than by a query — so a number on a dashboard and a number in a test are the same function of the
 * same rows, and nothing here can drift from what the records actually say.
 */
@Controller("decision/operations")
export class DecisionOperationsController {
  constructor(@Inject(DI_OPERATIONS_SERVICE) private readonly service: DecisionOperationsService) {}

  /** The decision layer at a glance: what has been proposed, decided, automated and left outstanding. */
  @RequirePermissions(DECISION_READ)
  @Get("summary")
  async summary(@CurrentPrincipal() principal: Principal): Promise<DecisionOperationsSummary> {
    return this.service.summarize(tenantOf(principal));
  }

  /**
   * The open backlog, rolled up by how long it has been waiting and what it is waiting on.
   *
   * The instant is supplied rather than read from a clock, so "what does this look like at close of business"
   * is answerable without waiting for close of business — and so the queue an administrator is shown and the
   * queue a test asserts on are the same function of the same inputs.
   */
  @RequirePermissions(DECISION_READ)
  @Get("backlog")
  async backlog(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ): Promise<DecisionBacklog> {
    const dto = parseBody(asOfSchema, query);
    return this.service.backlog(tenantOf(principal), (dto.at as ISODateString) ?? nowIso());
  }

  /**
   * Everything the institution has done, declared it could undo, and not undone — from both sources at once.
   *
   * Decisions and automation runs are separate aggregates that answer separately elsewhere on this surface;
   * they are joined here because the question "what do we still owe" is not a question about either of them.
   */
  @RequirePermissions(DECISION_READ)
  @Get("outstanding-compensations")
  async outstandingCompensations(
    @CurrentPrincipal() principal: Principal,
  ): Promise<OutstandingCompensations> {
    return this.service.outstandingCompensations(tenantOf(principal));
  }

  /** What is waiting on a person right now — the queue the contract's first rule creates. */
  @RequirePermissions(DECISION_READ)
  @Get("approval-queue")
  async approvalQueue(@CurrentPrincipal() principal: Principal): Promise<readonly AutomationRun[]> {
    return this.service.approvalQueue(tenantOf(principal));
  }
}
