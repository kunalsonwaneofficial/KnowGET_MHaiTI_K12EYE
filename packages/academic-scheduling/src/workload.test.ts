import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import type { ConflictSlot } from "./conflict";
import { toTimeOfDay } from "./time";
import type { Weekday } from "./weekday";
import { computeTeacherWorkload, computeWorkloadDistribution } from "./workload";

const t = toTimeOfDay;
const uuid = (s: string): Uuid => s as Uuid;

const slot = (
  id: string,
  teacher: string,
  day: Weekday,
  start: string,
  end: string,
): ConflictSlot => ({
  id: uuid(id),
  dayOfWeek: day,
  startsAt: t(start),
  endsAt: t(end),
  teacherId: uuid(teacher),
  sectionId: uuid("section-1"),
  subjectId: uuid("subject-1"),
  venueId: null,
});

describe("workload", () => {
  it("computes one teacher's totals, per-day counts and busiest day", () => {
    const slots = [
      slot("a", "t1", "monday", "09:00", "10:00"),
      slot("b", "t1", "monday", "10:00", "11:00"),
      slot("c", "t1", "tuesday", "09:00", "09:45"),
      slot("d", "t2", "monday", "09:00", "10:00"),
    ];
    const w = computeTeacherWorkload(slots, uuid("t1"));
    expect(w.totalPeriods).toBe(3);
    expect(w.totalMinutes).toBe(60 + 60 + 45);
    expect(w.periodsByDay.monday).toBe(2);
    expect(w.periodsByDay.tuesday).toBe(1);
    expect(w.periodsByDay.sunday).toBe(0);
    expect(w.busiestDay).toBe("monday");
    expect(w.busiestDayPeriods).toBe(2);
  });

  it("returns a zeroed workload for a teacher with no slots", () => {
    const w = computeTeacherWorkload([], uuid("nobody"));
    expect(w.totalPeriods).toBe(0);
    expect(w.totalMinutes).toBe(0);
    expect(w.busiestDay).toBeNull();
  });

  it("distributes workload across teachers ordered by descending load", () => {
    const slots = [
      slot("a", "t1", "monday", "09:00", "10:00"),
      slot("b", "t2", "monday", "09:00", "10:00"),
      slot("c", "t2", "tuesday", "09:00", "10:00"),
      slot("d", "t2", "wednesday", "09:00", "10:00"),
    ];
    const dist = computeWorkloadDistribution(slots);
    expect(dist.map((w) => w.teacherId)).toEqual([uuid("t2"), uuid("t1")]);
    expect(dist[0]!.totalPeriods).toBe(3);
    expect(dist[1]!.totalPeriods).toBe(1);
  });
});
