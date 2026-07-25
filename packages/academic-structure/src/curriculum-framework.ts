import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type CurriculumRevision, type CurriculumStatus } from "./curriculum";
import { CurriculumArchivedError, EmptyCurriculumFieldError } from "./errors";

/**
 * A curriculum framework — the definition of a board-affiliated curriculum an
 * organization teaches under: its learning philosophy, competency model, assessment
 * philosophy and subject framework. Version-controlled: the framework carries a version
 * counter and an append-only revision log, so revising it produces a new version while
 * preserving the history. One per (organization, code). Multiple frameworks (e.g. CBSE and
 * IB) coexist within one organization without conflict.
 */
export interface CurriculumFramework {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly board: string;
  readonly version: number;
  readonly status: CurriculumStatus;
  readonly learningPhilosophy: string | null;
  readonly competencyModel: string | null;
  readonly assessmentPhilosophy: string | null;
  readonly subjectFramework: readonly string[];
  readonly revisions: readonly CurriculumRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCurriculumFrameworkParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly board: string;
  readonly learningPhilosophy?: string | null;
  readonly competencyModel?: string | null;
  readonly assessmentPhilosophy?: string | null;
  readonly subjectFramework?: readonly string[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyCurriculumFieldError(field);
  }
  return trimmed;
};

const normalizeList = (items: readonly string[]): string[] => [
  ...new Set(items.map((i) => i.trim()).filter((i) => i.length > 0)),
];

/** Create a new draft curriculum framework at version 1. */
export function createCurriculumFramework(
  params: CreateCurriculumFrameworkParams,
): CurriculumFramework {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name: requireText(params.name, "name"),
    code: requireText(params.code, "code"),
    board: requireText(params.board, "board"),
    version: 1,
    status: "draft",
    learningPhilosophy: params.learningPhilosophy?.trim() || null,
    competencyModel: params.competencyModel?.trim() || null,
    assessmentPhilosophy: params.assessmentPhilosophy?.trim() || null,
    subjectFramework: params.subjectFramework ? normalizeList(params.subjectFramework) : [],
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

const assertNotArchived = (framework: CurriculumFramework): void => {
  if (framework.status === "archived") {
    throw new CurriculumArchivedError(framework.id);
  }
};

const touch = (
  framework: CurriculumFramework,
  patch: Partial<CurriculumFramework>,
): CurriculumFramework => ({ ...framework, ...patch, updatedAt: nowIso() });

/** Set (or clear) the learning philosophy. Not permitted once archived. */
export function setLearningPhilosophy(
  framework: CurriculumFramework,
  philosophy: string | null,
): CurriculumFramework {
  assertNotArchived(framework);
  return touch(framework, { learningPhilosophy: philosophy?.trim() || null });
}

/** Set (or clear) the competency model. Not permitted once archived. */
export function setCompetencyModel(
  framework: CurriculumFramework,
  model: string | null,
): CurriculumFramework {
  assertNotArchived(framework);
  return touch(framework, { competencyModel: model?.trim() || null });
}

/** Set (or clear) the assessment philosophy. Not permitted once archived. */
export function setAssessmentPhilosophy(
  framework: CurriculumFramework,
  philosophy: string | null,
): CurriculumFramework {
  assertNotArchived(framework);
  return touch(framework, { assessmentPhilosophy: philosophy?.trim() || null });
}

/** Set the subject framework (trimmed, non-empty, deduplicated). Not once archived. */
export function setSubjectFramework(
  framework: CurriculumFramework,
  subjects: readonly string[],
): CurriculumFramework {
  assertNotArchived(framework);
  return touch(framework, { subjectFramework: normalizeList(subjects) });
}

/** Activate the framework for use (draft → active). Not permitted once archived. */
export function activateCurriculum(framework: CurriculumFramework): CurriculumFramework {
  assertNotArchived(framework);
  return touch(framework, { status: "active" });
}

/**
 * Revise the framework — bump the version and append to the revision log. Not permitted
 * once archived. The framework stays active (or moves from draft to active).
 */
export function reviseCurriculum(
  framework: CurriculumFramework,
  note: string,
): CurriculumFramework {
  assertNotArchived(framework);
  const version = framework.version + 1;
  const revision: CurriculumRevision = {
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

/** Archive the framework (superseded). */
export function archiveCurriculum(framework: CurriculumFramework): CurriculumFramework {
  return touch(framework, { status: "archived" });
}
