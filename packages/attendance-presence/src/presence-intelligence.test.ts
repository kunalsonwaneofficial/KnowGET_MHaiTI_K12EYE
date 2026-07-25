import { describe, expect, it } from "vitest";
import type { AttendanceRecordView, LeaveView, ParticipationView } from "./evaluation";
import type { AttendanceStatus } from "./attendance-status";
import type { ActivityType } from "./participation-type";
import { computePresenceIndicators } from "./presence-intelligence";

const rec = (status: AttendanceStatus, date: string): AttendanceRecordView => ({ status, date });
const part = (activityType: ActivityType, date: string): ParticipationView => ({
  activityType,
  date,
});

const many = (status: AttendanceStatus, from: number, to: number): AttendanceRecordView[] =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    rec(status, `2026-09-${String(from + i).padStart(2, "0")}`),
  );

describe("presence-intelligence", () => {
  it("reports low risk and no anomalies for a strong participant", () => {
    const records = [...many("present", 1, 9), rec("late", "2026-09-10")];
    const participations = [part("club", "2026-09-05"), part("sport", "2026-09-12")];
    const ind = computePresenceIndicators({ records, participations });
    expect(ind.attendancePercentage).toBe(100);
    expect(ind.chronicAbsenteeism).toBe(false);
    expect(ind.riskLevel).toBe("low");
    expect(ind.participationDiversity).toBe(2);
    expect(ind.anomalies).toEqual([]);
  });

  it("flags chronic absenteeism and high risk for low attendance", () => {
    const records = [...many("present", 1, 5), ...many("absent", 6, 10)];
    const ind = computePresenceIndicators({ records });
    expect(ind.attendancePercentage).toBe(50);
    expect(ind.longestAbsentStreak).toBe(5);
    expect(ind.chronicAbsenteeism).toBe(true);
    expect(ind.riskLevel).toBe("high");
    expect(ind.anomalies.some((a) => a.includes("below"))).toBe(true);
    expect(ind.anomalies.some((a) => a.includes("consecutive"))).toBe(true);
  });

  it("does not count approved-leave-covered absences toward the chronic-absence streak", () => {
    // Same five-day absent block as the high-risk case, but every day is covered by an
    // approved leave: attendance stays healthy and no chronic-absence streak is manufactured.
    const records = [...many("present", 1, 5), ...many("absent", 6, 10)];
    const leaves: LeaveView[] = [
      { fromDate: "2026-09-06", toDate: "2026-09-10", status: "approved" },
    ];
    const ind = computePresenceIndicators({ records, leaves });
    expect(ind.attendancePercentage).toBe(100);
    expect(ind.longestAbsentStreak).toBe(0);
    expect(ind.chronicAbsenteeism).toBe(false);
    expect(ind.riskLevel).toBe("low");
    expect(ind.leaveCount).toBe(1);
    expect(ind.anomalies.some((a) => a.includes("consecutive"))).toBe(false);
  });

  it("detects a medium risk band and the no-participation anomaly", () => {
    // 80% attendance (8 present, 2 absent, non-consecutive) → medium band, no chronic streak
    const records = [
      ...many("present", 1, 4),
      rec("absent", "2026-09-05"),
      ...many("present", 6, 9),
      rec("absent", "2026-09-10"),
    ];
    const ind = computePresenceIndicators({ records });
    expect(ind.attendancePercentage).toBe(80);
    expect(ind.chronicAbsenteeism).toBe(false);
    expect(ind.riskLevel).toBe("medium");
    expect(ind.anomalies).toContain("No co-curricular participation recorded");
  });

  it("computes an engagement score blending attendance and participation", () => {
    const records = many("present", 1, 10); // 100%
    const participations = [part("club", "2026-09-01"), part("sport", "2026-09-02")];
    const ind = computePresenceIndicators({ records, participations });
    // 0.7*100 + 0.3*100*(2/5) = 70 + 12 = 82
    expect(ind.engagementScore).toBe(82);
    expect(ind.participationCount).toBe(2);
  });
});
