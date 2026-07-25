import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Assignment,
  closeAssignment,
  createAssignment,
  publishAssignment,
  recordAssignmentSubmission,
  renameAssignment,
  setAssignmentInstructions,
  setAssignmentSchedule,
  setSubmissionWindow,
} from "./assignment";
import type { AssignmentType, SubmissionStatus } from "./assignment-type";
import {
  AssignmentNotFoundError,
  LessonPlanNotFoundError,
  OrganizationNotFoundForTeachingError,
  SectionNotFoundForTeachingError,
  StudentNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import { assignmentPublished, assignmentSubmitted } from "./teaching-learning-events";
import type {
  AssignmentRepository,
  LessonPlanRepository,
  OrganizationDirectory,
  SectionDirectory,
  StudentDirectory,
  SubjectDirectory,
} from "./ports";

export interface AssignmentServiceDeps {
  readonly repository: AssignmentRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects: SubjectDirectory;
  readonly sections?: SectionDirectory;
  readonly lessonPlans?: LessonPlanRepository;
  readonly students?: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAssignmentInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly sectionId?: Uuid | null;
  readonly lessonPlanId?: Uuid | null;
  readonly title: string;
  readonly assignmentType: AssignmentType;
  readonly instructions?: string | null;
  readonly assignedDate?: string | null;
  readonly dueDate?: string | null;
  readonly submissionOpensAt?: string | null;
  readonly submissionClosesAt?: string | null;
}

export interface RecordSubmissionInput {
  readonly studentId: Uuid;
  readonly status: SubmissionStatus;
  readonly submittedAt?: string | null;
  readonly note?: string | null;
}

/**
 * Application service for assignments. Creates an assignment against a validated Organization
 * and Subject (and, when supplied, a validated section and lesson plan), manages its
 * draft → published → closed lifecycle, and records per-learner submission completion (never a
 * grade — evaluation is the Assessment platform's). Publishes {@link assignmentPublished} on
 * publish and {@link assignmentSubmitted} for each recorded submission.
 */
export class AssignmentService {
  private readonly repository: AssignmentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory;
  private readonly sections: SectionDirectory | undefined;
  private readonly lessonPlans: LessonPlanRepository | undefined;
  private readonly students: StudentDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AssignmentServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.sections = deps.sections;
    this.lessonPlans = deps.lessonPlans;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateAssignmentInput): Promise<Assignment> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (!(await this.subjects.exists(input.tenantId, input.subjectId))) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    if (
      input.sectionId &&
      this.sections &&
      !(await this.sections.exists(input.tenantId, input.sectionId))
    ) {
      throw new SectionNotFoundForTeachingError(input.sectionId);
    }
    if (
      input.lessonPlanId &&
      this.lessonPlans &&
      !(await this.lessonPlans.findById(input.tenantId, input.lessonPlanId))
    ) {
      throw new LessonPlanNotFoundError(input.lessonPlanId);
    }
    const assignment = createAssignment(input);
    await this.repository.save(assignment);
    return assignment;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<Assignment> {
    return this.mutate(tenantId, id, (a) => renameAssignment(a, title));
  }

  async setInstructions(
    tenantId: TenantId,
    id: Uuid,
    instructions: string | null,
  ): Promise<Assignment> {
    return this.mutate(tenantId, id, (a) => setAssignmentInstructions(a, instructions));
  }

  async setSchedule(
    tenantId: TenantId,
    id: Uuid,
    assignedDate: string | null,
    dueDate: string | null,
  ): Promise<Assignment> {
    return this.mutate(tenantId, id, (a) => setAssignmentSchedule(a, assignedDate, dueDate));
  }

  async setSubmissionWindow(
    tenantId: TenantId,
    id: Uuid,
    opensAt: string | null,
    closesAt: string | null,
  ): Promise<Assignment> {
    return this.mutate(tenantId, id, (a) => setSubmissionWindow(a, opensAt, closesAt));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<Assignment> {
    const published = await this.mutate(tenantId, id, (a) => publishAssignment(a));
    await this.emit(assignmentPublished(published));
    return published;
  }

  async recordSubmission(
    tenantId: TenantId,
    id: Uuid,
    input: RecordSubmissionInput,
  ): Promise<Assignment> {
    if (this.students && !(await this.students.exists(tenantId, input.studentId))) {
      throw new StudentNotFoundForTeachingError(input.studentId);
    }
    const submission = {
      studentId: input.studentId,
      status: input.status,
      submittedAt: input.submittedAt ?? null,
      note: input.note ?? null,
    };
    const updated = await this.mutate(tenantId, id, (a) =>
      recordAssignmentSubmission(a, submission),
    );
    await this.emit(assignmentSubmitted(updated, submission));
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<Assignment> {
    return this.mutate(tenantId, id, (a) => closeAssignment(a));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Assignment> {
    return this.require(tenantId, id);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<Assignment[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  async listForSection(tenantId: TenantId, sectionId: Uuid): Promise<Assignment[]> {
    return this.repository.listBySection(tenantId, sectionId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assignment[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (assignment: Assignment) => Assignment,
  ): Promise<Assignment> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Assignment> {
    const assignment = await this.repository.findById(tenantId, id);
    if (!assignment) {
      throw new AssignmentNotFoundError(id);
    }
    return assignment;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
