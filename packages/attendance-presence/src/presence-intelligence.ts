import type { AttendanceRecordView, LeaveView, ParticipationView } from "./evaluation";
import { summarizeAttendance } from "./policy-engine";

/** Thresholds behind the (non-predictive) presence indicators. Descriptive analytics only. */
const CHRONIC_ABSENTEEISM_PERCENTAGE = 75;
const CHRONIC_ABSENTEEISM_STREAK = 5;
const AT_RISK_PERCENTAGE = 85;

/**
 * AI-ready, read-only presence indicators for one participant. Descriptive analytics only —
 * predictive intervention belongs to the Institutional Intelligence program, which consumes
 * these signals.
 */
export interface PresenceIndicators {
  readonly attendancePercentage: number;
  readonly punctualityRate: number;
  readonly longestAbsentStreak: number;
  readonly chronicAbsenteeism: boolean;
  readonly participationCount: number;
  readonly participationDiversity: number;
  readonly leaveCount: number;
  readonly engagementScore: number;
  readonly riskLevel: "low" | "medium" | "high";
  readonly anomalies: readonly string[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** Longest run of consecutive `absent` records once ordered by date. */
function longestAbsentStreak(records: readonly AttendanceRecordView[]): number {
  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let current = 0;
  for (const record of ordered) {
    if (record.status === "absent") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Compute presence indicators for a participant from their attendance records, approved
 * leave and co-curricular participation. Pure and deterministic; reuses the policy engine's
 * summary so the attendance figures are consistent with what gates eligibility.
 */
export function computePresenceIndicators(input: {
  readonly records: readonly AttendanceRecordView[];
  readonly leaves?: readonly LeaveView[];
  readonly participations?: readonly ParticipationView[];
}): PresenceIndicators {
  const records = input.records;
  const leaves = input.leaves ?? [];
  const participations = input.participations ?? [];
  const summary = summarizeAttendance(records, leaves);
  const streak = longestAbsentStreak(records);
  const chronicAbsenteeism =
    summary.attendancePercentage < CHRONIC_ABSENTEEISM_PERCENTAGE ||
    streak >= CHRONIC_ABSENTEEISM_STREAK;
  const participationDiversity = new Set(participations.map((p) => p.activityType)).size;
  const leaveCount = leaves.filter((leave) => leave.status === "approved").length;

  // Engagement blends attendance (70%) with capped participation breadth (30%).
  const participationSignal = Math.min(participations.length / 5, 1);
  const engagementScore = round(
    0.7 * summary.attendancePercentage + 0.3 * 100 * participationSignal,
  );

  const anomalies: string[] = [];
  if (summary.attendancePercentage < CHRONIC_ABSENTEEISM_PERCENTAGE) {
    anomalies.push(
      `Attendance ${summary.attendancePercentage}% is below ${CHRONIC_ABSENTEEISM_PERCENTAGE}%`,
    );
  }
  if (streak >= CHRONIC_ABSENTEEISM_STREAK) {
    anomalies.push(`${streak} consecutive absences`);
  }
  if (summary.late > 0 && summary.punctualityRate < 80) {
    anomalies.push(`Punctuality ${summary.punctualityRate}% with ${summary.late} late arrival(s)`);
  }
  if (records.length > 0 && participations.length === 0) {
    anomalies.push("No co-curricular participation recorded");
  }

  const riskLevel: PresenceIndicators["riskLevel"] = chronicAbsenteeism
    ? "high"
    : summary.attendancePercentage < AT_RISK_PERCENTAGE
      ? "medium"
      : "low";

  return {
    attendancePercentage: summary.attendancePercentage,
    punctualityRate: summary.punctualityRate,
    longestAbsentStreak: streak,
    chronicAbsenteeism,
    participationCount: participations.length,
    participationDiversity,
    leaveCount,
    engagementScore,
    riskLevel,
    anomalies,
  };
}
