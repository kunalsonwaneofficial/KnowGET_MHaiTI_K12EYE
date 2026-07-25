import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AcademicClass,
  activateClass,
  archiveClass,
  assignClassCurriculum,
  createAcademicClass,
  renameClass,
} from "./academic-class";
import { classCreated } from "./academic-structure-events";
import {
  ClassNotFoundError,
  CurriculumFrameworkNotFoundError,
  DuplicateClassError,
  GradeNotFoundError,
} from "./errors";
import type {
  AcademicClassRepository,
  CurriculumFrameworkRepository,
  GradeRepository,
} from "./ports";

export interface AcademicClassServiceDeps {
  readonly repository: AcademicClassRepository;
  readonly grades: GradeRepository;
  readonly curricula: CurriculumFrameworkRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAcademicClassInput {
  readonly tenantId: TenantId;
  readonly gradeId: Uuid;
  readonly academicYear: string;
  readonly name: string;
  readonly curriculumFrameworkId?: Uuid | null;
}

/**
 * Application service for classes. Creates a class within a validated Grade, deriving the
 * class's organization from that grade, at most one per (grade, academic year, name), and
 * optionally assigns a validated curriculum framework. Publishes {@link classCreated}.
 */
export class AcademicClassService {
  private readonly repository: AcademicClassRepository;
  private readonly grades: GradeRepository;
  private readonly curricula: CurriculumFrameworkRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AcademicClassServiceDeps) {
    this.repository = deps.repository;
    this.grades = deps.grades;
    this.curricula = deps.curricula;
    this.events = deps.events;
  }

  async create(input: CreateAcademicClassInput): Promise<AcademicClass> {
    const organizationId = await this.resolveGradeOrganization(input.tenantId, input.gradeId);
    if (input.curriculumFrameworkId) {
      await this.assertCurriculumExists(input.tenantId, input.curriculumFrameworkId);
    }
    await this.assertNoClass(input.tenantId, input.gradeId, input.academicYear, input.name);
    const klass = createAcademicClass({ ...input, organizationId });
    await this.repository.save(klass);
    await this.emit(classCreated(klass));
    return klass;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AcademicClass> {
    return this.mutate(tenantId, id, (c) => renameClass(c, name));
  }

  async assignCurriculum(
    tenantId: TenantId,
    id: Uuid,
    curriculumFrameworkId: Uuid | null,
  ): Promise<AcademicClass> {
    if (curriculumFrameworkId !== null) {
      await this.assertCurriculumExists(tenantId, curriculumFrameworkId);
    }
    return this.mutate(tenantId, id, (c) => assignClassCurriculum(c, curriculumFrameworkId));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AcademicClass> {
    return this.mutate(tenantId, id, (c) => archiveClass(c));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AcademicClass> {
    return this.mutate(tenantId, id, (c) => activateClass(c));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AcademicClass> {
    return this.require(tenantId, id);
  }

  async listForGrade(tenantId: TenantId, gradeId: Uuid): Promise<AcademicClass[]> {
    return this.repository.listByGrade(tenantId, gradeId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicClass[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<AcademicClass[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (klass: AcademicClass) => AcademicClass,
  ): Promise<AcademicClass> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveGradeOrganization(tenantId: TenantId, gradeId: Uuid): Promise<Uuid> {
    const grade = await this.grades.findById(tenantId, gradeId);
    if (!grade) {
      throw new GradeNotFoundError(gradeId);
    }
    return grade.organizationId;
  }

  private async assertCurriculumExists(
    tenantId: TenantId,
    curriculumFrameworkId: Uuid,
  ): Promise<void> {
    if (!(await this.curricula.findById(tenantId, curriculumFrameworkId))) {
      throw new CurriculumFrameworkNotFoundError(curriculumFrameworkId);
    }
  }

  private async assertNoClass(
    tenantId: TenantId,
    gradeId: Uuid,
    academicYear: string,
    name: string,
  ): Promise<void> {
    if (await this.repository.findByName(tenantId, gradeId, academicYear, name)) {
      throw new DuplicateClassError(gradeId, academicYear, name);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AcademicClass> {
    const klass = await this.repository.findById(tenantId, id);
    if (!klass) {
      throw new ClassNotFoundError(id);
    }
    return klass;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
