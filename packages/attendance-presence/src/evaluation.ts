import type { Uuid } from "@knowget/types";
import type { AttendancePolicyRuleType } from "./attendance-policy-rule";
import type { AttendanceStatus } from "./attendance-status";
import type { ActivityType } from "./participation-type";

/**
 * The minimal view of an attendance record the policy engine and presence intelligence
 * need. The `AttendanceRecord` aggregate structurally satisfies this contract, so the
 * engines stay decoupled from the aggregate's full shape.
 */
export interface AttendanceRecordView {
  readonly status: AttendanceStatus;
  /** The session date in ISO `YYYY-MM-DD` form (ISO dates sort and compare as strings). */
  readonly date: string;
}

/** The minimal view of a leave the engines need; only `approved` leave affects attendance. */
export interface LeaveView {
  readonly fromDate: string;
  readonly toDate: string;
  readonly status: string;
}

/** The minimal view of a participation record presence intelligence consumes. */
export interface ParticipationView {
  readonly activityType: ActivityType;
  readonly date: string;
}

/**
 * The minimal view of an active attendance policy the engine evaluates. The
 * `AttendancePolicy` aggregate structurally satisfies this contract.
 */
export interface AttendanceConstraint {
  readonly id: Uuid;
  readonly ruleType: AttendancePolicyRuleType;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly status: string;
}

/** A computed summary of a participant's attendance over a set of records (+ approved leave). */
export interface AttendanceSummary {
  readonly totalSessions: number;
  /** Sessions that count toward attendance (excludes excused / leave-covered). */
  readonly countedSessions: number;
  /** Numerator: sum of per-session weights (present = 1, partial = 0.5). */
  readonly attendedWeight: number;
  readonly present: number;
  readonly absent: number;
  readonly late: number;
  readonly excused: number;
  readonly partial: number;
  readonly remote: number;
  readonly leaveCovered: number;
  readonly attendancePercentage: number;
  readonly punctualityRate: number;
}

/** The result of evaluating one policy against an attendance summary. */
export interface PolicyEvaluation {
  readonly policyId: Uuid;
  readonly ruleType: AttendancePolicyRuleType;
  readonly compliant: boolean;
  readonly value: number;
  readonly threshold: number | null;
  readonly detail: Readonly<Record<string, unknown>>;
}
