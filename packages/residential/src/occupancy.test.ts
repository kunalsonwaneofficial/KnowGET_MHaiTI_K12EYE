import { describe, expect, it } from "vitest";
import {
  computeHostelOccupancy,
  computeRoomOccupancy,
  summarizeResidenceOccupancy,
} from "./occupancy";

describe("computeRoomOccupancy", () => {
  it("computes beds available, percent and over-capacity for a partly-filled room", () => {
    expect(computeRoomOccupancy(4, 3)).toEqual({
      bedCount: 4,
      occupantCount: 3,
      bedsAvailable: 1,
      occupancyPercent: 75,
      overCapacity: false,
    });
  });

  it("flags over-capacity and a negative beds-available when over-allocated", () => {
    const occ = computeRoomOccupancy(2, 3);
    expect(occ.bedsAvailable).toBe(-1);
    expect(occ.overCapacity).toBe(true);
    expect(occ.occupancyPercent).toBe(150);
  });

  it("is full at exactly capacity without being over", () => {
    const occ = computeRoomOccupancy(2, 2);
    expect(occ.bedsAvailable).toBe(0);
    expect(occ.overCapacity).toBe(false);
    expect(occ.occupancyPercent).toBe(100);
  });

  it("guards a zero-bed room against division by zero", () => {
    expect(computeRoomOccupancy(0, 0)).toEqual({
      bedCount: 0,
      occupantCount: 0,
      bedsAvailable: 0,
      occupancyPercent: 0,
      overCapacity: false,
    });
  });
});

describe("computeHostelOccupancy", () => {
  it("rolls rooms up into a hostel occupancy with the over-capacity room count", () => {
    const occ = computeHostelOccupancy([
      { bedCount: 4, occupantCount: 4, overCapacity: false },
      { bedCount: 2, occupantCount: 3, overCapacity: true },
      { bedCount: 6, occupantCount: 1, overCapacity: false },
    ]);
    expect(occ).toEqual({
      roomCount: 3,
      bedCount: 12,
      occupantCount: 8,
      bedsAvailable: 4,
      occupancyPercent: 67,
      overCapacityRoomCount: 1,
    });
  });

  it("is empty for a hostel with no rooms", () => {
    expect(computeHostelOccupancy([])).toEqual({
      roomCount: 0,
      bedCount: 0,
      occupantCount: 0,
      bedsAvailable: 0,
      occupancyPercent: 0,
      overCapacityRoomCount: 0,
    });
  });
});

describe("summarizeResidenceOccupancy", () => {
  it("summarizes hostels into an institution rollup", () => {
    const summary = summarizeResidenceOccupancy([
      { bedCount: 100, occupantCount: 90, overCapacity: false },
      { bedCount: 50, occupantCount: 55, overCapacity: true },
    ]);
    expect(summary).toEqual({
      hostelCount: 2,
      bedCount: 150,
      occupantCount: 145,
      bedsAvailable: 5,
      overCapacityHostelCount: 1,
    });
  });

  it("is empty for no hostels", () => {
    expect(summarizeResidenceOccupancy([])).toEqual({
      hostelCount: 0,
      bedCount: 0,
      occupantCount: 0,
      bedsAvailable: 0,
      overCapacityHostelCount: 0,
    });
  });
});
