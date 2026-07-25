import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CompetencyMastery, MasteryChange, MasteryLevel } from "./competency-value";
import { EmptyCompetencyFieldError } from "./errors";

/**
 * A learner's competency profile — the mastery level of each competency, an append-only growth
 * trajectory, and the learning-evidence that supports each mastery. Mastery is tracked
 * **independently of raw marks** (the P2-D10 definition of done): it is set from evidence and
 * evaluation judgement, never derived from a percentage. One per student.
 */
export interface CompetencyProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly competencies: readonly CompetencyMastery[];
  readonly trajectory: readonly MasteryChange[];
  readonly version: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCompetencyProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

export interface SetMasteryParams {
  readonly competencyId: string;
  readonly name: string;
  readonly masteryLevel: MasteryLevel;
  readonly evidenceRefs?: readonly Uuid[];
  readonly note?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyCompetencyFieldError(field);
  }
  return trimmed;
};

const touch = (
  profile: CompetencyProfile,
  patch: Partial<CompetencyProfile>,
): CompetencyProfile => ({
  ...profile,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a new empty competency profile for a student at version 1. */
export function createCompetencyProfile(params: CreateCompetencyProfileParams): CompetencyProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    competencies: [],
    trajectory: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Set (or upsert) a competency's mastery. When the level changes, the change is appended to the
 * growth trajectory and the version bumped; the supporting evidence is recorded. Idempotent on
 * an unchanged level (still refreshes evidence and timestamp).
 */
export function setCompetencyMastery(
  profile: CompetencyProfile,
  params: SetMasteryParams,
): CompetencyProfile {
  const competencyId = requireText(params.competencyId, "id");
  const name = requireText(params.name, "name");
  const now = nowIso();
  const existing = profile.competencies.find((c) => c.competencyId === competencyId);
  const mastery: CompetencyMastery = {
    competencyId,
    name,
    masteryLevel: params.masteryLevel,
    evidenceRefs: params.evidenceRefs ? [...params.evidenceRefs] : (existing?.evidenceRefs ?? []),
    updatedAt: now,
  };
  const competencies = existing
    ? profile.competencies.map((c) => (c.competencyId === competencyId ? mastery : c))
    : [...profile.competencies, mastery];

  const levelChanged = !existing || existing.masteryLevel !== params.masteryLevel;
  if (!levelChanged) {
    return touch(profile, { competencies });
  }
  const change: MasteryChange = {
    competencyId,
    fromLevel: existing?.masteryLevel ?? "not_assessed",
    toLevel: params.masteryLevel,
    changedAt: now,
    note: params.note?.trim() || null,
  };
  return touch(profile, {
    competencies,
    trajectory: [...profile.trajectory, change],
    version: profile.version + 1,
  });
}
