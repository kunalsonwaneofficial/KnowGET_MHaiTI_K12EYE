import type { ISODateString, Uuid } from "@knowget/types";

/**
 * The nature of a behaviour observation. The model leads with `positive` recognition —
 * this domain emphasises development over punishment — alongside neutral notes and
 * concerns that may (but need not) escalate into an incident.
 */
export type BehaviourObservationType = "positive" | "neutral" | "concern";

/**
 * A single dated behaviour observation, recorded by a staff member (Person). Positive
 * recognitions, everyday notes and early concerns all share this shape.
 */
export interface BehaviourObservation {
  readonly id: Uuid;
  readonly type: BehaviourObservationType;
  readonly note: string;
  readonly observedBy: Uuid;
  readonly observedAt: ISODateString;
}

/** How serious a behaviour incident is. */
export type BehaviourIncidentSeverity = "minor" | "moderate" | "major" | "severe";

/**
 * The lifecycle of a behaviour incident. Incidents open as `reported`, may move to
 * `under_review`, and close as `resolved` once restorative work is complete.
 */
export type BehaviourIncidentStatus = "reported" | "under_review" | "resolved";

/**
 * A restorative action attached to an incident — a repair-and-reintegrate step rather
 * than a punishment. Open until completed.
 */
export interface RestorativeAction {
  readonly id: Uuid;
  readonly description: string;
  readonly completedAt: ISODateString | null;
}

/**
 * A recorded behaviour incident: what happened, how serious, who reported it, its place
 * in the review lifecycle and the restorative actions taken in response.
 */
export interface BehaviourIncident {
  readonly id: Uuid;
  readonly category: string;
  readonly severity: BehaviourIncidentSeverity;
  readonly description: string;
  readonly reportedBy: Uuid;
  readonly reportedAt: ISODateString;
  readonly status: BehaviourIncidentStatus;
  readonly restorativeActions: readonly RestorativeAction[];
}

/** The standing of a behaviour goal. */
export type BehaviourGoalStatus = "active" | "achieved" | "abandoned";

/** A developmental behaviour goal set with the learner. */
export interface BehaviourGoal {
  readonly id: Uuid;
  readonly description: string;
  readonly status: BehaviourGoalStatus;
  readonly setAt: ISODateString;
}

/**
 * A behaviour improvement plan — the developmental strategy for a learner, with an
 * optional next-review date and notes. At most one per behaviour record.
 */
export interface BehaviourImprovementPlan {
  readonly strategies: readonly string[];
  readonly reviewOn: string | null;
  readonly notes: string | null;
}
