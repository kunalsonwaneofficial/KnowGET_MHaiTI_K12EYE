import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  InMemoryProspectRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  ProspectService,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ProspectController } from "./prospect.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): ProspectController {
  return new ProspectController(
    new ProspectService({
      repository: new InMemoryProspectRepository(),
      persons: anyPerson,
      organizations: anyOrg,
    }),
  );
}

const enquiry = { organizationId: ORG, personId: PERSON, leadSource: "website" };

describe("ProspectController", () => {
  it("captures an enquiry, qualifies and converts it", async () => {
    const ctrl = controller();
    const prospect = await ctrl.capture(principal, enquiry);
    expect(prospect.status).toBe("new");
    expect((await ctrl.getById(principal, prospect.id)).personId).toBe(PERSON);
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);

    await ctrl.recordFollowUp(principal, prospect.id, { note: "Called" });
    await ctrl.contact(principal, prospect.id);
    await ctrl.qualify(principal, prospect.id);
    expect((await ctrl.convert(principal, prospect.id)).status).toBe("converted");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.capture(principal, { organizationId: ORG, personId: PERSON, leadSource: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
