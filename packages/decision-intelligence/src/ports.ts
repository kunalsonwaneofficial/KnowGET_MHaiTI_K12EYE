import type { TenantId, Uuid } from "@knowget/types";
import type { EvidenceSource } from "./decision-value";
import type { Recommendation } from "./recommendation";
import type { DecisionRecord } from "./decision-record";
import type { WorkflowDefinition } from "./workflow";
import type { WorkflowInstance } from "./workflow-instance";
import type { AutomationRule } from "./automation-rule";
import type { AutomationRun } from "./automation-run";

/**
 * The storage and directory contracts institutional decision intelligence depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond this domain's own records except the three directories, which are read models
 * rather than dependencies — this domain never imports another domain package.
 *
 * Only definitions can be removed. A workflow version and an automation rule are things an institution
 * maintains, so they can be taken away; a recommendation, a decision, a case and a run are the record of what
 * was proposed, decided, done and undone, and deleting those would make the audit trail an opinion. The
 * aggregates give every one of them a way out that leaves the history intact — withdrawn, cancelled, retired,
 * compensated — which is what a `remove` would otherwise be reached for.
 */

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * recommendation, decision, workflow, case and rule hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the AI capability catalog (P2-D26): may this capability key be requested right now?
 *
 * This is what stops a standing rule from being armed against a capability that does not exist, was never
 * activated, or has since been deprecated. An automation rule is the one thing here that acts with nobody
 * present, and a rule pointing at a missing capability fails at three in the morning rather than at the moment
 * somebody could have fixed it. The same check guards a workflow stage's `capabilityKey` and the
 * `compensationKey` that would undo it — a declared way back that names nothing is not a way back, and the
 * contract's third rule is only worth as much as the compensating capability actually being there.
 */
export interface CapabilityDirectory {
  isInvocable(tenantId: TenantId, capabilityKey: string): Promise<boolean>;
}

/**
 * Read model over the sources a recommendation may cite: the knowledge graph (P2-D25) and agent reasoning
 * sessions (P2-D26). Does the thing this evidence points at exist?
 *
 * The contract's second rule is that a recommendation ships with an evidence chain. A chain of references to
 * things that are not there satisfies the letter of that and none of its point, so citations are checked as
 * they are made rather than believed and discovered broken by whoever is asked to act on them.
 */
export interface EvidenceSourceDirectory {
  exists(tenantId: TenantId, source: EvidenceSource, ref: string): Promise<boolean>;
}

/**
 * Storage contract for recommendations. Tenant-scoped (explicit argument + RLS).
 *
 * `listOpen` is the backlog the prioritization engine ranks and the sweep that expires what nobody answered.
 * `listBySubject` is how a case worker sees everything outstanding about one student, one family or one
 * invoice — and how the platform avoids raising a second recommendation about something already in front of a
 * person. Recommendations are never removed: an accepted one is the grounds a decision rests on, and a
 * rejected one is the record that somebody looked and said no.
 */
export interface RecommendationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null>;
  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<Recommendation[]>;
  listOpen(tenantId: TenantId): Promise<Recommendation[]>;
  listByTenant(tenantId: TenantId): Promise<Recommendation[]>;
  save(recommendation: Recommendation): Promise<void>;
}

/** In-memory {@link RecommendationRepository} — the default for tests and bootstrap. */
export class InMemoryRecommendationRepository implements RecommendationRepository {
  private readonly byId = new Map<string, Recommendation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null> {
    const recommendation = this.byId.get(id);
    return recommendation && recommendation.tenantId === tenantId ? recommendation : null;
  }

  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<Recommendation[]> {
    return [...this.byId.values()].filter(
      (r) =>
        r.tenantId === tenantId && r.subjectDomain === subjectDomain && r.subjectId === subjectId,
    );
  }

  async listOpen(tenantId: TenantId): Promise<Recommendation[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.status === "proposed",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Recommendation[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(recommendation: Recommendation): Promise<void> {
    this.byId.set(recommendation.id, recommendation);
  }
}

/**
 * Storage contract for decision records. Tenant-scoped (explicit argument + RLS).
 *
 * `listByRecommendation` returns a list rather than the single decision it might look like it should, because
 * a deferral is a decision and leaves the recommendation open — a recommendation deferred twice and then
 * accepted has three decisions behind it, and flattening that to the last one would lose the fact that it was
 * put off. `listCompensationDue` is the sweep behind the contract's third rule: an act that was carried out,
 * then found to be wrong, and is still waiting to be put back. Decisions are never removed.
 */
export interface DecisionRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<DecisionRecord | null>;
  listByRecommendation(tenantId: TenantId, recommendationId: Uuid): Promise<DecisionRecord[]>;
  listCompensationDue(tenantId: TenantId): Promise<DecisionRecord[]>;
  listByTenant(tenantId: TenantId): Promise<DecisionRecord[]>;
  save(decision: DecisionRecord): Promise<void>;
}

/** In-memory {@link DecisionRecordRepository} — the default for tests and bootstrap. */
export class InMemoryDecisionRecordRepository implements DecisionRecordRepository {
  private readonly byId = new Map<string, DecisionRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<DecisionRecord | null> {
    const decision = this.byId.get(id);
    return decision && decision.tenantId === tenantId ? decision : null;
  }

  async listByRecommendation(
    tenantId: TenantId,
    recommendationId: Uuid,
  ): Promise<DecisionRecord[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.recommendationId === recommendationId,
    );
  }

  async listCompensationDue(tenantId: TenantId): Promise<DecisionRecord[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.compensationState === "available",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<DecisionRecord[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(decision: DecisionRecord): Promise<void> {
    this.byId.set(decision.id, decision);
  }
}

/**
 * Storage contract for workflow definitions. Tenant-scoped (explicit argument + RLS).
 *
 * A key does not identify a workflow here — a key and a version do, because revising a published process
 * creates a new draft beside it rather than editing the one cases are running under. So there are three ways
 * in and each answers a different question. `findPublishedByKey` is what the runtime asks when a rule or a
 * signal names a process: which version may take new cases right now. `findLatestByKey` is what the editor
 * asks: which version would a revision come from. `findByKeyAndVersion` is what enforces one row per version.
 * `listBySignal` is the dispatch read — every published process a given observed signal starts.
 */
export interface WorkflowRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition | null>;
  findByKeyAndVersion(
    tenantId: TenantId,
    key: string,
    version: number,
  ): Promise<WorkflowDefinition | null>;
  findPublishedByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null>;
  findLatestByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null>;
  listBySignal(tenantId: TenantId, signalKey: string): Promise<WorkflowDefinition[]>;
  listByTenant(tenantId: TenantId): Promise<WorkflowDefinition[]>;
  save(workflow: WorkflowDefinition): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link WorkflowRepository} — the default for tests and bootstrap. */
export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly byId = new Map<string, WorkflowDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition | null> {
    const workflow = this.byId.get(id);
    return workflow && workflow.tenantId === tenantId ? workflow : null;
  }

  async findByKeyAndVersion(
    tenantId: TenantId,
    key: string,
    version: number,
  ): Promise<WorkflowDefinition | null> {
    return (
      [...this.byId.values()].find(
        (w) => w.tenantId === tenantId && w.key === key && w.version === version,
      ) ?? null
    );
  }

  async findPublishedByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return (
      [...this.byId.values()].find(
        (w) => w.tenantId === tenantId && w.key === key && w.status === "published",
      ) ?? null
    );
  }

  async findLatestByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return [...this.byId.values()]
      .filter((w) => w.tenantId === tenantId && w.key === key)
      .reduce<WorkflowDefinition | null>(
        (latest, w) => (latest === null || w.version > latest.version ? w : latest),
        null,
      );
  }

  async listBySignal(tenantId: TenantId, signalKey: string): Promise<WorkflowDefinition[]> {
    return [...this.byId.values()].filter(
      (w) =>
        w.tenantId === tenantId && w.status === "published" && w.triggerSignalKey === signalKey,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<WorkflowDefinition[]> {
    return [...this.byId.values()].filter((w) => w.tenantId === tenantId);
  }

  async save(workflow: WorkflowDefinition): Promise<void> {
    this.byId.set(workflow.id, workflow);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const workflow = this.byId.get(id);
    if (workflow && workflow.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for running and settled workflow cases. Tenant-scoped (explicit argument + RLS).
 *
 * `listRunning` is the sweep that finds overdue stages and the cases a retired workflow version still has open.
 * `listByWorkflow` is what makes retiring a version honest — you can see what is still running under it before
 * you take it away. Cases are never removed: what an institution did about one student, stage by stage, is the
 * whole reason for modelling a process rather than just doing it.
 */
export interface WorkflowInstanceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<WorkflowInstance | null>;
  listByWorkflow(tenantId: TenantId, workflowId: Uuid): Promise<WorkflowInstance[]>;
  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<WorkflowInstance[]>;
  listRunning(tenantId: TenantId): Promise<WorkflowInstance[]>;
  listByTenant(tenantId: TenantId): Promise<WorkflowInstance[]>;
  save(instance: WorkflowInstance): Promise<void>;
}

/** In-memory {@link WorkflowInstanceRepository} — the default for tests and bootstrap. */
export class InMemoryWorkflowInstanceRepository implements WorkflowInstanceRepository {
  private readonly byId = new Map<string, WorkflowInstance>();

  async findById(tenantId: TenantId, id: Uuid): Promise<WorkflowInstance | null> {
    const instance = this.byId.get(id);
    return instance && instance.tenantId === tenantId ? instance : null;
  }

  async listByWorkflow(tenantId: TenantId, workflowId: Uuid): Promise<WorkflowInstance[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.workflowId === workflowId,
    );
  }

  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<WorkflowInstance[]> {
    return [...this.byId.values()].filter(
      (i) =>
        i.tenantId === tenantId && i.subjectDomain === subjectDomain && i.subjectId === subjectId,
    );
  }

  async listRunning(tenantId: TenantId): Promise<WorkflowInstance[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId && i.status === "running");
  }

  async listByTenant(tenantId: TenantId): Promise<WorkflowInstance[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(instance: WorkflowInstance): Promise<void> {
    this.byId.set(instance.id, instance);
  }
}

/**
 * Storage contract for automation rules. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-rule-per-key rule.
 *
 * `listBySignal` is the dispatch read and returns only active rules, because it exists to answer "what fires
 * on this observation" and a paused rule fires on nothing. That it filters at all is deliberate: the alternative
 * is every dispatch loading every rule an institution has ever written and filtering in memory, which is both
 * slower and one forgotten predicate away from a retired rule acting on a live student.
 */
export interface AutomationRuleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AutomationRule | null>;
  findByKey(tenantId: TenantId, key: string): Promise<AutomationRule | null>;
  listBySignal(tenantId: TenantId, signalKey: string): Promise<AutomationRule[]>;
  listByTenant(tenantId: TenantId): Promise<AutomationRule[]>;
  save(rule: AutomationRule): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AutomationRuleRepository} — the default for tests and bootstrap. */
export class InMemoryAutomationRuleRepository implements AutomationRuleRepository {
  private readonly byId = new Map<string, AutomationRule>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AutomationRule | null> {
    const rule = this.byId.get(id);
    return rule && rule.tenantId === tenantId ? rule : null;
  }

  async findByKey(tenantId: TenantId, key: string): Promise<AutomationRule | null> {
    return [...this.byId.values()].find((r) => r.tenantId === tenantId && r.key === key) ?? null;
  }

  async listBySignal(tenantId: TenantId, signalKey: string): Promise<AutomationRule[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.status === "active" && r.signalKey === signalKey,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AutomationRule[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(rule: AutomationRule): Promise<void> {
    this.byId.set(rule.id, rule);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const rule = this.byId.get(id);
    if (rule && rule.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for automation runs. Tenant-scoped (explicit argument + RLS).
 *
 * `listAwaitingApproval` is the queue the contract's first rule creates: everything a standing rule wanted to
 * do that a person has to own before it happens. `listCompensationDue` is the queue its third rule creates:
 * everything a standing rule already did that still has to be put back. Between them they are the two lists an
 * institution running unattended automation needs on a screen every morning. Runs are never removed — the
 * record of what the platform did while nobody was watching is exactly what must not be deletable.
 */
export interface AutomationRunRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AutomationRun | null>;
  listByRule(tenantId: TenantId, ruleId: Uuid): Promise<AutomationRun[]>;
  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<AutomationRun[]>;
  listAwaitingApproval(tenantId: TenantId): Promise<AutomationRun[]>;
  listCompensationDue(tenantId: TenantId): Promise<AutomationRun[]>;
  listByTenant(tenantId: TenantId): Promise<AutomationRun[]>;
  save(run: AutomationRun): Promise<void>;
}

/** In-memory {@link AutomationRunRepository} — the default for tests and bootstrap. */
export class InMemoryAutomationRunRepository implements AutomationRunRepository {
  private readonly byId = new Map<string, AutomationRun>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AutomationRun | null> {
    const run = this.byId.get(id);
    return run && run.tenantId === tenantId ? run : null;
  }

  async listByRule(tenantId: TenantId, ruleId: Uuid): Promise<AutomationRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId && r.ruleId === ruleId);
  }

  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<AutomationRun[]> {
    return [...this.byId.values()].filter(
      (r) =>
        r.tenantId === tenantId && r.subjectDomain === subjectDomain && r.subjectId === subjectId,
    );
  }

  async listAwaitingApproval(tenantId: TenantId): Promise<AutomationRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.status === "awaiting_approval",
    );
  }

  async listCompensationDue(tenantId: TenantId): Promise<AutomationRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.compensationState === "available",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AutomationRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(run: AutomationRun): Promise<void> {
    this.byId.set(run.id, run);
  }
}
