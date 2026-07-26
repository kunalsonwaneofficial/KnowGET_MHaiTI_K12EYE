import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidEvaluationScoreError } from "./errors";
import type { EvaluationRecommendation, EvaluationType } from "./admissions-value";

/**
 * An admission evaluation — an immutable, append-only record of one entrance evaluation (an entrance test, an
 * interview, a portfolio review, …) for an application: its type, a 0–100 score, and the evaluator's
 * recommendation (recommend / hold / not_recommend). It has no lifecycle and no edit or delete path — an
 * evaluation is a fact; a re-evaluation is a new record. It is an admissions screening, distinct from an
 * academic assessment (P2-D10).
 */
export interface AdmissionEvaluation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly applicationId: Uuid;
  readonly type: EvaluationType;
  readonly score: number;
  readonly recommendation: EvaluationRecommendation;
  readonly evaluatedOn: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordAdmissionEvaluationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly applicationId: Uuid;
  readonly type: EvaluationType;
  readonly score: number;
  readonly recommendation: EvaluationRecommendation;
  readonly evaluatedOn: string;
}

/** Record an admission evaluation. Immutable: score validated (0–100 integer), no update path. */
export function recordAdmissionEvaluation(
  params: RecordAdmissionEvaluationParams,
): AdmissionEvaluation {
  if (!Number.isInteger(params.score) || params.score < 0 || params.score > 100) {
    throw new InvalidEvaluationScoreError(params.score);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    applicationId: params.applicationId,
    type: params.type,
    score: params.score,
    recommendation: params.recommendation,
    evaluatedOn: params.evaluatedOn,
    createdAt: now,
    updatedAt: now,
  };
}
