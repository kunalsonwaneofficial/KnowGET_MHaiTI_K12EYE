import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import type { ConflictAllocation, ConflictSlot, SchedulingConstraint } from "./conflict";
import { detectConflicts, isScheduleValid } from "./conflict-engine";
import type { PolicyRuleType } from "./policy";
import { toTimeOfDay } from "./time";
import type { Weekday } from "./weekday";

const t = toTimeOfDay;
const uuid = (s: string): Uuid => s as Uuid;

function slot(id: string, over: Partial<Omit<ConflictSlot, "id">> = {}): ConflictSlot {
  return {
    id: uuid(id),
    dayOfWeek: (over.dayOfWeek ?? "monday") as Weekday,
    startsAt: over.startsAt ?? t("09:00"),
    endsAt: over.endsAt ?? t("10:00"),
    teacherId: over.teacherId ?? uuid("teacher-1"),
    sectionId: over.sectionId ?? uuid("section-1"),
    subjectId: over.subjectId ?? uuid("subject-1"),
    venueId: over.venueId ?? null,
  };
}

function allocation(
  id: string,
  over: Partial<Omit<ConflictAllocation, "id">> = {},
): ConflictAllocation {
  return {
    id: uuid(id),
    resourceId: over.resourceId ?? uuid("resource-1"),
    dayOfWeek: (over.dayOfWeek ?? "monday") as Weekday,
    startsAt: over.startsAt ?? t("09:00"),
    endsAt: over.endsAt ?? t("10:00"),
    status: over.status ?? "allocated",
  };
}

const policy = (
  ruleType: PolicyRuleType,
  parameters: Record<string, unknown>,
): SchedulingConstraint => ({
  id: uuid(`policy-${ruleType}`),
  ruleType,
  parameters,
  status: "active",
});

describe("conflict-engine — slot conflicts", () => {
  it("finds nothing for a disjoint, valid schedule", () => {
    const slots = [
      slot("a", { startsAt: t("09:00"), endsAt: t("10:00") }),
      slot("b", {
        startsAt: t("10:00"),
        endsAt: t("11:00"),
        sectionId: uuid("section-2"),
        teacherId: uuid("teacher-2"),
      }),
    ];
    expect(detectConflicts({ slots })).toEqual([]);
    expect(isScheduleValid({ slots })).toBe(true);
  });

  it("detects a teacher double-booking on overlapping same-day slots", () => {
    const slots = [
      slot("a", { startsAt: t("09:00"), endsAt: t("10:00"), sectionId: uuid("section-1") }),
      slot("b", { startsAt: t("09:30"), endsAt: t("10:30"), sectionId: uuid("section-2") }),
    ];
    const conflicts = detectConflicts({ slots });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("teacher");
    expect(conflicts[0]!.slotIds).toEqual([uuid("a"), uuid("b")]);
  });

  it("detects a section double-booking without a teacher conflict", () => {
    const slots = [
      slot("a", { teacherId: uuid("teacher-1"), sectionId: uuid("section-1") }),
      slot("b", {
        teacherId: uuid("teacher-2"),
        sectionId: uuid("section-1"),
        startsAt: t("09:30"),
        endsAt: t("10:30"),
      }),
    ];
    const kinds = detectConflicts({ slots }).map((c) => c.kind);
    expect(kinds).toEqual(["section"]);
  });

  it("detects a venue double-booking but ignores null venues", () => {
    const shared = uuid("room-101");
    const withVenue = detectConflicts({
      slots: [
        slot("a", { teacherId: uuid("teacher-1"), sectionId: uuid("section-1"), venueId: shared }),
        slot("b", {
          teacherId: uuid("teacher-2"),
          sectionId: uuid("section-2"),
          venueId: shared,
          startsAt: t("09:30"),
          endsAt: t("10:30"),
        }),
      ],
    });
    expect(withVenue.map((c) => c.kind)).toEqual(["venue"]);

    const nullVenues = detectConflicts({
      slots: [
        slot("a", { teacherId: uuid("teacher-1"), sectionId: uuid("section-1"), venueId: null }),
        slot("b", {
          teacherId: uuid("teacher-2"),
          sectionId: uuid("section-2"),
          venueId: null,
          startsAt: t("09:30"),
          endsAt: t("10:30"),
        }),
      ],
    });
    expect(nullVenues).toEqual([]);
  });

  it("does not flag adjacent (touching) slots or different days", () => {
    const adjacent = detectConflicts({
      slots: [
        slot("a", { startsAt: t("09:00"), endsAt: t("10:00") }),
        slot("b", { startsAt: t("10:00"), endsAt: t("11:00") }),
      ],
    });
    expect(adjacent).toEqual([]);

    const differentDays = detectConflicts({
      slots: [
        slot("a", { dayOfWeek: "monday" }),
        slot("b", { dayOfWeek: "tuesday", startsAt: t("09:30"), endsAt: t("10:30") }),
      ],
    });
    expect(differentDays).toEqual([]);
  });

  it("raises both teacher and venue conflicts for one overlapping pair", () => {
    const conflicts = detectConflicts({
      slots: [
        slot("a", {
          teacherId: uuid("teacher-1"),
          sectionId: uuid("section-1"),
          venueId: uuid("room-1"),
        }),
        slot("b", {
          teacherId: uuid("teacher-1"),
          sectionId: uuid("section-2"),
          venueId: uuid("room-1"),
          startsAt: t("09:30"),
          endsAt: t("10:30"),
        }),
      ],
    });
    expect(conflicts.map((c) => c.kind).sort()).toEqual(["teacher", "venue"]);
  });
});

describe("conflict-engine — resource allocations", () => {
  it("detects an overlapping allocation of the same resource", () => {
    const conflicts = detectConflicts({
      slots: [],
      allocations: [
        allocation("a", { resourceId: uuid("lab-1"), startsAt: t("09:00"), endsAt: t("10:00") }),
        allocation("b", { resourceId: uuid("lab-1"), startsAt: t("09:30"), endsAt: t("10:30") }),
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("resource");
  });

  it("ignores released allocations and different resources", () => {
    const conflicts = detectConflicts({
      slots: [],
      allocations: [
        allocation("a", { resourceId: uuid("lab-1"), status: "released" }),
        allocation("b", { resourceId: uuid("lab-1"), startsAt: t("09:30"), endsAt: t("10:30") }),
        allocation("c", { resourceId: uuid("lab-2"), startsAt: t("09:15"), endsAt: t("10:15") }),
      ],
    });
    expect(conflicts).toEqual([]);
  });
});

describe("conflict-engine — policy violations", () => {
  const threeAdjacent = [
    slot("a", { startsAt: t("09:00"), endsAt: t("10:00") }),
    slot("b", { startsAt: t("10:00"), endsAt: t("11:00") }),
    slot("c", { startsAt: t("11:00"), endsAt: t("12:00") }),
  ];

  it("enforces max_teaching_periods per teacher per day", () => {
    const conflicts = detectConflicts({
      slots: threeAdjacent,
      constraints: [policy("max_teaching_periods", { maxPeriodsPerDay: 2 })],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("policy");
    expect(conflicts[0]!.detail).toMatchObject({ count: 3, limit: 2 });
  });

  it("enforces consecutive_period_limit", () => {
    const conflicts = detectConflicts({
      slots: threeAdjacent,
      constraints: [policy("consecutive_period_limit", { maxConsecutivePeriods: 2 })],
    });
    expect(conflicts.map((c) => c.kind)).toEqual(["policy"]);
    expect(conflicts[0]!.detail).toMatchObject({ run: 3, limit: 2 });
  });

  it("enforces break_rule on continuous teaching minutes", () => {
    const conflicts = detectConflicts({
      slots: threeAdjacent,
      constraints: [policy("break_rule", { maxStretchMinutes: 120 })],
    });
    expect(conflicts.map((c) => c.kind)).toEqual(["policy"]);
    expect(conflicts[0]!.detail).toMatchObject({ stretchMinutes: 180, limit: 120 });
  });

  it("ignores inactive policies and unenforced rule types", () => {
    const inactive: SchedulingConstraint = {
      id: uuid("p"),
      ruleType: "max_teaching_periods",
      parameters: { maxPeriodsPerDay: 1 },
      status: "draft",
    };
    const advisory = policy("subject_sequencing", { order: ["math", "science"] });
    expect(detectConflicts({ slots: threeAdjacent, constraints: [inactive, advisory] })).toEqual(
      [],
    );
  });

  it("does not raise consecutive/break violations when a gap breaks the run", () => {
    const withGap = [
      slot("a", { startsAt: t("09:00"), endsAt: t("10:00") }),
      slot("b", { startsAt: t("10:00"), endsAt: t("11:00") }),
      slot("c", { startsAt: t("11:30"), endsAt: t("12:30") }),
    ];
    const conflicts = detectConflicts({
      slots: withGap,
      constraints: [
        policy("consecutive_period_limit", { maxConsecutivePeriods: 2 }),
        policy("break_rule", { maxStretchMinutes: 120 }),
      ],
    });
    expect(conflicts).toEqual([]);
  });
});
