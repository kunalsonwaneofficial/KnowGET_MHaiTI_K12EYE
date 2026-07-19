import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateEnrollmentError,
  DuplicateStudentNumberError,
  MembershipNotFoundForLifecycleError,
  OrganizationNotFoundForLifecycleError,
  PersonNotFoundForLifecycleError,
  StudentNotFoundError,
} from "./errors";
import type {
  MembershipDirectory,
  OrganizationDirectory,
  PersonDirectory,
  StudentRepository,
} from "./ports";
import {
  type AcademicStatus,
  activateStudent,
  type AdministrativeStatus,
  assignRollNumber,
  assignSection,
  type EnrollStudentParams,
  enrollStudent,
  graduateStudent,
  isOnRoll,
  makeAlumni,
  placeOnLeave,
  promoteStudent,
  type PromoteStudentParams,
  returnFromLeave,
  setAcademicStatus,
  setAdministrativeStatus,
  type Student,
  transferStudent,
  withdrawStudent,
} from "./student";
import {
  studentBecameAlumni,
  studentEnrolled,
  studentGraduated,
  studentPromoted,
  studentTransferred,
  studentWithdrawn,
} from "./student-lifecycle-events";

export interface StudentServiceDeps {
  readonly repository: StudentRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly memberships: MembershipDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for students — the heart of the lifecycle. Enrolls learners
 * (validating the organization, the Person and any Membership, enforcing a unique
 * student number and a single active enrollment per institution), and drives the
 * `enrolled → active → on_leave → transferred | withdrawn | graduated → alumni`
 * lifecycle — publishing the six student events. Never duplicates identity: the
 * learner is a Person, the affiliation a Membership.
 */
export class StudentService {
  private readonly repository: StudentRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly memberships: MembershipDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: StudentServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.memberships = deps.memberships;
    this.events = deps.events;
  }

  async enroll(input: EnrollStudentParams): Promise<Student> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    if (input.membershipId) {
      await this.assertMembershipExists(input.tenantId, input.membershipId);
    }
    await this.assertStudentNumberFree(input.tenantId, input.studentNumber.trim());
    await this.assertNoActiveEnrollment(input.tenantId, input.personId, input.organizationId);
    const student = enrollStudent(input);
    await this.repository.save(student);
    await this.emit(studentEnrolled(student));
    return student;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Student> {
    return this.mutate(tenantId, id, activateStudent);
  }

  async placeOnLeave(tenantId: TenantId, id: Uuid): Promise<Student> {
    return this.mutate(tenantId, id, placeOnLeave);
  }

  async returnFromLeave(tenantId: TenantId, id: Uuid): Promise<Student> {
    return this.mutate(tenantId, id, returnFromLeave);
  }

  async promote(tenantId: TenantId, id: Uuid, params: PromoteStudentParams = {}): Promise<Student> {
    const updated = promoteStudent(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    await this.emit(studentPromoted(updated));
    return updated;
  }

  async transfer(tenantId: TenantId, id: Uuid, exitedOn?: string | null): Promise<Student> {
    const updated = transferStudent(await this.require(tenantId, id), exitedOn);
    await this.repository.save(updated);
    await this.emit(studentTransferred(updated));
    return updated;
  }

  async withdraw(tenantId: TenantId, id: Uuid, exitedOn?: string | null): Promise<Student> {
    const updated = withdrawStudent(await this.require(tenantId, id), exitedOn);
    await this.repository.save(updated);
    await this.emit(studentWithdrawn(updated));
    return updated;
  }

  async graduate(tenantId: TenantId, id: Uuid, exitedOn?: string | null): Promise<Student> {
    const updated = graduateStudent(await this.require(tenantId, id), exitedOn);
    await this.repository.save(updated);
    await this.emit(studentGraduated(updated));
    return updated;
  }

  async becomeAlumni(tenantId: TenantId, id: Uuid): Promise<Student> {
    const updated = makeAlumni(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(studentBecameAlumni(updated));
    return updated;
  }

  async assignSection(tenantId: TenantId, id: Uuid, sectionId: Uuid | null): Promise<Student> {
    return this.mutate(tenantId, id, (s) => assignSection(s, sectionId));
  }

  async assignRollNumber(
    tenantId: TenantId,
    id: Uuid,
    rollNumber: string | null,
  ): Promise<Student> {
    return this.mutate(tenantId, id, (s) => assignRollNumber(s, rollNumber));
  }

  async setAcademicStatus(tenantId: TenantId, id: Uuid, status: AcademicStatus): Promise<Student> {
    return this.mutate(tenantId, id, (s) => setAcademicStatus(s, status));
  }

  async setAdministrativeStatus(
    tenantId: TenantId,
    id: Uuid,
    status: AdministrativeStatus,
  ): Promise<Student> {
    return this.mutate(tenantId, id, (s) => setAdministrativeStatus(s, status));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Student> {
    return this.require(tenantId, id);
  }

  async getByStudentNumber(tenantId: TenantId, studentNumber: string): Promise<Student> {
    const student = await this.repository.findByStudentNumber(tenantId, studentNumber);
    if (!student) {
      throw new StudentNotFoundError(studentNumber);
    }
    return student;
  }

  async list(tenantId: TenantId): Promise<Student[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Student[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForPerson(tenantId: TenantId, personId: Uuid): Promise<Student[]> {
    return this.repository.listByPerson(tenantId, personId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (student: Student) => Student,
  ): Promise<Student> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForLifecycleError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForLifecycleError(personId);
    }
  }

  private async assertMembershipExists(tenantId: TenantId, membershipId: Uuid): Promise<void> {
    if (!(await this.memberships.exists(tenantId, membershipId))) {
      throw new MembershipNotFoundForLifecycleError(membershipId);
    }
  }

  private async assertStudentNumberFree(tenantId: TenantId, studentNumber: string): Promise<void> {
    if (await this.repository.findByStudentNumber(tenantId, studentNumber)) {
      throw new DuplicateStudentNumberError(studentNumber);
    }
  }

  private async assertNoActiveEnrollment(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    const existing = await this.repository.listByPerson(tenantId, personId);
    if (existing.some((s) => s.organizationId === organizationId && isOnRoll(s))) {
      throw new DuplicateEnrollmentError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Student> {
    const student = await this.repository.findById(tenantId, id);
    if (!student) {
      throw new StudentNotFoundError(id);
    }
    return student;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
