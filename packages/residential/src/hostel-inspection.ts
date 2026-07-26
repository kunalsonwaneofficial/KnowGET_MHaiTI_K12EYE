import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidInspectionDatesError } from "./errors";
import type { ComplianceStatus, InspectionOutcome, InspectionType } from "./residential-value";
import type { InspectionCompliance } from "./residential-view";

/** The default window (in days) before the next-due date within which an inspection is `due_soon`. */
export const DEFAULT_WARNING_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A statutory hostel inspection tracked for compliance — fire safety, hygiene, electrical, structural or
 * security — with the date it was conducted, its outcome, and when the next inspection is due. Exactly
 * one inspection of each type per hostel (re-inspected in place). Its compliance (`valid` / `due_soon` /
 * `overdue`) is derived from the next-due date as of a given date, never stored. The organization is
 * derived from the hostel.
 */
export interface HostelInspection {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly type: InspectionType;
  readonly conductedOn: string;
  readonly outcome: InspectionOutcome;
  readonly nextDueOn: string;
  readonly inspector: string | null;
  readonly notes: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordInspectionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly type: InspectionType;
  readonly conductedOn: string;
  readonly outcome: InspectionOutcome;
  readonly nextDueOn: string;
  readonly inspector?: string | null;
  readonly notes?: string | null;
}

const requireDate = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || Number.isNaN(new Date(trimmed).getTime())) {
    throw new InvalidInspectionDatesError(`the ${label} must be a valid date`);
  }
  return trimmed;
};

function validateDates(
  conductedOn: string,
  nextDueOn: string,
): { conductedOn: string; nextDueOn: string } {
  const conducted = requireDate(conductedOn, "conducted date");
  const nextDue = requireDate(nextDueOn, "next-due date");
  if (nextDue < conducted) {
    throw new InvalidInspectionDatesError("the next-due date cannot be before the conducted date");
  }
  return { conductedOn: conducted, nextDueOn: nextDue };
}

/** Record a hostel inspection. Valid conducted/next-due dates (next-due ≥ conducted) required. */
export function recordHostelInspection(params: RecordInspectionParams): HostelInspection {
  const dates = validateDates(params.conductedOn, params.nextDueOn);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    type: params.type,
    conductedOn: dates.conductedOn,
    outcome: params.outcome,
    nextDueOn: dates.nextDueOn,
    inspector: params.inspector?.trim() || null,
    notes: params.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  inspection: HostelInspection,
  patch: Partial<HostelInspection>,
): HostelInspection => ({
  ...inspection,
  ...patch,
  updatedAt: nowIso(),
});

/** Re-inspect a hostel — record a fresh conducted date, outcome and next-due date in place. */
export function reinspectHostel(
  inspection: HostelInspection,
  conductedOn: string,
  outcome: InspectionOutcome,
  nextDueOn: string,
  inspector?: string | null,
): HostelInspection {
  const dates = validateDates(conductedOn, nextDueOn);
  return touch(inspection, {
    conductedOn: dates.conductedOn,
    outcome,
    nextDueOn: dates.nextDueOn,
    inspector: inspector === undefined ? inspection.inspector : inspector?.trim() || null,
  });
}

/** Set (or clear) the inspection notes. */
export const setInspectionNotes = (
  inspection: HostelInspection,
  notes: string | null,
): HostelInspection => touch(inspection, { notes: notes?.trim() || null });

/** Whole days from one date-only value to another (UTC), positive when `toDate` is later. */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * The inspection's compliance as of a date — `overdue` once the next-due date has passed, `due_soon`
 * within the warning window (default 30 days, inclusive of the due day), else `valid`. Deterministic (no
 * clock); the caller passes the as-of date.
 */
export function inspectionComplianceAsOf(
  inspection: HostelInspection,
  asOfDate: string,
  warningDays: number = DEFAULT_WARNING_DAYS,
): InspectionCompliance {
  const daysToDue = daysBetween(asOfDate, inspection.nextDueOn);
  let status: ComplianceStatus;
  if (daysToDue < 0) {
    status = "overdue";
  } else if (daysToDue <= warningDays) {
    status = "due_soon";
  } else {
    status = "valid";
  }
  return {
    type: inspection.type,
    lastOutcome: inspection.outcome,
    nextDueOn: inspection.nextDueOn,
    status,
    daysToDue,
  };
}
