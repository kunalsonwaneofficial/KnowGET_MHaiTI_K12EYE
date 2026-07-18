import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  GovernanceCalendarService,
  InMemoryCommitteeRepository,
  InMemoryGovernanceBodyRepository,
  InMemoryGovernanceCalendarRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { GovernanceCalendarController } from "./governance-calendar.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ADA = "33333333-3333-3333-3333-333333333333" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): GovernanceCalendarController {
  return new GovernanceCalendarController(
    new GovernanceCalendarService({
      repository: new InMemoryGovernanceCalendarRepository(),
      organizations: anyOrg,
      governanceBodies: new InMemoryGovernanceBodyRepository(),
      committees: new InMemoryCommitteeRepository(),
      persons: anyPerson,
    }),
  );
}

const meeting = {
  organizationId: ORG,
  type: "meeting",
  title: "Board Meeting",
  scheduledOn: "2030-03-01",
};

describe("GovernanceCalendarController", () => {
  it("schedules, reschedules and completes a calendar entry", async () => {
    const ctrl = controller();
    const entry = await ctrl.schedule(principal, meeting);
    expect(entry.status).toBe("scheduled");

    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);
    expect(await ctrl.upcoming(principal)).toHaveLength(1);
    expect((await ctrl.getById(principal, entry.id)).title).toBe("Board Meeting");

    const moved = await ctrl.reschedule(principal, entry.id, { scheduledOn: "2030-04-01" });
    expect(moved.scheduledOn).toBe("2030-04-01");

    const done = await ctrl.complete(principal, entry.id, {
      minutes: "Approved the budget.",
      attendeeIds: [ADA],
    });
    expect(done.status).toBe("completed");
    expect(done.attendeeIds).toEqual([ADA]);
  });

  it("cancels a calendar entry", async () => {
    const ctrl = controller();
    const entry = await ctrl.schedule(principal, meeting);
    expect((await ctrl.cancel(principal, entry.id)).status).toBe("cancelled");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(ctrl.schedule(principal, { ...meeting, type: "party" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
