import { ScheduleSlotNotFoundError, type ScheduleSlotService } from "@knowget/academic-scheduling";
import {
  SectionNotFoundError,
  SubjectNotFoundError,
  type SectionService,
  type SubjectService,
} from "@knowget/academic-structure";
import type {
  OrganizationDirectory,
  ParticipantDirectory,
  ScheduleSlotDirectory,
  SectionDirectory,
  SubjectDirectory,
} from "@knowget/attendance-presence";
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

/** {@link ParticipantDirectory} backed by the person service — a participant is a Person (P2-D01-M02). */
export class ParticipantPersonDirectory implements ParticipantDirectory {
  constructor(private readonly people: PersonService) {}

  async exists(tenantId: TenantId, participantId: Uuid): Promise<boolean> {
    try {
      await this.people.getById(tenantId, participantId);
      return true;
    } catch (error) {
      if (error instanceof PersonNotFoundError) {
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
