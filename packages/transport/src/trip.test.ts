import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  InvalidTripTransitionError,
  StudentNotOnboardError,
  TripNotInProgressError,
  VehicleCapacityExceededError,
} from "./errors";
import {
  cancelTrip,
  completeTrip,
  recordTripBoarding,
  scheduleTrip,
  startTrip,
  tripOccupancy,
} from "./trip";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const S1 = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const S2 = "aaaaaaaa-0000-0000-0000-000000000002" as Uuid;
const S3 = "aaaaaaaa-0000-0000-0000-000000000003" as Uuid;

const schedule = (capacity = 40) =>
  scheduleTrip({
    tenantId: TENANT,
    organizationId: ORG,
    routeId: "33333333-3333-3333-3333-333333333333" as Uuid,
    vehicleId: "44444444-4444-4444-4444-444444444444" as Uuid,
    driverId: "55555555-5555-5555-5555-555555555555" as Uuid,
    serviceDate: "2026-08-10",
    direction: "pickup",
    capacity,
  });

const board = (studentId: Uuid) => ({
  studentId,
  stopKey: "gate",
  type: "boarded" as const,
  occurredAt: "2026-08-10T07:10:00Z",
});
const alight = (studentId: Uuid) => ({
  studentId,
  stopKey: "school",
  type: "alighted" as const,
  occurredAt: "2026-08-10T07:40:00Z",
});

describe("trip", () => {
  it("only records boarding while in progress", () => {
    const t = schedule();
    expect(() => recordTripBoarding(t, board(S1))).toThrow(TripNotInProgressError);
    const started = startTrip(t);
    expect(started.status).toBe("in_progress");
    expect(() => startTrip(started)).toThrow(InvalidTripTransitionError);
  });

  it("reconciles occupancy and enforces capacity at boarding", () => {
    let t = startTrip(schedule(2));
    t = recordTripBoarding(t, board(S1));
    t = recordTripBoarding(t, board(S2));
    expect(tripOccupancy(t).finalOnboard).toBe(2);
    expect(() => recordTripBoarding(t, board(S3))).toThrow(VehicleCapacityExceededError);
    // once S1 alights, a seat frees up
    t = recordTripBoarding(t, alight(S1));
    t = recordTripBoarding(t, board(S3));
    expect(tripOccupancy(t).finalOnboard).toBe(2);
    expect(tripOccupancy(t).peakOccupancy).toBe(2);
  });

  it("rejects alighting a student who is not onboard", () => {
    const t = startTrip(schedule());
    expect(() => recordTripBoarding(t, alight(S1))).toThrow(StudentNotOnboardError);
  });

  it("completes and blocks a second completion; cancels a scheduled trip", () => {
    const done = completeTrip(startTrip(schedule()));
    expect(done.status).toBe("completed");
    expect(() => completeTrip(done)).toThrow(InvalidTripTransitionError);
    expect(cancelTrip(schedule()).status).toBe("cancelled");
  });
});
