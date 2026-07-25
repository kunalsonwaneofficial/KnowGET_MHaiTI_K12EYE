import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyGradeFieldError, InvalidAgeRangeError } from "./errors";

/** The lifecycle of a grade. */
export type GradeStatus = "active" | "archived";

/**
 * A grade (grade level) within an academic program — e.g. "Grade 1". Grades form the
 * institution's academic ladder: each carries a numeric `level` for hierarchy ordering, an
 * optional promotion target (`nextGradeId`) and rule, and age guidelines. A grade belongs
 * to a Program and derives its organization from it. Classes are created within a grade.
 */
export interface Grade {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly programId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly level: number;
  readonly nextGradeId: Uuid | null;
  readonly promotionRule: string | null;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly status: GradeStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateGradeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly programId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly level: number;
  readonly promotionRule?: string | null;
  readonly minAge?: number | null;
  readonly maxAge?: number | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyGradeFieldError(field);
  }
  return trimmed;
};

const assertAgeRange = (minAge: number | null, maxAge: number | null): void => {
  if (minAge !== null && maxAge !== null && maxAge < minAge) {
    throw new InvalidAgeRangeError(minAge, maxAge);
  }
};

/** Create a new, active grade within a program. */
export function createGrade(params: CreateGradeParams): Grade {
  const minAge = params.minAge ?? null;
  const maxAge = params.maxAge ?? null;
  assertAgeRange(minAge, maxAge);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    programId: params.programId,
    name: requireText(params.name, "name"),
    code: requireText(params.code, "code"),
    level: params.level,
    nextGradeId: null,
    promotionRule: params.promotionRule?.trim() || null,
    minAge,
    maxAge,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (grade: Grade, patch: Partial<Grade>): Grade => ({
  ...grade,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename the grade. */
export const renameGrade = (grade: Grade, name: string): Grade =>
  touch(grade, { name: requireText(name, "name") });

/** Set the grade's hierarchy level. */
export const setGradeLevel = (grade: Grade, level: number): Grade => touch(grade, { level });

/** Set (or clear) the promotion target grade — the next grade in the ladder. */
export const setNextGrade = (grade: Grade, nextGradeId: Uuid | null): Grade =>
  touch(grade, { nextGradeId });

/** Set (or clear) the promotion rule. */
export const setPromotionRule = (grade: Grade, rule: string | null): Grade =>
  touch(grade, { promotionRule: rule?.trim() || null });

/** Set (or clear) the age guidelines. */
export function setAgeGuidelines(
  grade: Grade,
  minAge: number | null,
  maxAge: number | null,
): Grade {
  assertAgeRange(minAge, maxAge);
  return touch(grade, { minAge, maxAge });
}

/** Archive the grade. */
export const archiveGrade = (grade: Grade): Grade => touch(grade, { status: "archived" });

/** Reactivate an archived grade. */
export const activateGrade = (grade: Grade): Grade => touch(grade, { status: "active" });
