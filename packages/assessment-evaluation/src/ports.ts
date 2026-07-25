import type { TenantId, Uuid } from "@knowget/types";
import type { AcademicRecord } from "./academic-record";
import type { Assessment } from "./assessment";
import type { AssessmentFramework } from "./assessment-framework";
import type { AssessmentPlan } from "./assessment-plan";
import type { CompetencyProfile } from "./competency-profile";
import type { Evaluation } from "./evaluation";
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

// --- Evaluation repository --------------------------------------------------------

/**
 * Storage contract for evaluations. `findByAssessmentAndStudent` enforces one evaluation per
 * (assessment, student); `listByStudent` feeds academic records and the intelligence scope.
 */
export interface EvaluationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Evaluation | null>;
  findByAssessmentAndStudent(
    tenantId: TenantId,
    assessmentId: Uuid,
    studentId: Uuid,
  ): Promise<Evaluation | null>;
  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<Evaluation[]>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Evaluation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Evaluation[]>;
  listByTenant(tenantId: TenantId): Promise<Evaluation[]>;
  save(evaluation: Evaluation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EvaluationRepository} — the default for tests and bootstrap. */
export class InMemoryEvaluationRepository implements EvaluationRepository {
  private readonly byId = new Map<string, Evaluation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Evaluation | null> {
    const evaluation = this.byId.get(id);
    return evaluation && evaluation.tenantId === tenantId ? evaluation : null;
  }

  async findByAssessmentAndStudent(
    tenantId: TenantId,
    assessmentId: Uuid,
    studentId: Uuid,
  ): Promise<Evaluation | null> {
    return (
      [...this.byId.values()].find(
        (e) =>
          e.tenantId === tenantId && e.assessmentId === assessmentId && e.studentId === studentId,
      ) ?? null
    );
  }

  async listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<Evaluation[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.assessmentId === assessmentId,
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Evaluation[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Evaluation[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Evaluation[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(evaluation: Evaluation): Promise<void> {
    this.byId.set(evaluation.id, evaluation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const evaluation = this.byId.get(id);
    if (evaluation && evaluation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Competency profile repository ------------------------------------------------

/** Storage contract for competency profiles (one per student). */
export interface CompetencyProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CompetencyProfile | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<CompetencyProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyProfile[]>;
  listByTenant(tenantId: TenantId): Promise<CompetencyProfile[]>;
  save(profile: CompetencyProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CompetencyProfileRepository} — the default for tests and bootstrap. */
export class InMemoryCompetencyProfileRepository implements CompetencyProfileRepository {
  private readonly byId = new Map<string, CompetencyProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CompetencyProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<CompetencyProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CompetencyProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: CompetencyProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Academic record repository ---------------------------------------------------

/**
 * Storage contract for academic records. `findByStudentYearTerm` enforces one record per
 * (student, academic year, term); `listByStudent` feeds transcripts and the analytics scope.
 */
export interface AcademicRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicRecord | null>;
  findByStudentYearTerm(
    tenantId: TenantId,
    studentId: Uuid,
    academicYear: string,
    term: string,
  ): Promise<AcademicRecord | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<AcademicRecord[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicRecord[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicRecord[]>;
  save(record: AcademicRecord): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicRecordRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicRecordRepository implements AcademicRecordRepository {
  private readonly byId = new Map<string, AcademicRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicRecord | null> {
    const record = this.byId.get(id);
    return record && record.tenantId === tenantId ? record : null;
  }

  async findByStudentYearTerm(
    tenantId: TenantId,
    studentId: Uuid,
    academicYear: string,
    term: string,
  ): Promise<AcademicRecord | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.studentId === studentId &&
          r.academicYear === academicYear &&
          r.term === term,
      ) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<AcademicRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicRecord[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(record: AcademicRecord): Promise<void> {
    this.byId.set(record.id, record);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const record = this.byId.get(id);
    if (record && record.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
