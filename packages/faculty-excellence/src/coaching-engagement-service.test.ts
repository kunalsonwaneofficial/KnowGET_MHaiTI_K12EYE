import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CoachingEngagementService } from "./coaching-engagement-service";
import { DuplicateActiveEngagementError, EmployeeNotFoundForFacultyError } from "./errors";
import {
  type EmployeeDirectory,
  InMemoryCoachingEngagementRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const COACH = "33333333-3333-3333-3333-333333333333" as Uuid;
const COACH2 = "55555555-5555-5555-5555-555555555555" as Uuid;
const COACHEE = "44444444-4444-4444-4444-444444444444" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === COACH || id === COACH2 || id === COACHEE,
  organizationOf: async (_t, id) => (id === COACH || id === COACH2 || id === COACHEE ? ORG : null),
};

function service(): { svc: CoachingEngagementService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new CoachingEngagementService({
    repository: new InMemoryCoachingEngagementRepository(),
    employees,
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const propose = (coachId = COACH) =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    coachId,
    coacheeId: COACHEE,
    focus: "Questioning",
  }) as const;

describe("CoachingEngagementService", () => {
  it("proposes, runs the lifecycle and publishes events", async () => {
    const { svc, events } = service();
    const e = await svc.propose(propose());
    await svc.accept(TENANT, e.id);
    await svc.complete(TENANT, e.id, "2026-06-30");
    expect(events.map((ev) => ev.type)).toEqual([
      "faculty.coaching.proposed",
      "faculty.coaching.accepted",
      "faculty.coaching.completed",
    ]);
  });

  it("rejects an unknown employee", async () => {
    const { svc } = service();
    await expect(
      svc.propose({ ...propose(), coachId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFacultyError);
  });

  it("enforces at most one active engagement per coachee", async () => {
    const { svc } = service();
    const first = await svc.propose(propose(COACH));
    await svc.accept(TENANT, first.id);
    const second = await svc.propose(propose(COACH2)); // same coachee, different coach
    await expect(svc.accept(TENANT, second.id)).rejects.toBeInstanceOf(
      DuplicateActiveEngagementError,
    );
    // once the first completes, the second can be accepted
    await svc.complete(TENANT, first.id);
    expect((await svc.accept(TENANT, second.id)).status).toBe("active");
  });
});
