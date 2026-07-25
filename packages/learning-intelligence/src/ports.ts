import type { TenantId, Uuid } from "@knowget/types";
import type { CohortInsight, CohortScopeType } from "./cohort-insight";
import type { EarlyWarning } from "./early-warning";
import type { EducationalInsight } from "./educational-insight";
import type { GrowthPlan } from "./growth-plan";
import type { LearnerInsightProfile } from "./learner-insight-profile";
import type { LearningSignal } from "./learning-signal";
import type { Recommendation } from "./recommendation";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this student exist in the tenant? (P2-D03) */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
}

// --- Learning signal repository --------------------------------------------------

/**
 * Storage contract for learning signals. `listByStudent` feeds the synthesis engine; the feed is
 * append-only (signals are immutable once captured).
 */
export interface LearningSignalRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearningSignal | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]>;
  listByTenant(tenantId: TenantId): Promise<LearningSignal[]>;
  save(signal: LearningSignal): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearningSignalRepository} — the default for tests and bootstrap. */
export class InMemoryLearningSignalRepository implements LearningSignalRepository {
  private readonly byId = new Map<string, LearningSignal>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearningSignal | null> {
    const signal = this.byId.get(id);
    return signal && signal.tenantId === tenantId ? signal : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(signal: LearningSignal): Promise<void> {
    this.byId.set(signal.id, signal);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const signal = this.byId.get(id);
    if (signal && signal.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Learner insight profile repository ------------------------------------------

/** Storage contract for learner insight profiles (one per student). */
export interface LearnerInsightProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearnerInsightProfile[]>;
  listByTenant(tenantId: TenantId): Promise<LearnerInsightProfile[]>;
  save(profile: LearnerInsightProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearnerInsightProfileRepository} — the default for tests and bootstrap. */
export class InMemoryLearnerInsightProfileRepository implements LearnerInsightProfileRepository {
  private readonly byId = new Map<string, LearnerInsightProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<LearnerInsightProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearnerInsightProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: LearnerInsightProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Early warning repository ----------------------------------------------------

/**
 * Storage contract for early warnings. `findOpenByStudentAndRule` lets the service avoid raising a
 * duplicate open warning for a rule that has already fired and is still being handled.
 */
export interface EarlyWarningRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EarlyWarning | null>;
  findOpenByStudentAndRule(
    tenantId: TenantId,
    studentId: Uuid,
    ruleId: string,
  ): Promise<EarlyWarning | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EarlyWarning[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EarlyWarning[]>;
  listByTenant(tenantId: TenantId): Promise<EarlyWarning[]>;
  save(warning: EarlyWarning): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

const isOpenWarning = (warning: EarlyWarning): boolean =>
  warning.status === "raised" || warning.status === "acknowledged";

/** In-memory {@link EarlyWarningRepository} — the default for tests and bootstrap. */
export class InMemoryEarlyWarningRepository implements EarlyWarningRepository {
  private readonly byId = new Map<string, EarlyWarning>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EarlyWarning | null> {
    const warning = this.byId.get(id);
    return warning && warning.tenantId === tenantId ? warning : null;
  }

  async findOpenByStudentAndRule(
    tenantId: TenantId,
    studentId: Uuid,
    ruleId: string,
  ): Promise<EarlyWarning | null> {
    return (
      [...this.byId.values()].find(
        (w) =>
          w.tenantId === tenantId &&
          w.studentId === studentId &&
          w.ruleId === ruleId &&
          isOpenWarning(w),
      ) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EarlyWarning[]> {
    return [...this.byId.values()].filter(
      (w) => w.tenantId === tenantId && w.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EarlyWarning[]> {
    return [...this.byId.values()].filter(
      (w) => w.tenantId === tenantId && w.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<EarlyWarning[]> {
    return [...this.byId.values()].filter((w) => w.tenantId === tenantId);
  }

  async save(warning: EarlyWarning): Promise<void> {
    this.byId.set(warning.id, warning);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const warning = this.byId.get(id);
    if (warning && warning.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Educational insight repository ----------------------------------------------

/** Storage contract for educational insights. */
export interface EducationalInsightRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EducationalInsight | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalInsight[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EducationalInsight[]>;
  listByTenant(tenantId: TenantId): Promise<EducationalInsight[]>;
  save(insight: EducationalInsight): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EducationalInsightRepository} — the default for tests and bootstrap. */
export class InMemoryEducationalInsightRepository implements EducationalInsightRepository {
  private readonly byId = new Map<string, EducationalInsight>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EducationalInsight | null> {
    const insight = this.byId.get(id);
    return insight && insight.tenantId === tenantId ? insight : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalInsight[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.studentId === studentId,
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<EducationalInsight[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<EducationalInsight[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(insight: EducationalInsight): Promise<void> {
    this.byId.set(insight.id, insight);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const insight = this.byId.get(id);
    if (insight && insight.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Recommendation repository ---------------------------------------------------

/** Storage contract for recommendations. */
export interface RecommendationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Recommendation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Recommendation[]>;
  listByTenant(tenantId: TenantId): Promise<Recommendation[]>;
  save(recommendation: Recommendation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RecommendationRepository} — the default for tests and bootstrap. */
export class InMemoryRecommendationRepository implements RecommendationRepository {
  private readonly byId = new Map<string, Recommendation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null> {
    const recommendation = this.byId.get(id);
    return recommendation && recommendation.tenantId === tenantId ? recommendation : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Recommendation[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Recommendation[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Recommendation[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(recommendation: Recommendation): Promise<void> {
    this.byId.set(recommendation.id, recommendation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const recommendation = this.byId.get(id);
    if (recommendation && recommendation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Growth plan repository ------------------------------------------------------

/** Storage contract for growth plans. */
export interface GrowthPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<GrowthPlan | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<GrowthPlan[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GrowthPlan[]>;
  listByTenant(tenantId: TenantId): Promise<GrowthPlan[]>;
  save(plan: GrowthPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link GrowthPlanRepository} — the default for tests and bootstrap. */
export class InMemoryGrowthPlanRepository implements GrowthPlanRepository {
  private readonly byId = new Map<string, GrowthPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<GrowthPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<GrowthPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GrowthPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<GrowthPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: GrowthPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const plan = this.byId.get(id);
    if (plan && plan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Cohort insight repository ---------------------------------------------------

/** Storage contract for cohort insights. `findByScope` fetches the rollup for a given cohort. */
export interface CohortInsightRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CohortInsight | null>;
  findByScope(
    tenantId: TenantId,
    scopeType: CohortScopeType,
    scopeId: Uuid,
  ): Promise<CohortInsight | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CohortInsight[]>;
  listByTenant(tenantId: TenantId): Promise<CohortInsight[]>;
  save(insight: CohortInsight): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CohortInsightRepository} — the default for tests and bootstrap. */
export class InMemoryCohortInsightRepository implements CohortInsightRepository {
  private readonly byId = new Map<string, CohortInsight>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CohortInsight | null> {
    const insight = this.byId.get(id);
    return insight && insight.tenantId === tenantId ? insight : null;
  }

  async findByScope(
    tenantId: TenantId,
    scopeType: CohortScopeType,
    scopeId: Uuid,
  ): Promise<CohortInsight | null> {
    return (
      [...this.byId.values()].find(
        (c) => c.tenantId === tenantId && c.scopeType === scopeType && c.scopeId === scopeId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CohortInsight[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CohortInsight[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(insight: CohortInsight): Promise<void> {
    this.byId.set(insight.id, insight);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const insight = this.byId.get(id);
    if (insight && insight.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
