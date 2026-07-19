import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** The academic-progression events that make up a learner's longitudinal journey. */
export type JourneyEventType =
  "enrollment" | "promotion" | "retention" | "transfer" | "withdrawal" | "graduation";

/** An immutable entry in a student's educational journey. */
export interface JourneyEntry {
  readonly type: JourneyEventType;
  readonly academicYear: string | null;
  readonly fromGrade: string | null;
  readonly toGrade: string | null;
  readonly on: string;
  readonly note: string | null;
}

/**
 * The longitudinal academic journey of a {@link Student} — an append-only record of
 * progression (enrolment, promotion, retention, transfer, withdrawal, graduation).
 * One per student; entries are never edited or removed.
 */
export interface EducationalJourney {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
  readonly entries: readonly JourneyEntry[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface StartJourneyParams {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
}

/** Open a student's (empty) educational journey. */
export function startJourney(params: StartJourneyParams): EducationalJourney {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    studentId: params.studentId,
    organizationId: params.organizationId,
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface RecordProgressionParams {
  readonly type: JourneyEventType;
  readonly academicYear?: string | null;
  readonly fromGrade?: string | null;
  readonly toGrade?: string | null;
  readonly note?: string | null;
  readonly on?: string | null;
}

/** Append a progression event to the journey (append-only). */
export function recordProgression(
  journey: EducationalJourney,
  params: RecordProgressionParams,
): EducationalJourney {
  const entry: JourneyEntry = {
    type: params.type,
    academicYear: params.academicYear?.trim() || null,
    fromGrade: params.fromGrade?.trim() || null,
    toGrade: params.toGrade?.trim() || null,
    on: params.on ?? nowIso().slice(0, 10),
    note: params.note?.trim() || null,
  };
  return { ...journey, entries: [...journey.entries, entry], updatedAt: nowIso() };
}
