import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyParticipationFieldError, ParticipantNotFoundForAttendanceError } from "./errors";
import { ParticipationService } from "./participation-service";
import {
  InMemoryParticipationRepository,
  type OrganizationDirectory,
  type ParticipantDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "aa111111-1111-1111-1111-111111111111" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async () => true };
const participants: ParticipantDirectory = { exists: async (_t, id) => id === PERSON };

function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const service = new ParticipationService({
    repository: new InMemoryParticipationRepository(),
    organizations: orgs,
    participants,
    events: bus,
  });
  return { events, service };
}

const record = (service: ParticipationService) =>
  service.record({
    tenantId: TENANT,
    organizationId: ORG,
    participantId: PERSON,
    activityType: "sport",
    activityName: "Inter-house football",
    date: "2026-09-15",
    engagementLevel: "high",
  });

describe("ParticipationService", () => {
  it("records a participation and publishes attendance.participation.recorded", async () => {
    const { events, service } = harness();
    const participation = await record(service);
    expect(participation.activityType).toBe("sport");
    expect(participation.engagementLevel).toBe("high");
    expect(events.map((e) => e.type)).toEqual(["attendance.participation.recorded"]);
  });

  it("rejects an unknown participant and an empty activity name", async () => {
    const { service } = harness();
    await expect(
      service.record({
        tenantId: TENANT,
        organizationId: ORG,
        participantId: UNKNOWN,
        activityType: "club",
        activityName: "Chess",
        date: "2026-09-15",
      }),
    ).rejects.toBeInstanceOf(ParticipantNotFoundForAttendanceError);
    await expect(
      service.record({
        tenantId: TENANT,
        organizationId: ORG,
        participantId: PERSON,
        activityType: "club",
        activityName: "   ",
        date: "2026-09-15",
      }),
    ).rejects.toBeInstanceOf(EmptyParticipationFieldError);
  });

  it("lists a participant's participation and amends engagement", async () => {
    const { service } = harness();
    const participation = await record(service);
    const updated = await service.setEngagement(TENANT, participation.id, "medium");
    expect(updated.engagementLevel).toBe("medium");
    expect(await service.listForParticipant(TENANT, PERSON)).toHaveLength(1);
  });
});
