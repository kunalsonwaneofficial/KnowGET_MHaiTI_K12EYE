import type { Uuid } from "@knowget/types";
import { InvalidRollCallMarkError } from "./errors";
import type { PresenceMark } from "./residential-value";

/**
 * A single marking on a {@link RollCall} — how one resident was accounted for at curfew (present, late,
 * on approved leave, or absent) and when. The roll call's ordered marking list is reconciled by the pure
 * roll-call engine; the aggregate uses it to enforce one mark per resident and roster membership.
 */
export interface RollCallMark {
  readonly residentId: Uuid;
  readonly mark: PresenceMark;
  readonly notedAt: string;
}

export interface RollCallMarkInput {
  readonly residentId: Uuid;
  readonly mark: PresenceMark;
  readonly notedAt: string;
}

/** Normalize and validate a roll-call mark input (non-empty resident and time). */
export function makeRollCallMark(input: RollCallMarkInput): RollCallMark {
  const residentId = input.residentId.trim();
  if (residentId.length === 0) {
    throw new InvalidRollCallMarkError("a resident is required");
  }
  const notedAt = input.notedAt.trim();
  if (notedAt.length === 0) {
    throw new InvalidRollCallMarkError("a time is required");
  }
  return { residentId: residentId as Uuid, mark: input.mark, notedAt };
}
