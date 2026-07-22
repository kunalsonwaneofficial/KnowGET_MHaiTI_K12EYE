import type { ISODateString, Uuid } from "@knowget/types";

/** The lifecycle of a counselling case: open until formally closed with an outcome. */
export type CounsellingCaseStatus = "open" | "closed";

/** How urgently a counselling case needs attention. */
export type CounsellingPriority = "low" | "normal" | "high" | "urgent";

/**
 * A confidential counselling session note. Sessions are append-only — the audit trail of
 * a case is never rewritten — and are readable only through the enhanced-privacy
 * `counselling:*` authorization scope. Recorded by the counsellor (a Person).
 */
export interface CounsellingSession {
  readonly id: Uuid;
  readonly occurredOn: string;
  readonly note: string;
  readonly recordedBy: Uuid;
  readonly recordedAt: ISODateString;
}

/** A referral out of a counselling case (e.g. to an external service or specialist). */
export interface CounsellingReferral {
  readonly id: Uuid;
  readonly referredTo: string;
  readonly reason: string;
  readonly referredAt: ISODateString;
}

/** The standing of a counselling goal. */
export type CounsellingGoalStatus = "active" | "achieved" | "abandoned";

/** A goal agreed within a counselling case. */
export interface CounsellingGoal {
  readonly id: Uuid;
  readonly description: string;
  readonly status: CounsellingGoalStatus;
  readonly setAt: ISODateString;
}
