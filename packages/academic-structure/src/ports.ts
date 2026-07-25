import type { TenantId, Uuid } from "@knowget/types";
import type { AcademicCalendar } from "./academic-calendar";
import type { AcademicClass } from "./academic-class";
import type { AcademicProgram } from "./academic-program";
import type { CurriculumFramework } from "./curriculum-framework";
import type { Grade } from "./grade";
import type { LearningOutcome } from "./learning-outcome";
import type { Section } from "./section";
import type { Subject } from "./subject";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization exist in
 * the tenant? Every academic-structure record is owned by an Organization; the platform
 * validates it through this port and never depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Storage contract for academic calendars (one per organization + academic year). */
export interface AcademicCalendarRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar | null>;
  findByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicCalendar[]>;
  save(calendar: AcademicCalendar): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicCalendarRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicCalendarRepository implements AcademicCalendarRepository {
  private readonly byId = new Map<string, AcademicCalendar>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar | null> {
    const calendar = this.byId.get(id);
    return calendar && calendar.tenantId === tenantId ? calendar : null;
  }

  async findByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null> {
    return (
      [...this.byId.values()].find(
        (c) =>
          c.tenantId === tenantId &&
          c.organizationId === organizationId &&
          c.academicYear === academicYear,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicCalendar[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(calendar: AcademicCalendar): Promise<void> {
    this.byId.set(calendar.id, calendar);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const calendar = this.byId.get(id);
    if (calendar && calendar.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for academic programs (one per organization + code). */
export interface AcademicProgramRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram | null>;
  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicProgram | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicProgram[]>;
  save(program: AcademicProgram): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicProgramRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicProgramRepository implements AcademicProgramRepository {
  private readonly byId = new Map<string, AcademicProgram>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram | null> {
    const program = this.byId.get(id);
    return program && program.tenantId === tenantId ? program : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicProgram | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.organizationId === organizationId && p.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicProgram[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(program: AcademicProgram): Promise<void> {
    this.byId.set(program.id, program);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const program = this.byId.get(id);
    if (program && program.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for curriculum frameworks (one per organization + code). */
export interface CurriculumFrameworkRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework | null>;
  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<CurriculumFramework | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CurriculumFramework[]>;
  listByTenant(tenantId: TenantId): Promise<CurriculumFramework[]>;
  save(framework: CurriculumFramework): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CurriculumFrameworkRepository} — the default for tests and bootstrap. */
export class InMemoryCurriculumFrameworkRepository implements CurriculumFrameworkRepository {
  private readonly byId = new Map<string, CurriculumFramework>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework | null> {
    const framework = this.byId.get(id);
    return framework && framework.tenantId === tenantId ? framework : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<CurriculumFramework | null> {
    return (
      [...this.byId.values()].find(
        (f) => f.tenantId === tenantId && f.organizationId === organizationId && f.code === code,
      ) ?? null
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CurriculumFramework[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CurriculumFramework[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(framework: CurriculumFramework): Promise<void> {
    this.byId.set(framework.id, framework);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const framework = this.byId.get(id);
    if (framework && framework.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for grades (one per program + code). */
export interface GradeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Grade | null>;
  findByCode(tenantId: TenantId, programId: Uuid, code: string): Promise<Grade | null>;
  listByProgram(tenantId: TenantId, programId: Uuid): Promise<Grade[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Grade[]>;
  listByTenant(tenantId: TenantId): Promise<Grade[]>;
  save(grade: Grade): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link GradeRepository} — the default for tests and bootstrap. */
export class InMemoryGradeRepository implements GradeRepository {
  private readonly byId = new Map<string, Grade>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Grade | null> {
    const grade = this.byId.get(id);
    return grade && grade.tenantId === tenantId ? grade : null;
  }

  async findByCode(tenantId: TenantId, programId: Uuid, code: string): Promise<Grade | null> {
    return (
      [...this.byId.values()].find(
        (g) => g.tenantId === tenantId && g.programId === programId && g.code === code,
      ) ?? null
    );
  }

  async listByProgram(tenantId: TenantId, programId: Uuid): Promise<Grade[]> {
    return [...this.byId.values()].filter(
      (g) => g.tenantId === tenantId && g.programId === programId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Grade[]> {
    return [...this.byId.values()].filter(
      (g) => g.tenantId === tenantId && g.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Grade[]> {
    return [...this.byId.values()].filter((g) => g.tenantId === tenantId);
  }

  async save(grade: Grade): Promise<void> {
    this.byId.set(grade.id, grade);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const grade = this.byId.get(id);
    if (grade && grade.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for classes (unique by name within a grade + academic year). */
export interface AcademicClassRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicClass | null>;
  findByName(
    tenantId: TenantId,
    gradeId: Uuid,
    academicYear: string,
    name: string,
  ): Promise<AcademicClass | null>;
  listByGrade(tenantId: TenantId, gradeId: Uuid): Promise<AcademicClass[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicClass[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicClass[]>;
  save(klass: AcademicClass): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicClassRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicClassRepository implements AcademicClassRepository {
  private readonly byId = new Map<string, AcademicClass>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicClass | null> {
    const klass = this.byId.get(id);
    return klass && klass.tenantId === tenantId ? klass : null;
  }

  async findByName(
    tenantId: TenantId,
    gradeId: Uuid,
    academicYear: string,
    name: string,
  ): Promise<AcademicClass | null> {
    return (
      [...this.byId.values()].find(
        (c) =>
          c.tenantId === tenantId &&
          c.gradeId === gradeId &&
          c.academicYear === academicYear &&
          c.name === name,
      ) ?? null
    );
  }

  async listByGrade(tenantId: TenantId, gradeId: Uuid): Promise<AcademicClass[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId && c.gradeId === gradeId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicClass[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicClass[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(klass: AcademicClass): Promise<void> {
    this.byId.set(klass.id, klass);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const klass = this.byId.get(id);
    if (klass && klass.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for sections (unique by name within a class). */
export interface SectionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Section | null>;
  findByName(tenantId: TenantId, classId: Uuid, name: string): Promise<Section | null>;
  listByClass(tenantId: TenantId, classId: Uuid): Promise<Section[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Section[]>;
  listByTenant(tenantId: TenantId): Promise<Section[]>;
  save(section: Section): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link SectionRepository} — the default for tests and bootstrap. */
export class InMemorySectionRepository implements SectionRepository {
  private readonly byId = new Map<string, Section>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Section | null> {
    const section = this.byId.get(id);
    return section && section.tenantId === tenantId ? section : null;
  }

  async findByName(tenantId: TenantId, classId: Uuid, name: string): Promise<Section | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.classId === classId && s.name === name,
      ) ?? null
    );
  }

  async listByClass(tenantId: TenantId, classId: Uuid): Promise<Section[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId && s.classId === classId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Section[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Section[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(section: Section): Promise<void> {
    this.byId.set(section.id, section);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const section = this.byId.get(id);
    if (section && section.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for subjects (one per organization + code). */
export interface SubjectRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Subject | null>;
  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Subject | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Subject[]>;
  listByTenant(tenantId: TenantId): Promise<Subject[]>;
  save(subject: Subject): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link SubjectRepository} — the default for tests and bootstrap. */
export class InMemorySubjectRepository implements SubjectRepository {
  private readonly byId = new Map<string, Subject>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Subject | null> {
    const subject = this.byId.get(id);
    return subject && subject.tenantId === tenantId ? subject : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<Subject | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.organizationId === organizationId && s.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Subject[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Subject[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(subject: Subject): Promise<void> {
    this.byId.set(subject.id, subject);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const subject = this.byId.get(id);
    if (subject && subject.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for learning outcomes (one per subject + code). */
export interface LearningOutcomeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearningOutcome | null>;
  findByCode(tenantId: TenantId, subjectId: Uuid, code: string): Promise<LearningOutcome | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningOutcome[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningOutcome[]>;
  listByTenant(tenantId: TenantId): Promise<LearningOutcome[]>;
  save(outcome: LearningOutcome): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearningOutcomeRepository} — the default for tests and bootstrap. */
export class InMemoryLearningOutcomeRepository implements LearningOutcomeRepository {
  private readonly byId = new Map<string, LearningOutcome>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearningOutcome | null> {
    const outcome = this.byId.get(id);
    return outcome && outcome.tenantId === tenantId ? outcome : null;
  }

  async findByCode(
    tenantId: TenantId,
    subjectId: Uuid,
    code: string,
  ): Promise<LearningOutcome | null> {
    return (
      [...this.byId.values()].find(
        (o) => o.tenantId === tenantId && o.subjectId === subjectId && o.code === code,
      ) ?? null
    );
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningOutcome[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.subjectId === subjectId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningOutcome[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearningOutcome[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(outcome: LearningOutcome): Promise<void> {
    this.byId.set(outcome.id, outcome);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const outcome = this.byId.get(id);
    if (outcome && outcome.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
