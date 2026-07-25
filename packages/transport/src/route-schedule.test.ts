import { describe, expect, it } from "vitest";
import { InvalidRouteScheduleError } from "./errors";
import {
  computeRouteSchedule,
  computeSeatUtilization,
  summarizeFleetUtilization,
} from "./route-schedule";

const stops = [
  { sequence: 1, offsetMinutes: 0 }, // depot
  { sequence: 2, offsetMinutes: 12 },
  { sequence: 3, offsetMinutes: 25 },
  { sequence: 4, offsetMinutes: 40 }, // school
];

describe("computeRouteSchedule", () => {
  it("computes arrivals, duration and final arrival from a departure time", () => {
    const schedule = computeRouteSchedule(7 * 60 + 15, stops); // depart 07:15 = 435
    expect(schedule.stopCount).toBe(4);
    expect(schedule.totalDurationMinutes).toBe(40);
    expect(schedule.finalArrivalMinutes).toBe(435 + 40); // 07:55
    expect(schedule.stops.map((s) => s.arrivalMinutes)).toEqual([435, 447, 460, 475]);
  });

  it("rejects a non-consecutive stop sequence", () => {
    expect(() =>
      computeRouteSchedule(400, [
        { sequence: 1, offsetMinutes: 0 },
        { sequence: 3, offsetMinutes: 10 },
      ]),
    ).toThrow(InvalidRouteScheduleError);
  });

  it("rejects non-increasing offsets (a later stop no further along)", () => {
    expect(() =>
      computeRouteSchedule(400, [
        { sequence: 1, offsetMinutes: 10 },
        { sequence: 2, offsetMinutes: 10 },
      ]),
    ).toThrow(InvalidRouteScheduleError);
  });

  it("rejects an empty route and an out-of-range departure", () => {
    expect(() => computeRouteSchedule(400, [])).toThrow(InvalidRouteScheduleError);
    expect(() => computeRouteSchedule(1440, stops)).toThrow(InvalidRouteScheduleError);
    expect(() => computeRouteSchedule(-1, stops)).toThrow(InvalidRouteScheduleError);
  });
});

describe("computeSeatUtilization", () => {
  it("reports seats available, percent and over-capacity", () => {
    expect(computeSeatUtilization(40, 30)).toEqual({
      capacity: 40,
      subscriberCount: 30,
      seatsAvailable: 10,
      utilizationPercent: 75,
      overCapacity: false,
    });
    const over = computeSeatUtilization(40, 45);
    expect(over.seatsAvailable).toBe(-5);
    expect(over.overCapacity).toBe(true);
    expect(computeSeatUtilization(0, 0).utilizationPercent).toBe(0);
  });
});

describe("summarizeFleetUtilization", () => {
  it("rolls up subscribers and over-capacity routes", () => {
    const summary = summarizeFleetUtilization([
      { subscriberCount: 30, overCapacity: false },
      { subscriberCount: 45, overCapacity: true },
      { subscriberCount: 12, overCapacity: false },
    ]);
    expect(summary).toEqual({ routeCount: 3, totalSubscribers: 87, overCapacityRouteCount: 1 });
  });
});
