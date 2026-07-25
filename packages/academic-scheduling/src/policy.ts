import type { ISODateString } from "@knowget/types";

/**
 * The kind of institutional scheduling constraint a policy expresses. Three of these are
 * enforced by the conflict engine directly from slot timing —
 * `max_teaching_periods`, `consecutive_period_limit` and `break_rule`; the remaining three
 * (`subject_sequencing`, `resource_priority`, `availability_window`) are recognised and
 * version-controlled, forming an extensibility seam for evaluators that need data beyond
 * the slot grid (see ADR-0026 / TD-27).
 */
export const POLICY_RULE_TYPES = [
  "max_teaching_periods",
  "consecutive_period_limit",
  "subject_sequencing",
  "resource_priority",
  "availability_window",
  "break_rule",
] as const;

export type PolicyRuleType = (typeof POLICY_RULE_TYPES)[number];

/** Lifecycle state of a scheduling policy. Only `active` policies are enforced. */
export const SCHEDULING_POLICY_STATUSES = ["draft", "active", "archived"] as const;

export type SchedulingPolicyStatus = (typeof SCHEDULING_POLICY_STATUSES)[number];

/** Narrow an arbitrary string to a {@link PolicyRuleType}. */
export const isPolicyRuleType = (value: string): value is PolicyRuleType =>
  (POLICY_RULE_TYPES as readonly string[]).includes(value);

/**
 * One entry in a scheduling policy's append-only revision log — the version it produced, a
 * human note, and when it was recorded. Policies are version-controlled like curriculum
 * frameworks (P2-D06): a counter plus this log.
 */
export interface PolicyRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}
