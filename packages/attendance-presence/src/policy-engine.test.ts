import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import type { AttendanceConstraint, AttendanceRecordView, LeaveView } from "./evaluation";
import type { AttendancePolicyRuleType } from "./attendance-policy-rule";
import type { AttendanceStatus } from "./attendance-status";
import { breachedPolicies, evaluatePolicies, summarizeAttendance } from "./policy-engine";

const rec = (status: AttendanceStatus, date: string): AttendanceRecordView => ({ status, date });

const policy = (
  id: string,
  ruleType: AttendancePolicyRuleType,
  parameters: Record<string, unknown>,
  status = "active",
): AttendanceConstraint => ({ id: id as Uuid, ruleType, parameters, status });

describe("policy-engine — summarizeAttendance", () => {
  it("counts statuses and computes the attendance percentage with partial weighting", () => {
    const records = [
      rec("present", "2026-09-01"),
      rec("present", "2026-09-02"),
      rec("late", "2026-09-03"),
      rec("partial", "2026-09-04"),
      rec("absent", "2026-09-05"),
    ];
    const s = summarizeAttendance(records);
    expect(s.totalSessions).toBe(5);
    expect(s.countedSessions).toBe(5);
    // 1 + 1 + 1(late) + 0.5(partial) + 0(absent) = 3.5 over 5 = 70%
    expect(s.attendedWeight).toBe(3.5);
    expect(s.attendancePercentage).toBe(70);
    expect(s.present).toBe(2);
    expect(s.late).toBe(1);
    expect(s.partial).toBe(1);
    expect(s.absent).toBe(1);
  });

  it("excludes excused / medical-leave / official-duty from the denominator", () => {
    const s = summarizeAttendance([
      rec("present", "2026-09-01"),
      rec("excused", "2026-09-02"),
      rec("medical_leave", "2026-09-03"),
      rec("official_duty", "2026-09-04"),
    ]);
    expect(s.countedSessions).toBe(1);
    expect(s.attendancePercentage).toBe(100);
    expect(s.excused).toBe(3);
  });

  it("lets an approved leave excuse an absence but not override a presence", () => {
    const records = [
      rec("present", "2026-09-01"),
      rec("absent", "2026-09-02"),
      rec("absent", "2026-09-03"),
    ];
    const leaves: LeaveView[] = [
      { fromDate: "2026-09-02", toDate: "2026-09-02", status: "approved" },
    ];
    const s = summarizeAttendance(records, leaves);
    expect(s.leaveCovered).toBe(1);
    expect(s.countedSessions).toBe(2); // present + the uncovered absent
    expect(s.absent).toBe(1);
    expect(s.attendancePercentage).toBe(50);
  });

  it("ignores non-approved leave and computes punctuality", () => {
    const records = [
      rec("present", "2026-09-01"),
      rec("late", "2026-09-02"),
      rec("remote", "2026-09-03"),
    ];
    const leaves: LeaveView[] = [
      { fromDate: "2026-09-01", toDate: "2026-09-30", status: "requested" },
    ];
    const s = summarizeAttendance(records, leaves);
    expect(s.leaveCovered).toBe(0);
    // attended = present + late + remote = 3; on-time = present + remote = 2 → 66.67%
    expect(s.punctualityRate).toBe(66.67);
  });

  it("returns 100% for a participant with no counted sessions", () => {
    expect(summarizeAttendance([]).attendancePercentage).toBe(100);
    expect(summarizeAttendance([rec("excused", "2026-09-01")]).attendancePercentage).toBe(100);
  });
});

describe("policy-engine — evaluatePolicies", () => {
  const summary = summarizeAttendance([
    rec("present", "2026-09-01"),
    rec("present", "2026-09-02"),
    rec("present", "2026-09-03"),
    rec("absent", "2026-09-04"),
  ]); // 75%

  it("evaluates the three percentage rules against minimumPercentage", () => {
    const evals = evaluatePolicies(summary, [
      policy("p1", "minimum_attendance_percentage", { minimumPercentage: 75 }),
      policy("p2", "examination_eligibility", { minimumPercentage: 80 }),
      policy("p3", "promotion_eligibility", { minimumPercentage: 60 }),
    ]);
    expect(evals).toHaveLength(3);
    expect(evals.find((e) => e.policyId === "p1")!.compliant).toBe(true);
    expect(evals.find((e) => e.policyId === "p2")!.compliant).toBe(false);
    expect(evals.find((e) => e.policyId === "p3")!.compliant).toBe(true);
    expect(breachedPolicies(evals).map((e) => e.policyId)).toEqual(["p2"]);
  });

  it("skips inactive policies, non-percentage rules and malformed parameters", () => {
    const evals = evaluatePolicies(summary, [
      policy("inactive", "minimum_attendance_percentage", { minimumPercentage: 90 }, "draft"),
      policy("grace", "grace_period", { graceMinutes: 10 }),
      policy("bad", "minimum_attendance_percentage", { note: "no threshold" }),
    ]);
    expect(evals).toEqual([]);
  });
});
