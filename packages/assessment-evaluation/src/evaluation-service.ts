import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { evaluationApproved, evaluationSubmitted } from "./assessment-evaluation-events";
import {
  amendEvaluationRemarks,
  approveEvaluation,
  createEvaluation,
  type Evaluation,
  moderateEvaluation,
  recordMarks,
  recordRubricScores,
  reopenEvaluation,
  submitEvaluation,
} from "./evaluation";
import type { EvaluationType, RubricScore } from "./evaluation-value";
import {
  AssessmentNotFoundForEvaluationError,
  DuplicateEvaluationError,
  EvaluationNotFoundError,
  StudentNotFoundForAssessmentError,
} from "./errors";
import type { AssessmentRepository, EvaluationRepository, StudentDirectory } from "./ports";

export interface EvaluationServiceDeps {
  readonly repository: EvaluationRepository;
  readonly assessments: AssessmentRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateEvaluationInput {
  readonly tenantId: TenantId;
  readonly assessmentId: Uuid;
  readonly studentId: Uuid;
  readonly evaluationType?: EvaluationType;
  readonly evaluatedBy?: Uuid | null;
}

/**
 * Application service for evaluations. Creates an evaluation for a validated Student against a
 * validated Assessment (inheriting its organization and maximum marks), enforces one evaluation
 * per (assessment, student), and drives the auditable draft → submitted → moderated → approved
 * workflow with re-evaluation. Publishes {@link evaluationSubmitted} and {@link evaluationApproved}.
 */
export class EvaluationService {
  private readonly repository: EvaluationRepository;
  private readonly assessments: AssessmentRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EvaluationServiceDeps) {
    this.repository = deps.repository;
    this.assessments = deps.assessments;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateEvaluationInput): Promise<Evaluation> {
    const assessment = await this.assessments.findById(input.tenantId, input.assessmentId);
    if (!assessment) {
      throw new AssessmentNotFoundForEvaluationError(input.assessmentId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForAssessmentError(input.studentId);
    }
    if (
      await this.repository.findByAssessmentAndStudent(
        input.tenantId,
        input.assessmentId,
        input.studentId,
      )
    ) {
      throw new DuplicateEvaluationError(input.assessmentId, input.studentId);
    }
    const evaluation = createEvaluation({
      tenantId: input.tenantId,
      organizationId: assessment.organizationId,
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      maximumMarks: assessment.maximumMarks,
      ...(input.evaluationType !== undefined ? { evaluationType: input.evaluationType } : {}),
      ...(input.evaluatedBy !== undefined ? { evaluatedBy: input.evaluatedBy } : {}),
    });
    await this.repository.save(evaluation);
    return evaluation;
  }

  async recordMarks(
    tenantId: TenantId,
    id: Uuid,
    marksAwarded: number,
    actor: Uuid | null = null,
  ): Promise<Evaluation> {
    return this.mutate(tenantId, id, (e) => recordMarks(e, marksAwarded, actor));
  }

  async recordRubricScores(
    tenantId: TenantId,
    id: Uuid,
    rubricScores: readonly RubricScore[],
    actor: Uuid | null = null,
  ): Promise<Evaluation> {
    return this.mutate(tenantId, id, (e) => recordRubricScores(e, rubricScores, actor));
  }

  async amendRemarks(tenantId: TenantId, id: Uuid, remarks: string | null): Promise<Evaluation> {
    return this.mutate(tenantId, id, (e) => amendEvaluationRemarks(e, remarks));
  }

  async submit(tenantId: TenantId, id: Uuid, actor: Uuid | null = null): Promise<Evaluation> {
    const submitted = await this.mutate(tenantId, id, (e) => submitEvaluation(e, actor));
    await this.emit(evaluationSubmitted(submitted));
    return submitted;
  }

  async moderate(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<Evaluation> {
    return this.mutate(tenantId, id, (e) => moderateEvaluation(e, actor, note));
  }

  async approve(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<Evaluation> {
    const approved = await this.mutate(tenantId, id, (e) => approveEvaluation(e, actor, note));
    await this.emit(evaluationApproved(approved));
    return approved;
  }

  async reopen(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<Evaluation> {
    return this.mutate(tenantId, id, (e) => reopenEvaluation(e, actor, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Evaluation> {
    return this.require(tenantId, id);
  }

  async listForAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<Evaluation[]> {
    return this.repository.listByAssessment(tenantId, assessmentId);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Evaluation[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (evaluation: Evaluation) => Evaluation,
  ): Promise<Evaluation> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Evaluation> {
    const evaluation = await this.repository.findById(tenantId, id);
    if (!evaluation) {
      throw new EvaluationNotFoundError(id);
    }
    return evaluation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
