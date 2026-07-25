import {
  ClassNotFoundError,
  GradeNotFoundError,
  SectionNotFoundError,
  SubjectNotFoundError,
  type AcademicClassService,
  type GradeService,
  type SectionService,
  type SubjectService,
} from "@knowget/academic-structure";
import type {
  ClassDirectory,
  GradeDirectory,
  OrganizationDirectory,
  ResourceDirectory,
  ResourceRepository,
  SectionDirectory,
  SubjectDirectory,
  TeacherDirectory,
} from "@knowget/academic-scheduling";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { TenantId, Uuid } from "@knowget/types";

/** {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). */
export class OrganizationServiceDirectory implements OrganizationDirectory {
  constructor(private readonly organizations: OrganizationService) {}

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    try {
      await this.organizations.getById(tenantId, organizationId);
      return true;
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link GradeDirectory} backed by the academic-structure grade service (P2-D06). */
export class GradeServiceDirectory implements GradeDirectory {
  constructor(private readonly grades: GradeService) {}

  async exists(tenantId: TenantId, gradeId: Uuid): Promise<boolean> {
    try {
      await this.grades.getById(tenantId, gradeId);
      return true;
    } catch (error) {
      if (error instanceof GradeNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link ClassDirectory} backed by the academic-structure class service (P2-D06). */
export class ClassServiceDirectory implements ClassDirectory {
  constructor(private readonly classes: AcademicClassService) {}

  async exists(tenantId: TenantId, classId: Uuid): Promise<boolean> {
    try {
      await this.classes.getById(tenantId, classId);
      return true;
    } catch (error) {
      if (error instanceof ClassNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link SectionDirectory} backed by the academic-structure section service (P2-D06). */
export class SectionServiceDirectory implements SectionDirectory {
  constructor(private readonly sections: SectionService) {}

  async exists(tenantId: TenantId, sectionId: Uuid): Promise<boolean> {
    try {
      await this.sections.getById(tenantId, sectionId);
      return true;
    } catch (error) {
      if (error instanceof SectionNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link SubjectDirectory} backed by the academic-structure subject service (P2-D06). */
export class SubjectServiceDirectory implements SubjectDirectory {
  constructor(private readonly subjects: SubjectService) {}

  async exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean> {
    try {
      await this.subjects.getById(tenantId, subjectId);
      return true;
    } catch (error) {
      if (error instanceof SubjectNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link TeacherDirectory} backed by the person service (P2-D01-M02) — a teacher is a Person. */
export class TeacherPersonDirectory implements TeacherDirectory {
  constructor(private readonly people: PersonService) {}

  async exists(tenantId: TenantId, teacherId: Uuid): Promise<boolean> {
    try {
      await this.people.getById(tenantId, teacherId);
      return true;
    } catch (error) {
      if (error instanceof PersonNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link ResourceDirectory} backed by the in-package resource repository — used to validate
 * a slot's venue references a real resource without the slot service depending on the
 * resource service.
 */
export class ResourceRepositoryDirectory implements ResourceDirectory {
  constructor(private readonly resources: ResourceRepository) {}

  async exists(tenantId: TenantId, resourceId: Uuid): Promise<boolean> {
    return (await this.resources.findById(tenantId, resourceId)) !== null;
  }
}
