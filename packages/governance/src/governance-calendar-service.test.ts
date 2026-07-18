import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CommitteeNotFoundForGovernanceError,
  GovernanceCalendarEntryNotFoundError,
  OrganizationNotFoundForGovernanceError,
} from "./errors";
import { GovernanceCalendarService } from "./governance-calendar-service";
import {
  InMemoryCommitteeRepository,
  InMemoryGovernanceBodyRepository,
  InMemoryGovernanceCalendarRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

let service: GovernanceCalendarService;

beforeEach(() => {
  service = new GovernanceCalendarService({
    repository: new InMemoryGovernanceCalendarRepository(),
    organizations: orgDir,
    governanceBodies: new InMemoryGovernanceBodyRepository(),
    committees: new InMemoryCommitteeRepository(),
  });
});

const schedule = (scheduledOn: string, title = "Review") =>
  service.schedule({
    tenantId: TENANT,
    organizationId: ORG,
    type: "review",
    title,
    scheduledOn,
  });

describe("GovernanceCalendarService", () => {
  it("validates the organization and any referenced committee", async () => {
    await expect(
      service.schedule({
        tenantId: TENANT,
        organizationId: MISSING,
        type: "meeting",
        title: "X",
        scheduledOn: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
    await expect(
      service.schedule({
        tenantId: TENANT,
        organizationId: ORG,
        type: "meeting",
        title: "X",
        scheduledOn: "2026-01-01",
        committeeId: MISSING,
      }),
    ).rejects.toBeInstanceOf(CommitteeNotFoundForGovernanceError);
  });

  it("lists organization entries and upcoming entries in date order", async () => {
    await schedule("2026-03-01", "March");
    await schedule("2026-01-01", "January");
    const past = await schedule("2025-01-01", "Old");
    await service.cancel(TENANT, past.id);

    const ordered = await service.listForOrganization(TENANT, ORG);
    expect(ordered.map((e) => e.title)).toEqual(["Old", "January", "March"]);

    const upcoming = await service.upcoming(TENANT, "2026-02-01");
    expect(upcoming.map((e) => e.title)).toEqual(["March"]);
  });

  it("completes an entry recording minutes", async () => {
    const entry = await schedule("2026-04-01", "Audit review");
    const completed = await service.complete(TENANT, entry.id, { minutes: "Findings noted." });
    expect(completed.status).toBe("completed");
    expect(completed.minutes).toBe("Findings noted.");
  });

  it("isolates tenants", async () => {
    const entry = await schedule("2026-05-01");
    const other = "ffffffff-ffff-ffff-ffff-ffffffffffff" as TenantId;
    await expect(service.getById(other, entry.id)).rejects.toBeInstanceOf(
      GovernanceCalendarEntryNotFoundError,
    );
  });
});
