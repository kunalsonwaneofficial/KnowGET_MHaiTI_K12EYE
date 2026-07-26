import { describe, expect, it } from "vitest";
import { computeMusterStatus, computeZonePresence, summarizeSitePresence } from "./presence";

describe("computeZonePresence", () => {
  it("counts checked-in visits as on-site against capacity", () => {
    const p = computeZonePresence(
      [
        { status: "checked_in" },
        { status: "checked_in" },
        { status: "approved" }, // not yet on-site
        { status: "checked_out" }, // left
      ],
      5,
    );
    expect(p).toEqual({
      onSiteCount: 2,
      capacity: 5,
      available: 3,
      overCapacity: false,
      occupancyPercent: 40,
    });
  });

  it("flags over capacity and clamps available at zero", () => {
    const p = computeZonePresence(
      [{ status: "checked_in" }, { status: "checked_in" }, { status: "checked_in" }],
      2,
    );
    expect(p.onSiteCount).toBe(3);
    expect(p.available).toBe(0);
    expect(p.overCapacity).toBe(true);
    expect(p.occupancyPercent).toBe(150);
  });

  it("treats a zero capacity as not-tracked (no limit, no divide-by-zero)", () => {
    const p = computeZonePresence([{ status: "checked_in" }], 0);
    expect(p.overCapacity).toBe(false);
    expect(p.available).toBe(0);
    expect(p.occupancyPercent).toBe(0);
  });
});

describe("summarizeSitePresence", () => {
  it("rolls zones into the campus picture", () => {
    expect(
      summarizeSitePresence([
        { onSiteCount: 2, capacity: 5 },
        { onSiteCount: 3, capacity: 10 },
      ]),
    ).toEqual({ zoneCount: 2, onSiteCount: 5, totalCapacity: 15 });
  });

  it("summarizes an empty site to zeroes", () => {
    expect(summarizeSitePresence([])).toEqual({ zoneCount: 0, onSiteCount: 0, totalCapacity: 0 });
  });
});

describe("computeMusterStatus", () => {
  it("reconciles expected against accounted into the unaccounted-for count", () => {
    expect(computeMusterStatus(30, 27)).toEqual({
      expectedCount: 30,
      accountedCount: 27,
      unaccountedFor: 3,
      allAccountedFor: false,
      completionPercent: 90,
    });
  });

  it("is fully accounted for when everyone (or more) mustered, never negative or over 100%", () => {
    expect(computeMusterStatus(30, 30)).toMatchObject({ unaccountedFor: 0, allAccountedFor: true });
    expect(computeMusterStatus(30, 33)).toMatchObject({
      unaccountedFor: 0,
      allAccountedFor: true,
      completionPercent: 100,
    });
  });

  it("treats a zero roster as fully accounted for (no divide-by-zero)", () => {
    expect(computeMusterStatus(0, 0)).toMatchObject({
      unaccountedFor: 0,
      allAccountedFor: true,
      completionPercent: 100,
    });
  });
});
