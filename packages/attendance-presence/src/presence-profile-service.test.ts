import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ParticipantNotFoundForAttendanceError, PresenceProfileNotFoundError } from "./errors";
import {
  InMemoryPresenceProfileRepository,
  type OrganizationDirectory,
  type ParticipantDirectory,
} from "./ports";
import type { PresenceIndicators } from "./presence-intelligence";
import { PresenceProfileService } from "./presence-profile-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "aa111111-1111-1111-1111-111111111111" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async () => true };
const participants: ParticipantDirectory = { exists: async (_t, id) => id === PERSON };

const service = () =>
  new PresenceProfileService({
    repository: new InMemoryPresenceProfileRepository(),
    organizations: orgs,
    participants,
  });

const indicators: PresenceIndicators = {
  attendancePercentage: 62,
  punctualityRate: 80,
  longestAbsentStreak: 6,
  chronicAbsenteeism: true,
  participationCount: 1,
  participationDiversity: 1,
  leaveCount: 0,
  engagementScore: 49,
  riskLevel: "high",
  anomalies: ["Attendance 62% is below 75%"],
};

describe("PresenceProfileService", () => {
  it("ensures exactly one profile per participant (idempotent)", async () => {
    const svc = service();
    const first = await svc.ensure(TENANT, ORG, PERSON);
    expect(first.version).toBe(1);
    expect(first.lastComputedAt).toBeNull();
    const second = await svc.ensure(TENANT, ORG, PERSON);
    expect(second.id).toBe(first.id);
  });

  it("rejects an unknown participant when creating a new profile", async () => {
    await expect(service().ensure(TENANT, ORG, UNKNOWN)).rejects.toBeInstanceOf(
      ParticipantNotFoundForAttendanceError,
    );
  });

  it("applies a computed indicator snapshot, bumping the version", async () => {
    const svc = service();
    await svc.ensure(TENANT, ORG, PERSON);
    const updated = await svc.apply(TENANT, PERSON, indicators);
    expect(updated.attendancePercentage).toBe(62);
    expect(updated.riskLevel).toBe("high");
    expect(updated.anomalies).toEqual(["Attendance 62% is below 75%"]);
    expect(updated.version).toBe(2);
    expect(updated.lastComputedAt).not.toBeNull();
  });

  it("refuses to apply to a participant with no profile", async () => {
    await expect(service().apply(TENANT, PERSON, indicators)).rejects.toBeInstanceOf(
      PresenceProfileNotFoundError,
    );
  });
});
