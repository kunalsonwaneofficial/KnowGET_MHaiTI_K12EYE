import type { ISODateString, TenantId } from "@knowget/types";
import type { AutomationRun } from "./automation-run";
import { toRunSummaryView } from "./automation-run";
import type { DecisionRecord } from "./decision-record";
import { toDecisionSummaryView } from "./decision-record";
import type { DecisionBacklog, DecisionOperationsSummary } from "./decision-view";
import { summarizeDecisionOperations } from "./metrics";
import type {
  AutomationRuleRepository,
  AutomationRunRepository,
  DecisionRecordRepository,
  RecommendationRepository,
  WorkflowInstanceRepository,
  WorkflowRepository,
} from "./ports";
import { summarizeBacklog } from "./prioritization";
import { toRecommendationPriorityView, toRecommendationSummaryView } from "./recommendation";
import { toInstanceSummaryView } from "./workflow-instance";

/**
 * The read service for institutional decision intelligence: what is outstanding, and how the whole thing is
 * going.
 *
 * It owns no aggregate and changes nothing. Everything it reports is computed by the pure engines from views
 * the aggregates hand out — this class only fetches and composes. That division is the point: the numbers a
 * governance committee is shown are produced by functions a test can call with a literal array, and there is no
 * second implementation of "autonomy rate" living in a query.
 *
 * The two most important reads here are the ones nobody asks for until it is late. `outstandingCompensations`
 * is everything the institution did and declared it could undo but has not undone — the contract's third rule,
 * read as a queue rather than a promise. `approvalQueue` is everything the autonomy gate stopped and handed to
 * a person, which is the first rule read the same way: an approval queue that is quietly growing means the
 * institution has automated something it does not actually have the attention to supervise.
 */
export interface DecisionOperationsServiceDeps {
  readonly recommendations: RecommendationRepository;
  readonly decisions: DecisionRecordRepository;
  readonly workflows: WorkflowRepository;
  readonly instances: WorkflowInstanceRepository;
  readonly rules: AutomationRuleRepository;
  readonly runs: AutomationRunRepository;
}

export class DecisionOperationsService {
  private readonly recommendations: RecommendationRepository;
  private readonly decisions: DecisionRecordRepository;
  private readonly workflows: WorkflowRepository;
  private readonly instances: WorkflowInstanceRepository;
  private readonly rules: AutomationRuleRepository;
  private readonly runs: AutomationRunRepository;

  constructor(deps: DecisionOperationsServiceDeps) {
    this.recommendations = deps.recommendations;
    this.decisions = deps.decisions;
    this.workflows = deps.workflows;
    this.instances = deps.instances;
    this.rules = deps.rules;
    this.runs = deps.runs;
  }

  /**
   * The whole picture in one object: what was proposed and what became of it, how much of it the machine
   * decided alone, how many cases are in flight, and how much is owed a reversal.
   */
  async summarize(tenantId: TenantId): Promise<DecisionOperationsSummary> {
    const [recommendations, decisions, instances, runs, workflows, rules] = await Promise.all([
      this.recommendations.listByTenant(tenantId),
      this.decisions.listByTenant(tenantId),
      this.instances.listByTenant(tenantId),
      this.runs.listByTenant(tenantId),
      this.workflows.listByTenant(tenantId),
      this.rules.listByTenant(tenantId),
    ]);

    return summarizeDecisionOperations({
      recommendations: recommendations.map(toRecommendationSummaryView),
      decisions: decisions.map(toDecisionSummaryView),
      instances: instances.map(toInstanceSummaryView),
      runs: runs.map(toRunSummaryView),
      workflowCount: workflows.length,
      ruleCount: rules.length,
    });
  }

  /**
   * The open backlog as a shape rather than a list — how much is waiting, how much of it has quietly lapsed,
   * and how it distributes across impact and risk. The instant is supplied rather than read from a clock, so
   * the same question asked twice about the same moment gives the same answer.
   */
  async backlog(tenantId: TenantId, asOf: ISODateString): Promise<DecisionBacklog> {
    const open = await this.recommendations.listOpen(tenantId);
    return summarizeBacklog(open.map(toRecommendationPriorityView), asOf);
  }

  /**
   * Everything the institution has done, declared it could undo, and not undone — decisions and automation
   * runs alike, because the obligation is the same whichever produced it.
   */
  async outstandingCompensations(tenantId: TenantId): Promise<OutstandingCompensations> {
    const [decisions, runs] = await Promise.all([
      this.decisions.listCompensationDue(tenantId),
      this.runs.listCompensationDue(tenantId),
    ]);
    return { decisions, runs };
  }

  /** Every automation firing the gate stopped, waiting on a named person. */
  async approvalQueue(tenantId: TenantId): Promise<readonly AutomationRun[]> {
    return this.runs.listAwaitingApproval(tenantId);
  }
}

/** What the institution still owes itself, from both sources at once. */
export interface OutstandingCompensations {
  readonly decisions: readonly DecisionRecord[];
  readonly runs: readonly AutomationRun[];
}
