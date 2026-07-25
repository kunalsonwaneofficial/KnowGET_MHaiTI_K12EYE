import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ClassroomSessionService } from "./classroom-session-service";
import { ClassroomSessionStateError, OrganizationNotFoundForTeachingError } from "./errors";
import { CLASSROOM_SESSION_COMPLETED, LESSON_DELIVERED } from "./teaching-learning-events";
import { InMemoryClassroomSessionRepository, type OrganizationDirectory } from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;

const allow = (allowed: readonly string[]): OrganizationDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("ClassroomSessionService", () => {
  let repository: InMemoryClassroomSessionRepository;
  let events: DomainEvent[];
  let service: ClassroomSessionService;

  beforeEach(() => {
    repository = new InMemoryClassroomSessionRepository();
    events = [];
    service = new ClassroomSessionService({
      repository,
      organizations: allow([ORG]),
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Period 1 — Fractions",
      date: "2026-09-15",
      plannedTopics: ["equivalent fractions", "adding fractions"],
    });

  it("rejects a session for an unknown organization", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        title: "X",
        date: "2026-09-15",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForTeachingError);
  });

  it("delivers then completes, capturing actual delivery and emitting both events", async () => {
    const session = await create();
    expect(session.status).toBe("scheduled");
    const delivered = await service.deliver(TENANT, session.id, {
      actualTopicsCovered: ["equivalent fractions"],
      activitiesCompleted: ["worksheet"],
      resourcesUsedIds: ["r1" as Uuid],
      participation: { expected: 30, engaged: 28 },
    });
    expect(delivered.status).toBe("delivered");
    expect(delivered.actualTopicsCovered).toEqual(["equivalent fractions"]);
    const completed = await service.complete(TENANT, session.id);
    expect(completed.status).toBe("completed");
    expect(events.map((e) => e.type)).toEqual([LESSON_DELIVERED, CLASSROOM_SESSION_COMPLETED]);
  });

  it("cannot re-plan topics once delivered", async () => {
    const session = await create();
    await service.deliver(TENANT, session.id, {});
    await expect(service.setPlannedTopics(TENANT, session.id, ["x"])).rejects.toBeInstanceOf(
      ClassroomSessionStateError,
    );
  });

  it("cancels a scheduled session", async () => {
    const session = await create();
    const cancelled = await service.cancel(TENANT, session.id);
    expect(cancelled.status).toBe("cancelled");
  });
});
