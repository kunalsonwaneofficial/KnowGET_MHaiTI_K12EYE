import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyClassFieldError } from "./errors";

/** The lifecycle of an academic class. */
export type ClassStatus = "active" | "archived";

/**
 * A class — the running of a grade for one academic year (e.g. "Grade 5, 2026-2027").
 * A class belongs to a Grade and derives its organization from it, and may be assigned a
 * curriculum framework (its academic assignment). Sections divide a class into teachable
 * groups. Multiple classes may exist per grade and year (e.g. a morning and an evening
 * class), unique by name.
 */
export interface AcademicClass {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly gradeId: Uuid;
  readonly academicYear: string;
  readonly name: string;
  readonly curriculumFrameworkId: Uuid | null;
  readonly status: ClassStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAcademicClassParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly gradeId: Uuid;
  readonly academicYear: string;
  readonly name: string;
  readonly curriculumFrameworkId?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyClassFieldError(field);
  }
  return trimmed;
};

/** Create a new, active class within a grade for an academic year. */
export function createAcademicClass(params: CreateAcademicClassParams): AcademicClass {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    gradeId: params.gradeId,
    academicYear: requireText(params.academicYear, "academic year"),
    name: requireText(params.name, "name"),
    curriculumFrameworkId: params.curriculumFrameworkId ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (klass: AcademicClass, patch: Partial<AcademicClass>): AcademicClass => ({
  ...klass,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename the class. */
export const renameClass = (klass: AcademicClass, name: string): AcademicClass =>
  touch(klass, { name: requireText(name, "name") });

/** Assign (or clear) the curriculum framework the class follows — its academic assignment. */
export const assignClassCurriculum = (
  klass: AcademicClass,
  curriculumFrameworkId: Uuid | null,
): AcademicClass => touch(klass, { curriculumFrameworkId });

/** Archive the class. */
export const archiveClass = (klass: AcademicClass): AcademicClass =>
  touch(klass, { status: "archived" });

/** Reactivate an archived class. */
export const activateClass = (klass: AcademicClass): AcademicClass =>
  touch(klass, { status: "active" });
