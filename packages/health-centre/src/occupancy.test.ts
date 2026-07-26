import { describe, expect, it } from "vitest";
import { computeBayOccupancy, summarizeClinicalOccupancy } from "./occupancy";

describe("computeBayOccupancy", () => {
  it("values admitted patients against the bed capacity", () => {
    const o = computeBayOccupancy(10, 4);
    expect(o).toEqual({
      bedCapacity: 10,
      occupantCount: 4,
      bedsAvailable: 6,
      occupancyPercent: 40,
      overCapacity: false,
    });
  });

  it("reports 100% and no free beds at exact capacity", () => {
    const o = computeBayOccupancy(6, 6);
    expect(o.bedsAvailable).toBe(0);
    expect(o.occupancyPercent).toBe(100);
    expect(o.overCapacity).toBe(false);
  });

  it("flags over-capacity with negative beds available", () => {
    const o = computeBayOccupancy(4, 6);
    expect(o.bedsAvailable).toBe(-2);
    expect(o.occupancyPercent).toBe(150);
    expect(o.overCapacity).toBe(true);
  });

  it("is safe at zero capacity (no divide-by-zero)", () => {
    const o = computeBayOccupancy(0, 0);
    expect(o.occupancyPercent).toBe(0);
    expect(o.overCapacity).toBe(false);
  });
});

describe("summarizeClinicalOccupancy", () => {
  it("rolls centres into the institution picture and counts over-capacity centres", () => {
    const s = summarizeClinicalOccupancy([
      { bedCapacity: 10, occupantCount: 4, overCapacity: false },
      { bedCapacity: 4, occupantCount: 6, overCapacity: true },
      { bedCapacity: 8, occupantCount: 8, overCapacity: false },
    ]);
    expect(s).toEqual({
      centreCount: 3,
      bedCapacity: 22,
      occupantCount: 18,
      bedsAvailable: 4,
      overCapacityCentreCount: 1,
    });
  });

  it("summarizes an empty institution to zeroes", () => {
    expect(summarizeClinicalOccupancy([])).toEqual({
      centreCount: 0,
      bedCapacity: 0,
      occupantCount: 0,
      bedsAvailable: 0,
      overCapacityCentreCount: 0,
    });
  });
});
