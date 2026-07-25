import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyTimetableFieldError, TimetableStateError } from "./errors";

/** Lifecycle state of a timetable. */
export type TimetableStatus = "draft" | "published" | "archived";

/** One entry in a timetable's append-only revision log. */
export interface TimetableRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}

/**
 * An official institutional timetable — the schedule for a grade (optionally a specific
 * class/section) in an academic year and term. One per (organization, code). It is
 * version-controlled (a counter plus an append-only revision log) and follows a
 * draft → published → archived lifecycle: a draft is edited freely, publishing is gated by
 * the conflict engine (in the service), and revising a published timetable returns it to
 * draft at the next version so it can be edited and re-published.
 */
export interface Timetable {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string;
  readonly term: string | null;
  readonly gradeId: Uuid;
  readonly classId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly version: number;
  readonly status: TimetableStatus;
  readonly revisions: readonly TimetableRevision[];
  readonly publishedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateTimetableParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string;
  readonly gradeId: Uuid;
  readonly term?: string | null;
  readonly classId?: Uuid | null;
  readonly sectionId?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyTimetableFieldError(field);
  }
  return trimmed;
};

const touch = (timetable: Timetable, patch: Partial<Timetable>): Timetable => ({
  ...timetable,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a new draft timetable at version 1. */
export function createTimetable(params: CreateTimetableParams): Timetable {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code: requireText(params.code, "code"),
    name: requireText(params.name, "name"),
    academicYear: requireText(params.academicYear, "academicYear"),
    term: params.term?.trim() || null,
    gradeId: params.gradeId,
    classId: params.classId ?? null,
    sectionId: params.sectionId ?? null,
    version: 1,
    status: "draft",
    revisions: [],
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the timetable. Not permitted once archived. */
export function renameTimetable(timetable: Timetable, name: string): Timetable {
  assertNotArchived(timetable);
  return touch(timetable, { name: requireText(name, "name") });
}

const assertNotArchived = (timetable: Timetable): void => {
  if (timetable.status === "archived") {
    throw new TimetableStateError(timetable.id, "not archived", timetable.status);
  }
};

/**
 * Publish a draft timetable. The caller (service) MUST have validated the schedule with the
 * conflict engine first; this transition only enforces the lifecycle rule that publication
 * proceeds from a draft.
 */
export function publishTimetable(timetable: Timetable): Timetable {
  if (timetable.status !== "draft") {
    throw new TimetableStateError(timetable.id, "draft", timetable.status);
  }
  return touch(timetable, { status: "published", publishedAt: nowIso() });
}

/**
 * Revise a published timetable — bump the version, append to the revision log and return it
 * to draft (clearing the publication timestamp) so it can be edited and re-published.
 */
export function reviseTimetable(timetable: Timetable, note: string): Timetable {
  if (timetable.status !== "published") {
    throw new TimetableStateError(timetable.id, "published", timetable.status);
  }
  const version = timetable.version + 1;
  const revision: TimetableRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(timetable, {
    version,
    status: "draft",
    publishedAt: null,
    revisions: [...timetable.revisions, revision],
  });
}

/** Archive the timetable (superseded or retired). Terminal. */
export function archiveTimetable(timetable: Timetable): Timetable {
  return touch(timetable, { status: "archived" });
}
