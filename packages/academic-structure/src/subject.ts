import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySubjectFieldError, InvalidCreditsError, SelfPrerequisiteError } from "./errors";

/** Whether a subject is compulsory or chosen. */
export type SubjectKind = "mandatory" | "elective";

/** The lifecycle of a subject. */
export type SubjectStatus = "active" | "archived";

/**
 * A subject in an organization's catalog — mandatory or elective, optionally
 * cross-disciplinary, with a credit allocation, an elective group, prerequisite subjects
 * and a version counter that increments on every change. One per (organization, code).
 * Learning outcomes attach to subjects; timetables and assessments (other domains) consume
 * them.
 */
export interface Subject {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly kind: SubjectKind;
  readonly credits: number | null;
  readonly electiveGroup: string | null;
  readonly crossDisciplinary: boolean;
  readonly prerequisites: readonly Uuid[];
  readonly version: number;
  readonly status: SubjectStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSubjectParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly kind: SubjectKind;
  readonly credits?: number | null;
  readonly electiveGroup?: string | null;
  readonly crossDisciplinary?: boolean;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptySubjectFieldError(field);
  }
  return trimmed;
};

const requireCredits = (credits: number | null): number | null => {
  if (credits !== null && (!Number.isFinite(credits) || credits < 0)) {
    throw new InvalidCreditsError(credits);
  }
  return credits;
};

/** Register a new, active subject at version 1. */
export function createSubject(params: CreateSubjectParams): Subject {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name: requireText(params.name, "name"),
    code: requireText(params.code, "code"),
    kind: params.kind,
    credits: requireCredits(params.credits ?? null),
    electiveGroup: params.electiveGroup?.trim() || null,
    crossDisciplinary: params.crossDisciplinary ?? false,
    prerequisites: [],
    version: 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/** Every mutation bumps the version — the subject's version history is its change count. */
const bump = (subject: Subject, patch: Partial<Subject>): Subject => ({
  ...subject,
  ...patch,
  version: subject.version + 1,
  updatedAt: nowIso(),
});

/** Rename the subject. */
export const renameSubject = (subject: Subject, name: string): Subject =>
  bump(subject, { name: requireText(name, "name") });

/** Set whether the subject is mandatory or elective. */
export const setSubjectKind = (subject: Subject, kind: SubjectKind): Subject =>
  bump(subject, { kind });

/** Set (or clear) the credit allocation. */
export const setSubjectCredits = (subject: Subject, credits: number | null): Subject =>
  bump(subject, { credits: requireCredits(credits) });

/** Set (or clear) the elective group. */
export const setElectiveGroup = (subject: Subject, group: string | null): Subject =>
  bump(subject, { electiveGroup: group?.trim() || null });

/** Set whether the subject is cross-disciplinary. */
export const setCrossDisciplinary = (subject: Subject, crossDisciplinary: boolean): Subject =>
  bump(subject, { crossDisciplinary });

/** Add a prerequisite subject (deduplicated; a subject may not require itself). */
export function addPrerequisite(subject: Subject, prerequisiteId: Uuid): Subject {
  if (prerequisiteId === subject.id) {
    throw new SelfPrerequisiteError(subject.id);
  }
  if (subject.prerequisites.includes(prerequisiteId)) {
    return subject;
  }
  return bump(subject, { prerequisites: [...subject.prerequisites, prerequisiteId] });
}

/** Remove a prerequisite subject. */
export const removePrerequisite = (subject: Subject, prerequisiteId: Uuid): Subject =>
  bump(subject, {
    prerequisites: subject.prerequisites.filter((p) => p !== prerequisiteId),
  });

/** Archive the subject. */
export const archiveSubject = (subject: Subject): Subject => bump(subject, { status: "archived" });

/** Reactivate an archived subject. */
export const activateSubject = (subject: Subject): Subject => bump(subject, { status: "active" });
