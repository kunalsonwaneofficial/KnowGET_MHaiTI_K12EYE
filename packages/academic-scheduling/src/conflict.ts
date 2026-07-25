import type { Uuid } from "@knowget/types";
import type { PolicyRuleType } from "./policy";
import type { TimeOfDay } from "./time";
import type { Weekday } from "./weekday";

/**
 * The category of a detected scheduling conflict.
 * - `teacher` — one teacher placed in two overlapping slots.
 * - `section` — one section placed in two overlapping slots.
 * - `venue` — one venue booked by two overlapping slots.
 * - `resource` — one resource allocated to two overlapping windows.
 * - `policy` — an active scheduling policy is violated.
 */
export const CONFLICT_KINDS = ["teacher", "section", "venue", "resource", "policy"] as const;

export type ConflictKind = (typeof CONFLICT_KINDS)[number];

/** A single conflict the engine found: its kind, a human message, and the entities involved. */
export interface DetectedConflict {
  readonly kind: ConflictKind;
  readonly message: string;
  /** Slots implicated in the conflict (empty for resource-only or aggregate policy findings). */
  readonly slotIds: readonly Uuid[];
  /** Structured context (teacher/section/venue/resource id, policy rule, counts, limits). */
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * The minimal view of a schedule slot the conflict engine needs. The `ScheduleSlot`
 * aggregate structurally satisfies this contract, so no mapping is required — the engine
 * stays decoupled from the aggregate's full shape.
 */
export interface ConflictSlot {
  readonly id: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: TimeOfDay;
  readonly endsAt: TimeOfDay;
  readonly teacherId: Uuid;
  readonly sectionId: Uuid;
  readonly subjectId: Uuid;
  readonly venueId: Uuid | null;
}

/** The minimal view of a resource allocation the conflict engine needs. */
export interface ConflictAllocation {
  readonly id: Uuid;
  readonly resourceId: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: TimeOfDay;
  readonly endsAt: TimeOfDay;
  /** Only `"allocated"` allocations participate in conflict detection. */
  readonly status: string;
}

/**
 * The minimal view of an active scheduling policy the conflict engine evaluates. The
 * `SchedulingPolicy` aggregate structurally satisfies this contract.
 */
export interface SchedulingConstraint {
  readonly id: Uuid;
  readonly ruleType: PolicyRuleType;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Only `"active"` policies are enforced. */
  readonly status: string;
}

/** The full input to a conflict-detection run. */
export interface ConflictDetectionInput {
  readonly slots: readonly ConflictSlot[];
  readonly allocations?: readonly ConflictAllocation[];
  readonly constraints?: readonly SchedulingConstraint[];
}
