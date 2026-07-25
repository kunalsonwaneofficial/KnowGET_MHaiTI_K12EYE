import type { TenantId, Uuid } from "@knowget/types";
import type { Assessment } from "./assessment";
import type { AssessmentFramework } from "./assessment-framework";
import type { AssessmentPlan } from "./assessment-plan";
import type { QuestionBank } from "./question-bank";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this subject exist in the tenant? (P2-D06) */
export interface SubjectDirectory {
  exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean>;
}

/** Does this student exist in the tenant? (P2-D03) */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
}

/** Does this schedule slot exist in the tenant? (P2-D07) */
export interface ScheduleSlotDirectory {
  exists(tenantId: TenantId, scheduleSlotId: Uuid): Promise<boolean>;
}

/** Does this learning-evidence record exist in the tenant? (P2-D09) */
export interface LearningEvidenceDirectory {
  exists(tenantId: TenantId, learningEvidenceId: Uuid): Promise<boolean>;
}

// --- Assessment framework repository ---------------------------------------------

/** Storage contract for assessment frameworks. */
export interface AssessmentFrameworkRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework | null>;
  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AssessmentFramework | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentFramework[]>;
  listByTenant(tenantId: TenantId): Promise<AssessmentFramework[]>;
  save(framework: AssessmentFramework): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AssessmentFrameworkRepository} — the default for tests and bootstrap. */
export class InMemoryAssessmentFrameworkRepository implements AssessmentFrameworkRepository {
  private readonly byId = new Map<string, AssessmentFramework>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework | null> {
    const framework = this.byId.get(id);
    return framework && framework.tenantId === tenantId ? framework : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AssessmentFramework | null> {
    return (
      [...this.byId.values()].find(
        (f) => f.tenantId === tenantId && f.organizationId === organizationId && f.code === code,
      ) ?? null
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<AssessmentFramework[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AssessmentFramework[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(framework: AssessmentFramework): Promise<void> {
    this.byId.set(framework.id, framework);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const framework = this.byId.get(id);
    if (framework && framework.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Assessment plan repository ---------------------------------------------------

/** Storage contract for assessment plans. */
export interface AssessmentPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentPlan[]>;
  listByTenant(tenantId: TenantId): Promise<AssessmentPlan[]>;
  save(plan: AssessmentPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AssessmentPlanRepository} — the default for tests and bootstrap. */
export class InMemoryAssessmentPlanRepository implements AssessmentPlanRepository {
  private readonly byId = new Map<string, AssessmentPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AssessmentPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: AssessmentPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const plan = this.byId.get(id);
    if (plan && plan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Assessment repository --------------------------------------------------------

/** Storage contract for assessments. `listBySubject` feeds the intelligence scope. */
export interface AssessmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Assessment | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<Assessment[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assessment[]>;
  listByTenant(tenantId: TenantId): Promise<Assessment[]>;
  save(assessment: Assessment): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AssessmentRepository} — the default for tests and bootstrap. */
export class InMemoryAssessmentRepository implements AssessmentRepository {
  private readonly byId = new Map<string, Assessment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Assessment | null> {
    const assessment = this.byId.get(id);
    return assessment && assessment.tenantId === tenantId ? assessment : null;
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<Assessment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.subjectId === subjectId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assessment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Assessment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(assessment: Assessment): Promise<void> {
    this.byId.set(assessment.id, assessment);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const assessment = this.byId.get(id);
    if (assessment && assessment.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Question bank repository -----------------------------------------------------

/** Storage contract for question banks. */
export interface QuestionBankRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<QuestionBank | null>;
  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<QuestionBank | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<QuestionBank[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<QuestionBank[]>;
  listByTenant(tenantId: TenantId): Promise<QuestionBank[]>;
  save(bank: QuestionBank): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link QuestionBankRepository} — the default for tests and bootstrap. */
export class InMemoryQuestionBankRepository implements QuestionBankRepository {
  private readonly byId = new Map<string, QuestionBank>();

  async findById(tenantId: TenantId, id: Uuid): Promise<QuestionBank | null> {
    const bank = this.byId.get(id);
    return bank && bank.tenantId === tenantId ? bank : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<QuestionBank | null> {
    return (
      [...this.byId.values()].find(
        (b) => b.tenantId === tenantId && b.organizationId === organizationId && b.code === code,
      ) ?? null
    );
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<QuestionBank[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.subjectId === subjectId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<QuestionBank[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<QuestionBank[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(bank: QuestionBank): Promise<void> {
    this.byId.set(bank.id, bank);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const bank = this.byId.get(id);
    if (bank && bank.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
