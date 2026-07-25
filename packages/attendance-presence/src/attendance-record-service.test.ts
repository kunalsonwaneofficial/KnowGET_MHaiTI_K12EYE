import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AttendanceRecordService } from "./attendance-record-service";
import { AttendanceSessionService } from "./attendance-session-service";
import {
  AttendanceSessionStateError,
  DuplicateAttendanceRecordError,
  InvalidAttendanceCorrectionError,
  ParticipantNotFoundForAttendanceError,
} from "./errors";
import {
  InMemoryAttendanceRecordRepository,
  InMemoryAttendanceSessionRepository,
  type OrganizationDirectory,
  type ParticipantDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const P1 = "aa111111-1111-1111-1111-111111111111" as Uuid;
const P2 = "bb222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async () => true };
const participants: ParticipantDirectory = { exists: async (_t, id) => id === P1 || id === P2 };

async function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const sessionRepo = new InMemoryAttendanceSessionRepository();
  const sessions = new AttendanceSessionService({
    repository: sessionRepo,
    organizations: orgs,
    events: bus,
  });
  const records = new AttendanceRecordService({
    repository: new InMemoryAttendanceRecordRepository(),
    sessions: sessionRepo,
    participants,
    events: bus,
  });
  const session = await sessions.create({
    tenantId: TENANT,
    organizationId: ORG,
    sessionType: "academic_period",
    title: "P1",
    date: "2026-09-01",
  });
  return { events, sessions, records, sessionId: session.id };
}

describe("AttendanceRecordService", () => {
  it("records attendance, deriving org+date from the session, and publishes attendance.recorded", async () => {
    const { events, records, sessionId } = await harness();
    const record = await records.record({
      tenantId: TENANT,
      sessionId,
      participantId: P1,
      participantType: "student",
      status: "present",
      method: "manual",
    });
    expect(record.organizationId).toBe(ORG);
    expect(record.date).toBe("2026-09-01");
    expect(record.version).toBe(1);
    expect(events.map((e) => e.type)).toContain("attendance.recorded");
  });

  it("bulk-records many participants in one call", async () => {
    const { records, sessionId } = await harness();
    const result = await records.bulkRecord({
      tenantId: TENANT,
      sessionId,
      method: "bulk",
      entries: [
        { participantId: P1, participantType: "student", status: "present" },
        { participantId: P2, participantType: "student", status: "absent" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(await records.listForSession(TENANT, sessionId)).toHaveLength(2);
  });

  it("rejects an unknown participant and a duplicate record", async () => {
    const { records, sessionId } = await harness();
    await expect(
      records.record({
        tenantId: TENANT,
        sessionId,
        participantId: UNKNOWN,
        participantType: "student",
        status: "present",
        method: "manual",
      }),
    ).rejects.toBeInstanceOf(ParticipantNotFoundForAttendanceError);
    await records.record({
      tenantId: TENANT,
      sessionId,
      participantId: P1,
      participantType: "student",
      status: "present",
      method: "manual",
    });
    await expect(
      records.record({
        tenantId: TENANT,
        sessionId,
        participantId: P1,
        participantType: "student",
        status: "late",
        method: "manual",
      }),
    ).rejects.toBeInstanceOf(DuplicateAttendanceRecordError);
  });

  it("refuses to record into a closed session", async () => {
    const { records, sessions, sessionId } = await harness();
    await sessions.open(TENANT, sessionId);
    await sessions.close(TENANT, sessionId);
    await expect(
      records.record({
        tenantId: TENANT,
        sessionId,
        participantId: P1,
        participantType: "student",
        status: "present",
        method: "manual",
      }),
    ).rejects.toBeInstanceOf(AttendanceSessionStateError);
  });

  it("corrects a record with a full audit trail and rejects a no-op correction", async () => {
    const { events, records, sessionId } = await harness();
    const record = await records.record({
      tenantId: TENANT,
      sessionId,
      participantId: P1,
      participantType: "student",
      status: "absent",
      method: "manual",
    });
    const corrected = await records.correct(
      TENANT,
      record.id,
      "present",
      "arrived, marked in error",
      P2,
    );
    expect(corrected.status).toBe("present");
    expect(corrected.version).toBe(2);
    expect(corrected.corrections).toHaveLength(1);
    expect(corrected.corrections[0]).toMatchObject({
      fromStatus: "absent",
      toStatus: "present",
      correctedBy: P2,
    });
    expect(events.map((e) => e.type)).toContain("attendance.corrected");
    await expect(records.correct(TENANT, record.id, "present", "again")).rejects.toBeInstanceOf(
      InvalidAttendanceCorrectionError,
    );
  });
});
