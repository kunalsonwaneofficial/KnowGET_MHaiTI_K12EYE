import type { Uuid } from "@knowget/types";
import type {
  ConflictAllocation,
  ConflictDetectionInput,
  ConflictSlot,
  DetectedConflict,
  SchedulingConstraint,
} from "./conflict";
import { type Interval, minutesOfDay, overlaps } from "./time";
import type { Weekday } from "./weekday";

const toInterval = (item: {
  startsAt: ConflictSlot["startsAt"];
  endsAt: ConflictSlot["endsAt"];
}): Interval => ({
  startMinutes: minutesOfDay(item.startsAt),
  endMinutes: minutesOfDay(item.endsAt),
});

/** Read a strictly-positive finite number parameter, or `null` if absent/malformed. */
const positiveNumberParam = (
  parameters: Readonly<Record<string, unknown>>,
  key: string,
): number | null => {
  const raw = parameters[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Group a list by a derived string key, preserving input order within each group. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(k, [item]);
    }
  }
  return groups;
}

/**
 * Pairwise slot conflicts: for every pair of slots on the same weekday whose time
 * intervals overlap, report a teacher conflict (same teacher), a section conflict (same
 * section) and/or a venue conflict (same, non-null venue). A single overlapping pair can
 * raise more than one kind.
 */
function detectSlotConflicts(slots: readonly ConflictSlot[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const withIntervals = slots.map((slot) => ({ slot, interval: toInterval(slot) }));

  for (let i = 0; i < withIntervals.length; i += 1) {
    for (let j = i + 1; j < withIntervals.length; j += 1) {
      const a = withIntervals[i]!;
      const b = withIntervals[j]!;
      if (a.slot.dayOfWeek !== b.slot.dayOfWeek || !overlaps(a.interval, b.interval)) {
        continue;
      }
      const pair: readonly Uuid[] = [a.slot.id, b.slot.id];
      if (a.slot.teacherId === b.slot.teacherId) {
        conflicts.push({
          kind: "teacher",
          message: `Teacher "${a.slot.teacherId}" is double-booked on ${a.slot.dayOfWeek} (${a.slot.startsAt}-${a.slot.endsAt} overlaps ${b.slot.startsAt}-${b.slot.endsAt})`,
          slotIds: pair,
          detail: { teacherId: a.slot.teacherId, dayOfWeek: a.slot.dayOfWeek },
        });
      }
      if (a.slot.sectionId === b.slot.sectionId) {
        conflicts.push({
          kind: "section",
          message: `Section "${a.slot.sectionId}" is double-booked on ${a.slot.dayOfWeek} (${a.slot.startsAt}-${a.slot.endsAt} overlaps ${b.slot.startsAt}-${b.slot.endsAt})`,
          slotIds: pair,
          detail: { sectionId: a.slot.sectionId, dayOfWeek: a.slot.dayOfWeek },
        });
      }
      if (a.slot.venueId !== null && a.slot.venueId === b.slot.venueId) {
        conflicts.push({
          kind: "venue",
          message: `Venue "${a.slot.venueId}" is double-booked on ${a.slot.dayOfWeek} (${a.slot.startsAt}-${a.slot.endsAt} overlaps ${b.slot.startsAt}-${b.slot.endsAt})`,
          slotIds: pair,
          detail: { venueId: a.slot.venueId, dayOfWeek: a.slot.dayOfWeek },
        });
      }
    }
  }
  return conflicts;
}

/**
 * Resource-allocation conflicts: among allocations that are still `allocated`, any two for
 * the same resource on the same weekday with overlapping windows conflict.
 */
function detectResourceConflicts(allocations: readonly ConflictAllocation[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const active = allocations
    .filter((a) => a.status === "allocated")
    .map((allocation) => ({ allocation, interval: toInterval(allocation) }));

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]!;
      const b = active[j]!;
      if (
        a.allocation.resourceId === b.allocation.resourceId &&
        a.allocation.dayOfWeek === b.allocation.dayOfWeek &&
        overlaps(a.interval, b.interval)
      ) {
        conflicts.push({
          kind: "resource",
          message: `Resource "${a.allocation.resourceId}" is allocated twice on ${a.allocation.dayOfWeek} (${a.allocation.startsAt}-${a.allocation.endsAt} overlaps ${b.allocation.startsAt}-${b.allocation.endsAt})`,
          slotIds: [],
          detail: {
            resourceId: a.allocation.resourceId,
            dayOfWeek: a.allocation.dayOfWeek,
            allocationIds: [a.allocation.id, b.allocation.id],
          },
        });
      }
    }
  }
  return conflicts;
}

const teacherDayKey = (slot: ConflictSlot): string => `${slot.teacherId}|${slot.dayOfWeek}`;

/** `max_teaching_periods`: no teacher may exceed `maxPeriodsPerDay` slots on any weekday. */
function evaluateMaxTeachingPeriods(
  slots: readonly ConflictSlot[],
  constraint: SchedulingConstraint,
): DetectedConflict[] {
  const max = positiveNumberParam(constraint.parameters, "maxPeriodsPerDay");
  if (max === null) {
    return [];
  }
  const conflicts: DetectedConflict[] = [];
  for (const [key, group] of groupBy(slots, teacherDayKey)) {
    if (group.length > max) {
      const [teacherId, dayOfWeek] = key.split("|") as [Uuid, Weekday];
      conflicts.push({
        kind: "policy",
        message: `Teacher "${teacherId}" has ${group.length} periods on ${dayOfWeek}, exceeding the maximum of ${max}`,
        slotIds: group.map((s) => s.id),
        detail: {
          ruleType: constraint.ruleType,
          teacherId,
          dayOfWeek,
          count: group.length,
          limit: max,
        },
      });
    }
  }
  return conflicts;
}

/**
 * `consecutive_period_limit`: no teacher may have a run of more than
 * `maxConsecutivePeriods` back-to-back slots (each starting exactly when the previous ends)
 * on any weekday.
 */
function evaluateConsecutiveLimit(
  slots: readonly ConflictSlot[],
  constraint: SchedulingConstraint,
): DetectedConflict[] {
  const max = positiveNumberParam(constraint.parameters, "maxConsecutivePeriods");
  if (max === null) {
    return [];
  }
  const conflicts: DetectedConflict[] = [];
  for (const [key, group] of groupBy(slots, teacherDayKey)) {
    const ordered = [...group].sort((a, b) => minutesOfDay(a.startsAt) - minutesOfDay(b.startsAt));
    let run: ConflictSlot[] = [];
    const flush = (): void => {
      if (run.length > max) {
        const [teacherId, dayOfWeek] = key.split("|") as [Uuid, Weekday];
        conflicts.push({
          kind: "policy",
          message: `Teacher "${teacherId}" has ${run.length} consecutive periods on ${dayOfWeek}, exceeding the limit of ${max}`,
          slotIds: run.map((s) => s.id),
          detail: {
            ruleType: constraint.ruleType,
            teacherId,
            dayOfWeek,
            run: run.length,
            limit: max,
          },
        });
      }
    };
    for (const slot of ordered) {
      const last = run[run.length - 1];
      if (!last || minutesOfDay(last.endsAt) === minutesOfDay(slot.startsAt)) {
        run.push(slot);
      } else {
        flush();
        run = [slot];
      }
    }
    flush();
  }
  return conflicts;
}

/**
 * `break_rule`: no teacher may teach a contiguous (back-to-back) stretch longer than
 * `maxStretchMinutes` on any weekday without a break.
 */
function evaluateBreakRule(
  slots: readonly ConflictSlot[],
  constraint: SchedulingConstraint,
): DetectedConflict[] {
  const maxStretch = positiveNumberParam(constraint.parameters, "maxStretchMinutes");
  if (maxStretch === null) {
    return [];
  }
  const conflicts: DetectedConflict[] = [];
  for (const [key, group] of groupBy(slots, teacherDayKey)) {
    const ordered = [...group].sort((a, b) => minutesOfDay(a.startsAt) - minutesOfDay(b.startsAt));
    let runStart: number | null = null;
    let runEnd: number | null = null;
    let runSlots: ConflictSlot[] = [];
    const flush = (): void => {
      if (runStart !== null && runEnd !== null && runEnd - runStart > maxStretch) {
        const [teacherId, dayOfWeek] = key.split("|") as [Uuid, Weekday];
        conflicts.push({
          kind: "policy",
          message: `Teacher "${teacherId}" teaches ${runEnd - runStart} continuous minutes on ${dayOfWeek} without a break, exceeding ${maxStretch}`,
          slotIds: runSlots.map((s) => s.id),
          detail: {
            ruleType: constraint.ruleType,
            teacherId,
            dayOfWeek,
            stretchMinutes: runEnd - runStart,
            limit: maxStretch,
          },
        });
      }
    };
    for (const slot of ordered) {
      const start = minutesOfDay(slot.startsAt);
      const end = minutesOfDay(slot.endsAt);
      if (runEnd !== null && start === runEnd) {
        runEnd = end;
        runSlots.push(slot);
      } else {
        flush();
        runStart = start;
        runEnd = end;
        runSlots = [slot];
      }
    }
    flush();
  }
  return conflicts;
}

/**
 * Policy violations for the active constraints. Three rule types are enforced directly from
 * slot timing; the other three (`subject_sequencing`, `resource_priority`,
 * `availability_window`) are recognised but need data beyond the slot grid and are left as
 * an extensibility seam (ADR-0026 / TD-27) — they contribute no violations here.
 */
function detectPolicyViolations(
  slots: readonly ConflictSlot[],
  constraints: readonly SchedulingConstraint[],
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  for (const constraint of constraints) {
    if (constraint.status !== "active") {
      continue;
    }
    switch (constraint.ruleType) {
      case "max_teaching_periods":
        conflicts.push(...evaluateMaxTeachingPeriods(slots, constraint));
        break;
      case "consecutive_period_limit":
        conflicts.push(...evaluateConsecutiveLimit(slots, constraint));
        break;
      case "break_rule":
        conflicts.push(...evaluateBreakRule(slots, constraint));
        break;
      default:
        // subject_sequencing, resource_priority, availability_window — not enforced here.
        break;
    }
  }
  return conflicts;
}

/**
 * The conflict engine. Pure and deterministic: given slots, resource allocations and active
 * scheduling constraints, it returns every conflict it can find (teacher / section / venue
 * / resource double-bookings and policy violations). An empty result means the schedule is
 * valid for the inputs supplied. The Timetable service runs this before publishing and
 * refuses to publish when the result is non-empty.
 */
export function detectConflicts(input: ConflictDetectionInput): DetectedConflict[] {
  return [
    ...detectSlotConflicts(input.slots),
    ...detectResourceConflicts(input.allocations ?? []),
    ...detectPolicyViolations(input.slots, input.constraints ?? []),
  ];
}

/** Whether the supplied schedule inputs are conflict-free. */
export const isScheduleValid = (input: ConflictDetectionInput): boolean =>
  detectConflicts(input).length === 0;
