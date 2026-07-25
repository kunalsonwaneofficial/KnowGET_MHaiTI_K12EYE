import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AttendanceEvaluationService } from "./attendance-evaluation-service";
import { AttendancePolicyService } from "./attendance-policy-service";
import { AttendanceRecordService } from "./attendance-record-service";
import { AttendanceSessionService } from "./attendance-session-service";
import { LeaveService } from "./leave-service";
import { ParticipationService } from "./participation-service";
import {
  InMemoryAttendancePolicyRepository,
  InMemoryAttendanceRecordRepository,
  InMemoryAttendanceSessionRepository,
  InMemoryLeaveRepository,
  InMemoryParticipationRepository,
  InMemoryPresenceProfileRepository,
  type OrganizationDirectory,
  type ParticipantDirectory,
} from "./ports";
import { PresenceProfileService } from "./presence-profile-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "aa111111-1111-1111-1111-111111111111" as Uuid;
const REVIEWER = "cc333333-3333-3333-3333-333333333333" as Uuid;

const yes: OrganizationDirectory & ParticipantDirectory = { exists: async () => true };

function platform() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const sessionRepo = new InMemoryAttendanceSessionRepository();
  const recordRepo = new InMemoryAttendanceRecordRepository();
  const leaveRepo = new InMemoryLeaveRepository();
  const policyRepo = new InMemoryAttendancePolicyRepository();
  const participationRepo = new InMemoryParticipationRepository();
  const profileRepo = new InMemoryPresenceProfileRepository();

  const sessions = new AttendanceSessionService({
    repository: sessionRepo,
    organizations: yes,
    events: bus,
  });
  const records = new AttendanceRecordService({
    repository: recordRepo,
    sessions: sessionRepo,
    participants: yes,
    events: bus,
  });
  const leaves = new LeaveService({
    repository: leaveRepo,
    organizations: yes,
    participants: yes,
    events: bus,
  });
  const policies = new AttendancePolicyService({ repository: policyRepo, organizations: yes });
  const participation = new ParticipationService({
    repository: participationRepo,
    organizations: yes,
    participants: yes,
    events: bus,
  });
  const profiles = new PresenceProfileService({
    repository: profileRepo,
    organizations: yes,
    participants: yes,
  });
  const evaluation = new AttendanceEvaluationService({
    records: recordRepo,
    leaves: leaveRepo,
    policies: policyRepo,
    participations: participationRepo,
    profiles,
    events: bus,
  });
  return { events, sessions, records, leaves, policies, participation, profiles, evaluation };
}

/** Record one participant's status for a session on a given date. */
async function mark(
  { sessions, records }: ReturnType<typeof platform>,
  date: string,
  status: "present" | "absent",
) {
  const session = await sessions.create({
    tenantId: TENANT,
    organizationId: ORG,
    sessionType: "academic_period",
    title: `Session ${date}`,
    date,
  });
  await records.record({
    tenantId: TENANT,
    sessionId: session.id,
    participantId: STUDENT,
    participantType: "student",
    status,
    method: "manual",
  });
}

describe("attendance integration — evaluation and presence", () => {
  it("excuses an approved-leave absence and evaluates policy compliance end-to-end", async () => {
    const p = platform();
    // 3 present, 2 absent → 60% before leave
    await mark(p, "2026-09-01", "present");
    await mark(p, "2026-09-02", "present");
    await mark(p, "2026-09-03", "present");
    await mark(p, "2026-09-04", "absent");
    await mark(p, "2026-09-05", "absent");

    // Approve leave covering one absent day → 3/4 = 75%
    const leave = await p.leaves.request({
      tenantId: TENANT,
      organizationId: ORG,
      personId: STUDENT,
      holderType: "student",
      leaveType: "medical",
      fromDate: "2026-09-04",
      toDate: "2026-09-04",
      reason: "fever",
    });
    await p.leaves.approve(TENANT, leave.id, REVIEWER);

    const policy = await p.policies.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MIN-75",
      name: "Minimum 75%",
      ruleType: "minimum_attendance_percentage",
      parameters: { minimumPercentage: 75 },
    });
    await p.policies.activate(TENANT, policy.id);

    const result = await p.evaluation.evaluate(TENANT, ORG, STUDENT);
    expect(result.summary.leaveCovered).toBe(1);
    expect(result.summary.attendancePercentage).toBe(75);
    expect(result.compliant).toBe(true);
    expect(p.events.map((e) => e.type)).toContain("attendance.policy.evaluated");
  });

  it("emits a threshold-reached event when a participant falls below the minimum", async () => {
    const p = platform();
    await mark(p, "2026-09-01", "present");
    await mark(p, "2026-09-02", "absent");
    await mark(p, "2026-09-03", "absent");
    await mark(p, "2026-09-04", "absent");
    const policy = await p.policies.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MIN-75",
      name: "Minimum 75%",
      ruleType: "minimum_attendance_percentage",
      parameters: { minimumPercentage: 75 },
    });
    await p.policies.activate(TENANT, policy.id);

    const result = await p.evaluation.evaluate(TENANT, ORG, STUDENT);
    expect(result.summary.attendancePercentage).toBe(25);
    expect(result.compliant).toBe(false);
    const breach = p.events.find((e) => e.type === "attendance.threshold.reached");
    expect(breach).toBeDefined();
    expect((breach!.payload as { threshold: number }).threshold).toBe(75);
  });

  it("recomputes the presence profile from records, leave and participation", async () => {
    const p = platform();
    await mark(p, "2026-09-01", "present");
    await mark(p, "2026-09-02", "present");
    await mark(p, "2026-09-03", "absent");
    await p.participation.record({
      tenantId: TENANT,
      organizationId: ORG,
      participantId: STUDENT,
      activityType: "sport",
      activityName: "Football",
      date: "2026-09-02",
    });

    const profile = await p.evaluation.recomputePresence(TENANT, ORG, STUDENT);
    expect(profile.attendancePercentage).toBe(66.67); // 2/3, rounded to 2 dp
    expect(profile.participationCount).toBe(1);
    expect(profile.participationDiversity).toBe(1);
    expect(profile.lastComputedAt).not.toBeNull();
    expect(profile.version).toBe(2);
    // idempotent participant → one profile, recompute bumps the version again
    const again = await p.evaluation.recomputePresence(TENANT, ORG, STUDENT);
    expect(again.id).toBe(profile.id);
    expect(again.version).toBe(3);
  });
});
