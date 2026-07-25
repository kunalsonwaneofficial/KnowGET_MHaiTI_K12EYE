import type { ISODateString } from "@knowget/types";

/**
 * The kind of institutional attendance rule a policy expresses. The three percentage-based
 * rules — `minimum_attendance_percentage`, `examination_eligibility` and
 * `promotion_eligibility` — are evaluated by the policy engine against a computed attendance
 * percentage (each reads a `minimumPercentage` parameter). The remaining three
 * (`late_arrival`, `early_departure`, `grace_period`) shape how records are captured rather
 * than eligibility; they are recognised and version-controlled but not yet evaluated by the
 * engine (an extensibility seam — see ADR-0027 / TD-28).
 */
export const ATTENDANCE_POLICY_RULE_TYPES = [
  "minimum_attendance_percentage",
  "examination_eligibility",
  "promotion_eligibility",
  "late_arrival",
  "early_departure",
  "grace_period",
] as const;

export type AttendancePolicyRuleType = (typeof ATTENDANCE_POLICY_RULE_TYPES)[number];

/** Lifecycle of an attendance policy. Only `active` policies are evaluated. */
export const ATTENDANCE_POLICY_STATUSES = ["draft", "active", "archived"] as const;

export type AttendancePolicyStatus = (typeof ATTENDANCE_POLICY_STATUSES)[number];

/** Narrow an arbitrary string to an {@link AttendancePolicyRuleType}. */
export const isAttendancePolicyRuleType = (value: string): value is AttendancePolicyRuleType =>
  (ATTENDANCE_POLICY_RULE_TYPES as readonly string[]).includes(value);

/**
 * One entry in an attendance policy's append-only revision log — the version it produced,
 * a human note, and when it was recorded. Policies are version-controlled like scheduling
 * policies (P2-D07): a counter plus this log.
 */
export interface AttendancePolicyRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}
