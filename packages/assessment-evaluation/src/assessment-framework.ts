import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  AssessmentFrameworkRevision,
  AssessmentFrameworkStatus,
  AssessmentModel,
  GradeBand,
} from "./assessment-framework-value";
import {
  AssessmentFrameworkArchivedError,
  AssessmentFrameworkStateError,
  EmptyAssessmentFrameworkFieldError,
} from "./errors";

/**
 * An institution's assessment philosophy — the assessment model (traditional / CCE / CBE /
 * competency-based / hybrid), the weightage rules that combine assessment types, the grading
 * model (grade bands consumed by the pure grading engine), the competency model, and the
 * promotion criteria. Version-controlled (counter + revision log), one per (organization, code),
 * across draft → active → archived; only an active framework governs assessment. Multiple
 * frameworks coexist per institution.
 */
export interface AssessmentFramework {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly assessmentModel: AssessmentModel;
  readonly weightageRules: Readonly<Record<string, unknown>>;
  readonly gradeBands: readonly GradeBand[];
  readonly competencyModel: readonly string[];
  readonly promotionCriteria: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly status: AssessmentFrameworkStatus;
  readonly revisions: readonly AssessmentFrameworkRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssessmentFrameworkParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly assessmentModel: AssessmentModel;
  readonly weightageRules?: Readonly<Record<string, unknown>>;
  readonly gradeBands?: readonly GradeBand[];
  readonly competencyModel?: readonly string[];
  readonly promotionCriteria?: Readonly<Record<string, unknown>>;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAssessmentFrameworkFieldError(field);
  }
  return trimmed;
};

const touch = (
  framework: AssessmentFramework,
  patch: Partial<AssessmentFramework>,
): AssessmentFramework => ({
  ...framework,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (framework: AssessmentFramework): void => {
  if (framework.status === "archived") {
    throw new AssessmentFrameworkArchivedError(framework.id);
  }
};

/** Create a new draft assessment framework at version 1. */
export function createAssessmentFramework(
  params: CreateAssessmentFrameworkParams,
): AssessmentFramework {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code: requireText(params.code, "code"),
    name: requireText(params.name, "name"),
    assessmentModel: params.assessmentModel,
    weightageRules: params.weightageRules ? { ...params.weightageRules } : {},
    gradeBands: params.gradeBands ? [...params.gradeBands] : [],
    competencyModel: params.competencyModel ? [...params.competencyModel] : [],
    promotionCriteria: params.promotionCriteria ? { ...params.promotionCriteria } : {},
    version: 1,
    status: "draft",
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the framework. Not permitted once archived. */
export function renameAssessmentFramework(
  framework: AssessmentFramework,
  name: string,
): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { name: requireText(name, "name") });
}

/** Replace the weightage rules. Not permitted once archived. */
export function setWeightageRules(
  framework: AssessmentFramework,
  weightageRules: Readonly<Record<string, unknown>>,
): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { weightageRules: { ...weightageRules } });
}

/** Replace the grading model's grade bands. Not permitted once archived. */
export function setGradeBands(
  framework: AssessmentFramework,
  gradeBands: readonly GradeBand[],
): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { gradeBands: [...gradeBands] });
}

/** Replace the competency model. Not permitted once archived. */
export function setCompetencyModel(
  framework: AssessmentFramework,
  competencyModel: readonly string[],
): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { competencyModel: [...competencyModel] });
}

/** Replace the promotion criteria. Not permitted once archived. */
export function setPromotionCriteria(
  framework: AssessmentFramework,
  promotionCriteria: Readonly<Record<string, unknown>>,
): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { promotionCriteria: { ...promotionCriteria } });
}

/** Activate the framework so it governs assessment (draft → active). */
export function activateAssessmentFramework(framework: AssessmentFramework): AssessmentFramework {
  assertNotArchived(framework);
  return touch(framework, { status: "active" });
}

/**
 * Revise the framework — bump the version and append to the revision log, keeping it active. Only
 * an active framework may be revised; a draft must be activated first (revise is not a shortcut
 * into `active`).
 */
export function reviseAssessmentFramework(
  framework: AssessmentFramework,
  note: string,
): AssessmentFramework {
  assertNotArchived(framework);
  if (framework.status !== "active") {
    throw new AssessmentFrameworkStateError(framework.id, "active", framework.status);
  }
  const version = framework.version + 1;
  const revision: AssessmentFrameworkRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(framework, {
    version,
    status: "active",
    revisions: [...framework.revisions, revision],
  });
}

/** Archive the framework. Terminal — an archived framework is immutable. */
export function archiveAssessmentFramework(framework: AssessmentFramework): AssessmentFramework {
  return touch(framework, { status: "archived" });
}
