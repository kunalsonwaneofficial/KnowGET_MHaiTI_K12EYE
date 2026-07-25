import { ScheduleSlotNotFoundError, type ScheduleSlotService } from "@knowget/academic-scheduling";
import {
  CurriculumFrameworkNotFoundError,
  type CurriculumFrameworkService,
  SectionNotFoundError,
  type SectionService,
  SubjectNotFoundError,
  type SubjectService,
} from "@knowget/academic-structure";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { StudentNotFoundError, type StudentService } from "@knowget/student-lifecycle";
import type {
  CurriculumDirectory,
  OrganizationDirectory,
  ScheduleSlotDirectory,
  SectionDirectory,
  StudentDirectory,
  SubjectDirectory,
} from "@knowget/teaching-learning";
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

/** {@link CurriculumDirectory} backed by the academic-structure curriculum service (P2-D06). */
export class CurriculumServiceDirectory implements CurriculumDirectory {
  constructor(private readonly curricula: CurriculumFrameworkService) {}

  async exists(tenantId: TenantId, curriculumFrameworkId: Uuid): Promise<boolean> {
    try {
      await this.curricula.getById(tenantId, curriculumFrameworkId);
      return true;
    } catch (error) {
      if (error instanceof CurriculumFrameworkNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link ScheduleSlotDirectory} backed by the scheduling slot service (P2-D07). */
export class ScheduleSlotServiceDirectory implements ScheduleSlotDirectory {
  constructor(private readonly slots: ScheduleSlotService) {}

  async exists(tenantId: TenantId, scheduleSlotId: Uuid): Promise<boolean> {
    try {
      await this.slots.getById(tenantId, scheduleSlotId);
      return true;
    } catch (error) {
      if (error instanceof ScheduleSlotNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/** {@link StudentDirectory} backed by the student-lifecycle student service (P2-D03). */
export class StudentServiceDirectory implements StudentDirectory {
  constructor(private readonly students: StudentService) {}

  async exists(tenantId: TenantId, studentId: Uuid): Promise<boolean> {
    try {
      await this.students.getById(tenantId, studentId);
      return true;
    } catch (error) {
      if (error instanceof StudentNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
