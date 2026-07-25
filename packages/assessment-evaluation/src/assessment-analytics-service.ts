import type { TenantId, Uuid } from "@knowget/types";
import type { Assessment } from "./assessment";
import { computeAssessmentIndicators } from "./assessment-intelligence";
import type { AssessmentIndicators } from "./assessment-view";
import type {
  AssessmentRepository,
  CompetencyProfileRepository,
  EvaluationRepository,
} from "./ports";

export interface AssessmentAnalyticsServiceDeps {
  readonly assessments: AssessmentRepository;
  readonly evaluations: EvaluationRepository;
  readonly competencyProfiles: CompetencyProfileRepository;
}

/**
 * Orchestrates the pure assessment-intelligence engine over the persisted aggregates — the seam
 * where assessments, evaluations and competency profiles meet the indicator engine. The
 * aggregates structurally satisfy the engine's view interfaces, so no mapping is required.
 * Read-only, descriptive analytics; it computes nothing predictive and mutates nothing.
 */
export class AssessmentAnalyticsService {
  private readonly assessments: AssessmentRepository;
  private readonly evaluations: EvaluationRepository;
  private readonly competencyProfiles: CompetencyProfileRepository;

  constructor(deps: AssessmentAnalyticsServiceDeps) {
    this.assessments = deps.assessments;
    this.evaluations = deps.evaluations;
    this.competencyProfiles = deps.competencyProfiles;
  }

  /**
   * Assessment indicators for a subject — the subject's assessments and every evaluation recorded
   * against them (competency mastery is learner-scoped, so it is not part of subject analytics).
   */
  async forSubject(tenantId: TenantId, subjectId: Uuid): Promise<AssessmentIndicators> {
    const assessments = await this.assessments.listBySubject(tenantId, subjectId);
    const evaluationLists = await Promise.all(
      assessments.map((a) => this.evaluations.listByAssessment(tenantId, a.id)),
    );
    return computeAssessmentIndicators({ assessments, evaluations: evaluationLists.flat() });
  }

  /**
   * Assessment indicators for a learner — their evaluations, the assessments those evaluations
   * were recorded against, and their competency masteries.
   */
  async forStudent(tenantId: TenantId, studentId: Uuid): Promise<AssessmentIndicators> {
    const [evaluations, profile] = await Promise.all([
      this.evaluations.listByStudent(tenantId, studentId),
      this.competencyProfiles.findByStudent(tenantId, studentId),
    ]);
    const assessmentIds = [...new Set(evaluations.map((e) => e.assessmentId))];
    const assessments = (
      await Promise.all(assessmentIds.map((id) => this.assessments.findById(tenantId, id)))
    ).filter((a): a is Assessment => a !== null);
    return computeAssessmentIndicators({
      assessments,
      evaluations,
      competencies: profile?.competencies ?? [],
    });
  }

  /** Assessment indicators for a whole organization. */
  async forOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentIndicators> {
    const [assessments, evaluations, profiles] = await Promise.all([
      this.assessments.listByOrganization(tenantId, organizationId),
      this.evaluations.listByOrganization(tenantId, organizationId),
      this.competencyProfiles.listByOrganization(tenantId, organizationId),
    ]);
    return computeAssessmentIndicators({
      assessments,
      evaluations,
      competencies: profiles.flatMap((p) => p.competencies),
    });
  }
}
