import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AttendanceSessionService } from "./attendance-session-service";
import { AttendanceSessionStateError, OrganizationNotFoundForAttendanceError } from "./errors";
import { InMemoryAttendanceSessionRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const service = new AttendanceSessionService({
    repository: new InMemoryAttendanceSessionRepository(),
    organizations: orgs,
    events: bus,
  });
  return { events, service };
}

const create = (service: AttendanceSessionService) =>
  service.create({
    tenantId: TENANT,
    organizationId: ORG,
    sessionType: "academic_period",
    title: "Grade 5A — Period 1",
    date: "2026-09-01",
  });

describe("AttendanceSessionService", () => {
  it("creates a scheduled session and publishes attendance.session.created", async () => {
    const { events, service } = harness();
    const session = await create(service);
    expect(session.status).toBe("scheduled");
    expect(events.map((e) => e.type)).toEqual(["attendance.session.created"]);
  });

  it("rejects an unknown organization", async () => {
    const { service } = harness();
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        sessionType: "event",
        title: "X",
        date: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAttendanceError);
  });

  it("moves scheduled → open → closed and blocks illegal transitions", async () => {
    const { service } = harness();
    const session = await create(service);
    expect((await service.open(TENANT, session.id)).status).toBe("open");
    expect((await service.close(TENANT, session.id)).status).toBe("closed");
    await expect(service.open(TENANT, session.id)).rejects.toBeInstanceOf(
      AttendanceSessionStateError,
    );
  });

  it("cancels a scheduled session", async () => {
    const { service } = harness();
    const session = await create(service);
    expect((await service.cancel(TENANT, session.id)).status).toBe("cancelled");
  });
});
