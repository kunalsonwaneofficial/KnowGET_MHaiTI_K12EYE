import type { TenantId, Uuid } from "@knowget/types";
import type { AttentionItem } from "./attention-item";
import type { EvidenceCitation } from "./command-view";
import type { Dashboard } from "./dashboard";
import type { ExecutiveBriefing } from "./executive-briefing";
import type { HealthIndexAssessment } from "./health-index-assessment";
import type { HealthIndexDefinition } from "./health-index-definition";
import type { KpiDefinition } from "./kpi-definition";
import type { KpiReading } from "./kpi-reading";

/**
 * The storage and directory contracts executive intelligence depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond this domain's own records except the two directories, which are read models
 * rather than dependencies — this domain never imports another domain package.
 *
 * **Nothing is removable.** No repository below offers a `remove`, and the reason differs at every aggregate
 * while the conclusion never does. A retired KPI has to stay because the argument about whether to measure
 * something is itself institutional memory. A superseded index definition has to stay because every assessment
 * made under it becomes an unexplainable number the moment its composition disappears. An archived dashboard
 * has to stay because what an institution decided it wanted to look at, and then decided it did not, is worth
 * as much to a later reader as either state alone. A reading, an assessment, a briefing and an attention item
 * are the record of what was measured, computed, said and noticed, and a governance layer that could delete
 * those would be a governance layer whose findings are negotiable after the fact. Every aggregate has a way out
 * that leaves the history intact — retired, superseded, archived, withdrawn, invalidated, dismissed — which is
 * what a `remove` would otherwise be reached for.
 *
 * **There is no scope or role directory, and that absence is load-bearing.** Panels and briefings name the
 * permission scope a reader must hold, and this package never asks anybody whether that scope exists or who
 * holds it. Adding a directory to check would give executive intelligence a second opinion about who a
 * principal is, and the institution would find out about the disagreement between that opinion and the identity
 * domain's as a leak rather than as an error.
 */

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * KPI, index, dashboard, briefing and attention item hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the records a reading cites: does the thing this citation points at exist?
 *
 * The contract's rule is evidence-traceable KPIs, and a citation to a record that is not there satisfies the
 * letter of that and none of its point. Checking at the moment the reading is recorded is what keeps the cost
 * where it belongs — on the person entering a figure, who can still go and find the right reference — rather
 * than on the governor who follows the citation eighteen months later and arrives nowhere.
 *
 * The citation arrives whole rather than as a domain and a reference, because which store answers depends on
 * the {@link EvidenceCitation.kind}: an assessment result and an audit finding live in different places and are
 * addressed differently, and an adapter handed only a string pair would have to guess. Resolution is entirely
 * the composition root's problem — this package never dereferences a citation, and could not.
 */
export interface EvidenceRecordDirectory {
  exists(tenantId: TenantId, citation: EvidenceCitation): Promise<boolean>;
}

// --- KPI definitions -------------------------------------------------------------

/**
 * Storage contract for KPI definitions. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-definition-per-key rule.
 *
 * `listActive` is the read an assessment is built on, and it is the reason coverage means anything: a pillar's
 * denominator is how many active indicators it declares, so the assessment has to be able to ask what the
 * institution currently says it measures — not what it has readings for, which is the numerator and the thing
 * being tested.
 */
export interface KpiDefinitionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<KpiDefinition | null>;
  findByKey(tenantId: TenantId, kpiKey: string): Promise<KpiDefinition | null>;
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<KpiDefinition[]>;
  listByTenant(tenantId: TenantId): Promise<KpiDefinition[]>;
  save(definition: KpiDefinition): Promise<void>;
}

/** In-memory {@link KpiDefinitionRepository} — the default for tests and bootstrap. */
export class InMemoryKpiDefinitionRepository implements KpiDefinitionRepository {
  private readonly byId = new Map<string, KpiDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<KpiDefinition | null> {
    const definition = this.byId.get(id);
    return definition && definition.tenantId === tenantId ? definition : null;
  }

  async findByKey(tenantId: TenantId, kpiKey: string): Promise<KpiDefinition | null> {
    return (
      [...this.byId.values()].find((d) => d.tenantId === tenantId && d.kpiKey === kpiKey) ?? null
    );
  }

  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<KpiDefinition[]> {
    return [...this.byId.values()].filter(
      (d) =>
        d.tenantId === tenantId && d.organizationId === organizationId && d.status === "active",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<KpiDefinition[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(definition: KpiDefinition): Promise<void> {
    this.byId.set(definition.id, definition);
  }
}

// --- KPI readings ----------------------------------------------------------------

/**
 * Storage contract for KPI readings. Tenant-scoped (explicit argument + RLS). `findByKpiAndPeriod` backs the
 * one-reading-per-indicator-per-period rule.
 *
 * `listLatestPerKpi` returns the most recent standing reading for each indicator whatever its period, and
 * deliberately does not filter by how old that is. Age is the traceability engine's judgement, and a repository
 * that dropped stale readings before the engine saw them would turn "this figure is two years out of date" into
 * "this indicator has never reported" — the same coverage gap, with the one piece of information that would
 * tell somebody where to go removed.
 */
export interface KpiReadingRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<KpiReading | null>;
  findByKpiAndPeriod(
    tenantId: TenantId,
    kpiDefinitionId: Uuid,
    period: number,
  ): Promise<KpiReading | null>;
  listLatestPerKpi(tenantId: TenantId, organizationId: Uuid): Promise<KpiReading[]>;
  listByKpi(tenantId: TenantId, kpiDefinitionId: Uuid): Promise<KpiReading[]>;
  listByTenant(tenantId: TenantId): Promise<KpiReading[]>;
  save(reading: KpiReading): Promise<void>;
}

/** In-memory {@link KpiReadingRepository} — the default for tests and bootstrap. */
export class InMemoryKpiReadingRepository implements KpiReadingRepository {
  private readonly byId = new Map<string, KpiReading>();

  async findById(tenantId: TenantId, id: Uuid): Promise<KpiReading | null> {
    const reading = this.byId.get(id);
    return reading && reading.tenantId === tenantId ? reading : null;
  }

  async findByKpiAndPeriod(
    tenantId: TenantId,
    kpiDefinitionId: Uuid,
    period: number,
  ): Promise<KpiReading | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.kpiDefinitionId === kpiDefinitionId &&
          r.period === period &&
          r.withdrawnAt === null,
      ) ?? null
    );
  }

  async listLatestPerKpi(tenantId: TenantId, organizationId: Uuid): Promise<KpiReading[]> {
    const latest = new Map<string, KpiReading>();
    for (const reading of this.byId.values()) {
      if (reading.tenantId !== tenantId) continue;
      if (reading.organizationId !== organizationId) continue;
      if (reading.withdrawnAt !== null) continue;
      const held = latest.get(reading.kpiDefinitionId);
      if (!held || reading.period > held.period) latest.set(reading.kpiDefinitionId, reading);
    }
    return [...latest.values()];
  }

  async listByKpi(tenantId: TenantId, kpiDefinitionId: Uuid): Promise<KpiReading[]> {
    return [...this.byId.values()]
      .filter((r) => r.tenantId === tenantId && r.kpiDefinitionId === kpiDefinitionId)
      .sort((left, right) => left.period - right.period);
  }

  async listByTenant(tenantId: TenantId): Promise<KpiReading[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(reading: KpiReading): Promise<void> {
    this.byId.set(reading.id, reading);
  }
}

// --- Health index definitions ----------------------------------------------------

/**
 * Storage contract for health index definitions. Tenant-scoped (explicit argument + RLS).
 *
 * `findPublishedByKey` is the read an assessment starts from, and there is at most one: publishing a
 * reweighting supersedes what came before it, so the question "which composition is this institution currently
 * measuring itself under" has exactly one answer at any moment. `listByKey` is the series read — every
 * composition an institution has measured itself under, which is what lets a reader tell a step in the index
 * from a change of question.
 */
export interface HealthIndexDefinitionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition | null>;
  findPublishedByKey(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition | null>;
  listByKey(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition[]>;
  listByTenant(tenantId: TenantId): Promise<HealthIndexDefinition[]>;
  save(definition: HealthIndexDefinition): Promise<void>;
}

/** In-memory {@link HealthIndexDefinitionRepository} — the default for tests and bootstrap. */
export class InMemoryHealthIndexDefinitionRepository implements HealthIndexDefinitionRepository {
  private readonly byId = new Map<string, HealthIndexDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition | null> {
    const definition = this.byId.get(id);
    return definition && definition.tenantId === tenantId ? definition : null;
  }

  async findPublishedByKey(
    tenantId: TenantId,
    indexKey: string,
  ): Promise<HealthIndexDefinition | null> {
    return (
      [...this.byId.values()].find(
        (d) => d.tenantId === tenantId && d.indexKey === indexKey && d.status === "published",
      ) ?? null
    );
  }

  async listByKey(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.indexKey === indexKey,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<HealthIndexDefinition[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(definition: HealthIndexDefinition): Promise<void> {
    this.byId.set(definition.id, definition);
  }
}

// --- Health index assessments ----------------------------------------------------

/**
 * Storage contract for health index assessments. Tenant-scoped (explicit argument + RLS).
 * `findByIndexAndPeriod` backs the one-assessment-per-series-per-period rule.
 *
 * `listBeforePeriod` returns the series behind a period, oldest first, and it is one method rather than two on
 * purpose. Attention asks two questions of an assessment's past — what the index did since last period, and how
 * long a pillar has been falling — and two repository reads could disagree about which assessment came
 * immediately before this one. From a single ordered list the last element is the previous period and the whole
 * of it is the run, and the two answers cannot contradict each other.
 */
export interface HealthIndexAssessmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment | null>;
  findByIndexAndPeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment | null>;
  listBeforePeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment[]>;
  listByTenant(tenantId: TenantId): Promise<HealthIndexAssessment[]>;
  save(assessment: HealthIndexAssessment): Promise<void>;
}

/** In-memory {@link HealthIndexAssessmentRepository} — the default for tests and bootstrap. */
export class InMemoryHealthIndexAssessmentRepository implements HealthIndexAssessmentRepository {
  private readonly byId = new Map<string, HealthIndexAssessment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment | null> {
    const assessment = this.byId.get(id);
    return assessment && assessment.tenantId === tenantId ? assessment : null;
  }

  async findByIndexAndPeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.tenantId === tenantId && a.indexKey === indexKey && a.period === period,
      ) ?? null
    );
  }

  async listBeforePeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment[]> {
    return [...this.byId.values()]
      .filter(
        (a) =>
          a.tenantId === tenantId &&
          a.indexKey === indexKey &&
          a.period < period &&
          a.status !== "invalidated",
      )
      .sort((left, right) => left.period - right.period);
  }

  async listByTenant(tenantId: TenantId): Promise<HealthIndexAssessment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(assessment: HealthIndexAssessment): Promise<void> {
    this.byId.set(assessment.id, assessment);
  }
}

// --- Dashboards ------------------------------------------------------------------

/**
 * Storage contract for dashboards. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-dashboard-per-key rule, which is what a saved link resolves through.
 *
 * `listPublished` returns only what a viewer could actually open. Composition then removes the panels their
 * scopes do not reach, so a viewer holding nothing sees a published dashboard with no panels rather than an
 * error — which is the correct outcome, and the reason the draft filter belongs here rather than in the caller.
 */
export interface DashboardRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Dashboard | null>;
  findByKey(tenantId: TenantId, dashboardKey: string): Promise<Dashboard | null>;
  listPublished(tenantId: TenantId, organizationId: Uuid): Promise<Dashboard[]>;
  listByTenant(tenantId: TenantId): Promise<Dashboard[]>;
  save(dashboard: Dashboard): Promise<void>;
}

/** In-memory {@link DashboardRepository} — the default for tests and bootstrap. */
export class InMemoryDashboardRepository implements DashboardRepository {
  private readonly byId = new Map<string, Dashboard>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Dashboard | null> {
    const dashboard = this.byId.get(id);
    return dashboard && dashboard.tenantId === tenantId ? dashboard : null;
  }

  async findByKey(tenantId: TenantId, dashboardKey: string): Promise<Dashboard | null> {
    return (
      [...this.byId.values()].find(
        (d) => d.tenantId === tenantId && d.dashboardKey === dashboardKey,
      ) ?? null
    );
  }

  async listPublished(tenantId: TenantId, organizationId: Uuid): Promise<Dashboard[]> {
    return [...this.byId.values()].filter(
      (d) =>
        d.tenantId === tenantId && d.organizationId === organizationId && d.status === "published",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Dashboard[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(dashboard: Dashboard): Promise<void> {
    this.byId.set(dashboard.id, dashboard);
  }
}

// --- Executive briefings ---------------------------------------------------------

/**
 * Storage contract for executive briefings. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-briefing-per-key rule.
 *
 * `listIssued` leaves out withdrawn briefings, because it answers "what does this institution currently stand
 * behind" and a withdrawn document is precisely the one it does not. They stay readable through `findById` and
 * `listByAssessment` — dropped from a list is not the same as deleted, and a board minute citing a briefing
 * that was later withdrawn must still resolve to the document, and to the fact that it was withdrawn.
 */
export interface ExecutiveBriefingRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing | null>;
  findByKey(tenantId: TenantId, briefingKey: string): Promise<ExecutiveBriefing | null>;
  listIssued(tenantId: TenantId, organizationId: Uuid): Promise<ExecutiveBriefing[]>;
  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<ExecutiveBriefing[]>;
  listByTenant(tenantId: TenantId): Promise<ExecutiveBriefing[]>;
  save(briefing: ExecutiveBriefing): Promise<void>;
}

/** In-memory {@link ExecutiveBriefingRepository} — the default for tests and bootstrap. */
export class InMemoryExecutiveBriefingRepository implements ExecutiveBriefingRepository {
  private readonly byId = new Map<string, ExecutiveBriefing>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing | null> {
    const briefing = this.byId.get(id);
    return briefing && briefing.tenantId === tenantId ? briefing : null;
  }

  async findByKey(tenantId: TenantId, briefingKey: string): Promise<ExecutiveBriefing | null> {
    return (
      [...this.byId.values()].find(
        (b) => b.tenantId === tenantId && b.briefingKey === briefingKey,
      ) ?? null
    );
  }

  async listIssued(tenantId: TenantId, organizationId: Uuid): Promise<ExecutiveBriefing[]> {
    return [...this.byId.values()].filter(
      (b) =>
        b.tenantId === tenantId && b.organizationId === organizationId && b.status === "issued",
    );
  }

  async listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<ExecutiveBriefing[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.assessmentId === assessmentId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ExecutiveBriefing[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(briefing: ExecutiveBriefing): Promise<void> {
    this.byId.set(briefing.id, briefing);
  }
}

// --- Attention items -------------------------------------------------------------

/**
 * Storage contract for attention items. Tenant-scoped (explicit argument + RLS).
 * `findByAssessmentAndKey` backs the item's compound identity, and is what makes raising the same finding twice
 * idempotent rather than duplicated.
 *
 * `listOpen` is the queue an institution works from and `listByAssessment` is what one period's arithmetic
 * raised. Items are never removed for the reason the whole module is not removable, and with a sharper edge
 * here than anywhere else: an attention item is a finding somebody would rather not have, and the one operation
 * a governance queue must not offer is making an inconvenient finding go away without a trace. Dismissing one
 * is a recorded judgement with a reason attached, which is the honest version of the same wish.
 */
export interface AttentionItemRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AttentionItem | null>;
  findByAssessmentAndKey(
    tenantId: TenantId,
    assessmentId: Uuid,
    key: string,
  ): Promise<AttentionItem | null>;
  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<AttentionItem[]>;
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<AttentionItem[]>;
  listByTenant(tenantId: TenantId): Promise<AttentionItem[]>;
  save(item: AttentionItem): Promise<void>;
}

/** In-memory {@link AttentionItemRepository} — the default for tests and bootstrap. */
export class InMemoryAttentionItemRepository implements AttentionItemRepository {
  private readonly byId = new Map<string, AttentionItem>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AttentionItem | null> {
    const item = this.byId.get(id);
    return item && item.tenantId === tenantId ? item : null;
  }

  async findByAssessmentAndKey(
    tenantId: TenantId,
    assessmentId: Uuid,
    key: string,
  ): Promise<AttentionItem | null> {
    return (
      [...this.byId.values()].find(
        (i) => i.tenantId === tenantId && i.assessmentId === assessmentId && i.key === key,
      ) ?? null
    );
  }

  async listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<AttentionItem[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.assessmentId === assessmentId,
    );
  }

  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<AttentionItem[]> {
    return [...this.byId.values()].filter(
      (i) =>
        i.tenantId === tenantId &&
        i.organizationId === organizationId &&
        (i.status === "open" || i.status === "acknowledged"),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AttentionItem[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(item: AttentionItem): Promise<void> {
    this.byId.set(item.id, item);
  }
}
