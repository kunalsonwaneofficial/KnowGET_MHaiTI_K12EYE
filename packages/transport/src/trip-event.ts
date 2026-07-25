import type { Uuid } from "@knowget/types";
import { InvalidTripEventError } from "./errors";
import type { TripEventType } from "./transport-value";

/**
 * A single boarding event on a {@link Trip} — a student `boarded` or `alighted` at a stop at a given
 * time. The trip's ordered event list is reconciled by the pure occupancy engine; the aggregate uses it
 * to enforce capacity (a board may not exceed the vehicle's seats) and correctness (a student may only
 * alight if currently onboard).
 */
export interface TripEvent {
  readonly studentId: Uuid;
  readonly stopKey: string;
  readonly type: TripEventType;
  readonly occurredAt: string;
}

export interface TripEventInput {
  readonly studentId: Uuid;
  readonly stopKey: string;
  readonly type: TripEventType;
  readonly occurredAt: string;
}

/** Normalize and validate a trip boarding event (non-empty student, stop and time). */
export function makeTripEvent(input: TripEventInput): TripEvent {
  const studentId = input.studentId.trim();
  if (studentId.length === 0) {
    throw new InvalidTripEventError("a student is required");
  }
  const stopKey = input.stopKey.trim();
  if (stopKey.length === 0) {
    throw new InvalidTripEventError("a stop is required");
  }
  const occurredAt = input.occurredAt.trim();
  if (occurredAt.length === 0) {
    throw new InvalidTripEventError("a time is required");
  }
  return { studentId: studentId as Uuid, stopKey, type: input.type, occurredAt };
}
