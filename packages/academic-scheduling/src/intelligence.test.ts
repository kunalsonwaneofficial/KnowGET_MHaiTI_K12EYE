import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import type { ConflictAllocation, ConflictSlot } from "./conflict";
import { computeSchedulingIntelligence } from "./intelligence";
import { toTimeOfDay } from "./time";
import type { Weekday } from "./weekday";

const t = toTimeOfDay;
const uuid = (s: string): Uuid => s as Uuid;

const slot = (id: string, over: Partial<Omit<ConflictSlot, "id">> = {}): ConflictSlot => ({
  id: uuid(id),
  dayOfWeek: (over.dayOfWeek ?? "monday") as Weekday,
  startsAt: over.startsAt ?? t("09:00"),
  endsAt: over.endsAt ?? t("10:00"),
  teacherId: over.teacherId ?? uuid("t1"),
  sectionId: over.sectionId ?? uuid("s1"),
  subjectId: over.subjectId ?? uuid("sub1"),
  venueId: over.venueId ?? null,
});

describe("scheduling intelligence", () => {
  it("summarises a healthy schedule with no conflicts", () => {
    const slots = [
      slot("a", { teacherId: uuid("t1"), sectionId: uuid("s1"), venueId: uuid("room-1") }),
      slot("b", {
        teacherId: uuid("t2"),
        sectionId: uuid("s2"),
        venueId: uuid("room-2"),
        startsAt: t("10:00"),
        endsAt: t("11:00"),
      }),
    ];
    const allocations: ConflictAllocation[] = [
      {
        id: uuid("al-1"),
        resourceId: uuid("room-1"),
        dayOfWeek: "monday",
        startsAt: t("09:00"),
        endsAt: t("10:00"),
        status: "allocated",
      },
    ];
    const intel = computeSchedulingIntelligence({ slots, allocations });
    expect(intel.slotCount).toBe(2);
    expect(intel.allocationCount).toBe(1);
    expect(intel.totalScheduledMinutes).toBe(120);
    expect(intel.distinctTeachers).toBe(2);
    expect(intel.distinctSections).toBe(2);
    expect(intel.distinctVenues).toBe(2);
    expect(intel.conflictCount).toBe(0);
    expect(intel.resourceUtilization).toEqual([
      { resourceId: uuid("room-1"), allocatedMinutes: 60, allocationCount: 1 },
    ]);
    expect(intel.optimizationOpportunities).toEqual([]);
  });

  it("counts conflicts and surfaces optimisation hints", () => {
    const slots = [
      slot("a", { teacherId: uuid("t1"), startsAt: t("09:00"), endsAt: t("10:00") }),
      slot("b", {
        teacherId: uuid("t1"),
        sectionId: uuid("s2"),
        startsAt: t("09:30"),
        endsAt: t("10:30"),
      }),
    ];
    const intel = computeSchedulingIntelligence({ slots });
    expect(intel.conflictCount).toBe(1);
    expect(intel.optimizationOpportunities[0]).toContain("Resolve 1 scheduling conflict");
  });

  it("reports an empty timetable", () => {
    const intel = computeSchedulingIntelligence({ slots: [] });
    expect(intel.slotCount).toBe(0);
    expect(intel.averagePeriodsPerTeacher).toBe(0);
    expect(intel.optimizationOpportunities).toContain(
      "No slots scheduled yet — the timetable is empty",
    );
  });
});
