import type { Uuid } from "@knowget/types";
import type { ConflictAllocation, ConflictDetectionInput, ConflictSlot } from "./conflict";
import { detectConflicts } from "./conflict-engine";
import { minutesOfDay } from "./time";
import { computeWorkloadDistribution, type TeacherWorkload } from "./workload";

/** Utilisation of one resource across a set of allocations. */
export interface ResourceUtilization {
  readonly resourceId: Uuid;
  readonly allocatedMinutes: number;
  readonly allocationCount: number;
}

/**
 * AI-ready, read-only scheduling metadata for a timetable or scheduling scope. This is
 * descriptive analytics only — optimisation decisions belong to the Institutional
 * Intelligence program, which consumes these metrics rather than the raw grid.
 */
export interface SchedulingIntelligence {
  readonly slotCount: number;
  readonly allocationCount: number;
  readonly totalScheduledMinutes: number;
  readonly distinctTeachers: number;
  readonly distinctSections: number;
  readonly distinctVenues: number;
  readonly averagePeriodsPerTeacher: number;
  readonly resourceUtilization: readonly ResourceUtilization[];
  readonly workloadDistribution: readonly TeacherWorkload[];
  readonly conflictCount: number;
  readonly optimizationOpportunities: readonly string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function resourceUtilization(allocations: readonly ConflictAllocation[]): ResourceUtilization[] {
  const byResource = new Map<Uuid, { allocatedMinutes: number; allocationCount: number }>();
  for (const allocation of allocations) {
    if (allocation.status !== "allocated") {
      continue;
    }
    const minutes = minutesOfDay(allocation.endsAt) - minutesOfDay(allocation.startsAt);
    const current = byResource.get(allocation.resourceId) ?? {
      allocatedMinutes: 0,
      allocationCount: 0,
    };
    current.allocatedMinutes += minutes;
    current.allocationCount += 1;
    byResource.set(allocation.resourceId, current);
  }
  return [...byResource.entries()]
    .map(([resourceId, agg]) => ({ resourceId, ...agg }))
    .sort(
      (a, b) => b.allocatedMinutes - a.allocatedMinutes || a.resourceId.localeCompare(b.resourceId),
    );
}

function optimizationOpportunities(
  slots: readonly ConflictSlot[],
  conflictCount: number,
  workload: readonly TeacherWorkload[],
): string[] {
  const hints: string[] = [];
  if (conflictCount > 0) {
    hints.push(`Resolve ${conflictCount} scheduling conflict(s) before publication`);
  }
  if (workload.length >= 2) {
    const busiest = workload[0]!;
    const lightest = workload[workload.length - 1]!;
    if (busiest.totalPeriods - lightest.totalPeriods >= 3) {
      hints.push(
        `Teacher workload is uneven: "${busiest.teacherId}" has ${busiest.totalPeriods} periods vs "${lightest.teacherId}" with ${lightest.totalPeriods} — consider rebalancing`,
      );
    }
  }
  if (slots.length === 0) {
    hints.push("No slots scheduled yet — the timetable is empty");
  }
  return hints;
}

/**
 * Compute scheduling intelligence for the supplied inputs. Reuses the conflict engine for
 * the conflict count and the workload functions for the teacher distribution, so the
 * metrics stay consistent with what gates publication.
 */
export function computeSchedulingIntelligence(
  input: ConflictDetectionInput,
): SchedulingIntelligence {
  const { slots } = input;
  const allocations = input.allocations ?? [];
  const workloadDistribution = computeWorkloadDistribution(slots);
  const distinctTeachers = new Set(slots.map((s) => s.teacherId)).size;
  const totalScheduledMinutes = slots.reduce(
    (sum, s) => sum + (minutesOfDay(s.endsAt) - minutesOfDay(s.startsAt)),
    0,
  );
  const conflictCount = detectConflicts(input).length;
  return {
    slotCount: slots.length,
    allocationCount: allocations.length,
    totalScheduledMinutes,
    distinctTeachers,
    distinctSections: new Set(slots.map((s) => s.sectionId)).size,
    distinctVenues: new Set(slots.map((s) => s.venueId).filter((v): v is Uuid => v !== null)).size,
    averagePeriodsPerTeacher: distinctTeachers === 0 ? 0 : round2(slots.length / distinctTeachers),
    resourceUtilization: resourceUtilization(allocations),
    workloadDistribution,
    conflictCount,
    optimizationOpportunities: optimizationOpportunities(
      slots,
      conflictCount,
      workloadDistribution,
    ),
  };
}
