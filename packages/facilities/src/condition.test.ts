import { describe, expect, it } from "vitest";
import {
  computeBuildingCondition,
  computeServiceStatus,
  summarizeCampusCondition,
} from "./condition";

describe("computeBuildingCondition", () => {
  it("rolls spaces and systems into a condition picture with a readiness percent", () => {
    const c = computeBuildingCondition(
      [
        { status: "available", capacity: 30 },
        { status: "available", capacity: 20 },
        { status: "out_of_service", capacity: 10 },
        { status: "draft", capacity: 40 }, // counted in total capacity, not available
      ],
      [{ status: "operational" }, { status: "operational" }, { status: "under_maintenance" }],
    );
    expect(c).toEqual({
      spaceCount: 4,
      availableSpaceCount: 2,
      outOfServiceSpaceCount: 1,
      totalCapacity: 100,
      availableCapacity: 50,
      systemCount: 3,
      operationalSystemCount: 2,
      systemsUnderMaintenance: 1,
      readinessPercent: 50,
    });
  });

  it("is safe with no spaces (no divide-by-zero)", () => {
    const c = computeBuildingCondition([], []);
    expect(c.readinessPercent).toBe(0);
    expect(c.spaceCount).toBe(0);
  });

  it("excludes decommissioned spaces and systems from the counts and total capacity", () => {
    const c = computeBuildingCondition(
      [
        { status: "available", capacity: 40 },
        { status: "decommissioned", capacity: 60 }, // retired: out of the live inventory entirely
      ],
      [{ status: "operational" }, { status: "decommissioned" }],
    );
    expect(c.spaceCount).toBe(1); // the decommissioned space is not counted
    expect(c.totalCapacity).toBe(40); // nor its capacity in the denominator
    expect(c.availableCapacity).toBe(40);
    expect(c.readinessPercent).toBe(100); // 40/40, not 40/100
    expect(c.systemCount).toBe(1); // the decommissioned system is not counted
    expect(c.operationalSystemCount).toBe(1);
  });
});

describe("summarizeCampusCondition", () => {
  it("rolls buildings into the campus picture", () => {
    const s = summarizeCampusCondition([
      {
        spaceCount: 4,
        availableSpaceCount: 2,
        totalCapacity: 100,
        availableCapacity: 50,
        systemCount: 3,
        operationalSystemCount: 2,
      },
      {
        spaceCount: 2,
        availableSpaceCount: 2,
        totalCapacity: 40,
        availableCapacity: 40,
        systemCount: 1,
        operationalSystemCount: 1,
      },
    ]);
    expect(s).toEqual({
      buildingCount: 2,
      spaceCount: 6,
      availableSpaceCount: 4,
      totalCapacity: 140,
      availableCapacity: 90,
      systemCount: 4,
      operationalSystemCount: 3,
    });
  });

  it("summarizes an empty campus to zeroes", () => {
    expect(summarizeCampusCondition([])).toEqual({
      buildingCount: 0,
      spaceCount: 0,
      availableSpaceCount: 0,
      totalCapacity: 0,
      availableCapacity: 0,
      systemCount: 0,
      operationalSystemCount: 0,
    });
  });
});

// A 90-day service interval from 2026-01-01 → next due 2026-04-01.
describe("computeServiceStatus", () => {
  it("is ok when the next service is comfortably in the future", () => {
    const s = computeServiceStatus("2026-01-01", 90, "2026-02-01");
    expect(s.nextDueOn).toBe("2026-04-01");
    expect(s.band).toBe("ok");
    expect(s.isDueSoon).toBe(false);
    expect(s.isOverdue).toBe(false);
  });

  it("is due_soon within the warning window (inclusive)", () => {
    const s = computeServiceStatus("2026-01-01", 90, "2026-03-25"); // 7 days before due
    expect(s.band).toBe("due_soon");
    expect(s.isDueSoon).toBe(true);
    expect(computeServiceStatus("2026-01-01", 90, "2026-04-01").band).toBe("due_soon"); // due day
  });

  it("is overdue once the due date has passed", () => {
    const s = computeServiceStatus("2026-01-01", 90, "2026-05-01");
    expect(s.band).toBe("overdue");
    expect(s.isOverdue).toBe(true);
  });

  it("has no computable due date for a never-serviced system", () => {
    const s = computeServiceStatus(null, 90, "2026-05-01");
    expect(s.nextDueOn).toBeNull();
    expect(s.band).toBe("ok");
    expect(s.isOverdue).toBe(false);
  });
});
