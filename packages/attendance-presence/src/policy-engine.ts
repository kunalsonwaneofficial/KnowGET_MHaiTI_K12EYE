import type {
  AttendanceConstraint,
  AttendanceRecordView,
  AttendanceSummary,
  LeaveView,
  PolicyEvaluation,
} from "./evaluation";
import { classifyStatus } from "./attendance-status";
import { approvedRanges, withinAnyRange } from "./leave-ranges";

const round = (value: number): number => Math.round(value * 100) / 100;

/** Read a finite number parameter, or `null` if absent/malformed. */
const numberParam = (parameters: Readonly<Record<string, unknown>>, key: string): number | null => {
  const raw = parameters[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
};

/**
 * Summarise a participant's attendance over a set of records. Approved leave **excuses an
 * absence** (an `absent` record whose date falls in an approved-leave range is excluded from
 * the calculation, neither helping nor hurting); it never overrides an actual presence.
 * Excused, medical-leave and official-duty statuses are likewise excluded from the
 * denominator. Attendance percentage is the summed present-weight over the counted sessions
 * (present/late/remote = 1, partial = 0.5, absent = 0). Pure and deterministic.
 */
export function summarizeAttendance(
  records: readonly AttendanceRecordView[],
  leaves: readonly LeaveView[] = [],
): AttendanceSummary {
  const ranges = approvedRanges(leaves);
  const tally = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    partial: 0,
    remote: 0,
    leaveCovered: 0,
  };
  let countedSessions = 0;
  let attendedWeight = 0;
  let attendedTotal = 0;
  let onTime = 0;

  for (const record of records) {
    if (record.status === "absent" && withinAnyRange(record.date, ranges)) {
      tally.leaveCovered += 1;
      continue;
    }
    switch (record.status) {
      case "present":
        tally.present += 1;
        break;
      case "absent":
        tally.absent += 1;
        break;
      case "late":
        tally.late += 1;
        break;
      case "partial":
        tally.partial += 1;
        break;
      case "remote":
        tally.remote += 1;
        break;
      case "excused":
      case "medical_leave":
      case "official_duty":
        tally.excused += 1;
        break;
    }
    const cls = classifyStatus(record.status);
    if (cls.counts) {
      countedSessions += 1;
      attendedWeight += cls.weight;
      if (cls.weight > 0) {
        attendedTotal += 1;
        if (cls.onTime) {
          onTime += 1;
        }
      }
    }
  }

  return {
    totalSessions: records.length,
    countedSessions,
    attendedWeight,
    present: tally.present,
    absent: tally.absent,
    late: tally.late,
    excused: tally.excused,
    partial: tally.partial,
    remote: tally.remote,
    leaveCovered: tally.leaveCovered,
    attendancePercentage:
      countedSessions === 0 ? 100 : round((100 * attendedWeight) / countedSessions),
    punctualityRate: attendedTotal === 0 ? 100 : round((100 * onTime) / attendedTotal),
  };
}

const PERCENTAGE_RULES = new Set([
  "minimum_attendance_percentage",
  "examination_eligibility",
  "promotion_eligibility",
]);

/**
 * Evaluate the active policies against an attendance summary. The three percentage-based
 * rules compare the computed attendance percentage against each policy's `minimumPercentage`
 * parameter; the other rule types are recognised but not yet evaluated (TD-28) and produce
 * no evaluation. The engine reports compliance; downstream domains decide business outcomes.
 */
export function evaluatePolicies(
  summary: AttendanceSummary,
  policies: readonly AttendanceConstraint[],
): PolicyEvaluation[] {
  const evaluations: PolicyEvaluation[] = [];
  for (const policy of policies) {
    if (policy.status !== "active" || !PERCENTAGE_RULES.has(policy.ruleType)) {
      continue;
    }
    const threshold = numberParam(policy.parameters, "minimumPercentage");
    if (threshold === null) {
      continue;
    }
    evaluations.push({
      policyId: policy.id,
      ruleType: policy.ruleType,
      compliant: summary.attendancePercentage >= threshold,
      value: summary.attendancePercentage,
      threshold,
      detail: {
        attendancePercentage: summary.attendancePercentage,
        countedSessions: summary.countedSessions,
      },
    });
  }
  return evaluations;
}

/** The policy evaluations that are non-compliant (a threshold has been breached). */
export const breachedPolicies = (evaluations: readonly PolicyEvaluation[]): PolicyEvaluation[] =>
  evaluations.filter((evaluation) => !evaluation.compliant);
