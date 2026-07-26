import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type AdmissionEvaluation, recordAdmissionEvaluation } from "./admission-evaluation";
import type { EvaluationRecommendation, EvaluationType } from "./admissions-value";
import { evaluationRecorded } from "./admissions-events";
import { ApplicationNotEvaluableError, ApplicationNotFoundError } from "./errors";
import type { AdmissionEvaluationRepository, ApplicationRepository } from "./ports";

export interface RecordEvaluationInput {
  readonly tenantId: TenantId;
  readonly applicationId: Uuid;
  readonly type: EvaluationType;
  readonly score: number;
  readonly recommendation: EvaluationRecommendation;
  readonly evaluatedOn: string;
}

export interface AdmissionEvaluationServiceDeps {
  readonly repository: AdmissionEvaluationRepository;
  readonly applications: ApplicationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for admission evaluations — the append-only screening log per application. Records an
 * evaluation (validating the application exists and is under review or at interview, and a 0–100 score),
 * deriving the organization from the application, and publishes the evaluation event. Evaluations are
 * immutable, so there is no update or delete.
 */
export class AdmissionEvaluationService {
  private readonly repository: AdmissionEvaluationRepository;
  private readonly applications: ApplicationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AdmissionEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.applications = deps.applications;
    this.events = deps.events;
  }

  async record(input: RecordEvaluationInput): Promise<AdmissionEvaluation> {
    const application = await this.applications.findById(input.tenantId, input.applicationId);
    if (!application) {
      throw new ApplicationNotFoundError(input.applicationId);
    }
    if (application.status !== "under_review" && application.status !== "interview") {
      throw new ApplicationNotEvaluableError(input.applicationId);
    }
    const evaluation = recordAdmissionEvaluation({
      tenantId: input.tenantId,
      organizationId: application.organizationId,
      applicationId: input.applicationId,
      type: input.type,
      score: input.score,
      recommendation: input.recommendation,
      evaluatedOn: input.evaluatedOn,
    });
    await this.repository.save(evaluation);
    await this.emit(evaluationRecorded(evaluation));
    return evaluation;
  }

  async listForApplication(
    tenantId: TenantId,
    applicationId: Uuid,
  ): Promise<AdmissionEvaluation[]> {
    return this.repository.listByApplication(tenantId, applicationId);
  }

  async countForApplication(tenantId: TenantId, applicationId: Uuid): Promise<number> {
    return this.repository.countByApplication(tenantId, applicationId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
