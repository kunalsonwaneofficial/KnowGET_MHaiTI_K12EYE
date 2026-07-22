import type { ISODateString, Uuid } from "@knowget/types";

/**
 * The lifecycle of a single intervention: assigned → in progress → completed, or
 * cancelled. Completion carries an outcome evaluation.
 */
export type InterventionStatus = "assigned" | "in_progress" | "completed" | "cancelled";

/** A dated progress note on an intervention, recorded by responsible staff (a Person). */
export interface InterventionProgressNote {
  readonly id: Uuid;
  readonly note: string;
  readonly recordedBy: Uuid;
  readonly recordedAt: ISODateString;
}

/**
 * A single assigned intervention within a learner's intervention plan — its description,
 * the responsible staff member (a Person), lifecycle status, progress-monitoring notes and
 * an outcome evaluation once completed.
 */
export interface Intervention {
  readonly id: Uuid;
  readonly description: string;
  readonly responsibleStaff: Uuid;
  readonly status: InterventionStatus;
  readonly progressNotes: readonly InterventionProgressNote[];
  readonly outcome: string | null;
  readonly assignedAt: ISODateString;
  readonly completedAt: ISODateString | null;
}
