import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  InvalidLeaveRangeError,
  LeaveStateError,
  ParticipantNotFoundForAttendanceError,
} from "./errors";
import { LeaveService } from "./leave-service";
import {
  InMemoryLeaveRepository,
  type OrganizationDirectory,
  type ParticipantDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "aa111111-1111-1111-1111-111111111111" as Uuid;
const REVIEWER = "cc333333-3333-3333-3333-333333333333" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async () => true };
const participants: ParticipantDirectory = { exists: async (_t, id) => id === PERSON };

function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const service = new LeaveService({
    repository: new InMemoryLeaveRepository(),
    organizations: orgs,
    participants,
    events: bus,
  });
  return { events, service };
}

const request = (service: LeaveService) =>
  service.request({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    holderType: "student",
    leaveType: "medical",
    fromDate: "2026-09-10",
    toDate: "2026-09-12",
    reason: "fever",
  });

describe("LeaveService", () => {
  it("files a leave request and publishes attendance.leave.requested", async () => {
    const { events, service } = harness();
    const leave = await request(service);
    expect(leave.status).toBe("requested");
    expect(events.map((e) => e.type)).toEqual(["attendance.leave.requested"]);
  });

  it("rejects an unknown participant and an inverted date range", async () => {
    const { service } = harness();
    await expect(
      service.request({
        tenantId: TENANT,
        organizationId: ORG,
        personId: UNKNOWN,
        holderType: "student",
        leaveType: "medical",
        fromDate: "2026-09-10",
        toDate: "2026-09-12",
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(ParticipantNotFoundForAttendanceError);
    await expect(
      service.request({
        tenantId: TENANT,
        organizationId: ORG,
        personId: PERSON,
        holderType: "student",
        leaveType: "medical",
        fromDate: "2026-09-12",
        toDate: "2026-09-10",
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(InvalidLeaveRangeError);
  });

  it("approves a request, records the reviewer, and blocks a second decision", async () => {
    const { events, service } = harness();
    const leave = await request(service);
    const approved = await service.approve(TENANT, leave.id, REVIEWER, "documents verified");
    expect(approved.status).toBe("approved");
    expect(approved.reviewedBy).toBe(REVIEWER);
    expect(approved.reviewedAt).not.toBeNull();
    expect(events.map((e) => e.type)).toContain("attendance.leave.approved");
    await expect(service.reject(TENANT, leave.id, REVIEWER)).rejects.toBeInstanceOf(
      LeaveStateError,
    );
  });

  it("rejects a request and publishes attendance.leave.rejected", async () => {
    const { events, service } = harness();
    const leave = await request(service);
    expect((await service.reject(TENANT, leave.id, REVIEWER)).status).toBe("rejected");
    expect(events.map((e) => e.type)).toContain("attendance.leave.rejected");
  });
});
