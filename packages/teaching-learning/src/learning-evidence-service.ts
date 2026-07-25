import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  InstructionalActivityNotFoundError,
  LearningEvidenceNotFoundError,
  OrganizationNotFoundForTeachingError,
  StudentNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import {
  amendEvidenceDescription,
  createLearningEvidence,
  type LearningEvidence,
  setEvidenceOutcomes,
} from "./learning-evidence";
import type { InstructionalActivityKind, LearningEvidenceType } from "./learning-evidence-type";
import { learningEvidenceCaptured } from "./teaching-learning-events";
import type {
  AssignmentRepository,
  ClassroomSessionRepository,
  LearningEvidenceRepository,
  LessonPlanRepository,
  OrganizationDirectory,
  StudentDirectory,
  SubjectDirectory,
} from "./ports";

export interface LearningEvidenceServiceDeps {
  readonly repository: LearningEvidenceRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly subjects?: SubjectDirectory;
  readonly lessonPlans?: LessonPlanRepository;
  readonly sessions?: ClassroomSessionRepository;
  readonly assignments?: AssignmentRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CaptureLearningEvidenceInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly evidenceType: LearningEvidenceType;
  readonly activityKind: InstructionalActivityKind;
  readonly activityId: Uuid;
  readonly title: string;
  readonly subjectId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly description?: string | null;
  readonly capturedAt?: string | null;
  readonly capturedBy?: Uuid | null;
}

/**
 * Application service for learning evidence. Captures evidence about a validated Student,
 * **linked to a validated instructional activity** (a lesson plan, classroom session or
 * assignment), so learning is always traceable to the instruction that produced it. Publishes
 * {@link learningEvidenceCaptured}. Never a grade — evaluation belongs to the Assessment platform.
 */
export class LearningEvidenceService {
  private readonly repository: LearningEvidenceRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly subjects: SubjectDirectory | undefined;
  private readonly lessonPlans: LessonPlanRepository | undefined;
  private readonly sessions: ClassroomSessionRepository | undefined;
  private readonly assignments: AssignmentRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearningEvidenceServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.subjects = deps.subjects;
    this.lessonPlans = deps.lessonPlans;
    this.sessions = deps.sessions;
    this.assignments = deps.assignments;
    this.events = deps.events;
  }

  async capture(input: CaptureLearningEvidenceInput): Promise<LearningEvidence> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForTeachingError(input.studentId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    await this.assertActivityExists(input.tenantId, input.activityKind, input.activityId);
    const evidence = createLearningEvidence(input);
    await this.repository.save(evidence);
    await this.emit(learningEvidenceCaptured(evidence));
    return evidence;
  }

  async amendDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<LearningEvidence> {
    return this.mutate(tenantId, id, (e) => amendEvidenceDescription(e, description));
  }

  async setOutcomes(
    tenantId: TenantId,
    id: Uuid,
    outcomeIds: readonly Uuid[],
  ): Promise<LearningEvidence> {
    return this.mutate(tenantId, id, (e) => setEvidenceOutcomes(e, outcomeIds));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearningEvidence> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningEvidence[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForActivity(
    tenantId: TenantId,
    activityKind: InstructionalActivityKind,
    activityId: Uuid,
  ): Promise<LearningEvidence[]> {
    return this.repository.listByActivity(tenantId, activityKind, activityId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningEvidence[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Validate the linked instructional activity exists, when its repository is wired. */
  private async assertActivityExists(
    tenantId: TenantId,
    activityKind: InstructionalActivityKind,
    activityId: Uuid,
  ): Promise<void> {
    const found =
      activityKind === "lesson_plan"
        ? this.lessonPlans
          ? await this.lessonPlans.findById(tenantId, activityId)
          : true
        : activityKind === "classroom_session"
          ? this.sessions
            ? await this.sessions.findById(tenantId, activityId)
            : true
          : this.assignments
            ? await this.assignments.findById(tenantId, activityId)
            : true;
    if (!found) {
      throw new InstructionalActivityNotFoundError(activityKind, activityId);
    }
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (evidence: LearningEvidence) => LearningEvidence,
  ): Promise<LearningEvidence> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LearningEvidence> {
    const evidence = await this.repository.findById(tenantId, id);
    if (!evidence) {
      throw new LearningEvidenceNotFoundError(id);
    }
    return evidence;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
