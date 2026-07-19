import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  ApplicantService,
  InMemoryApplicantRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ApplicantController } from "./applicant.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): ApplicantController {
  return new ApplicantController(
    new ApplicantService({
      repository: new InMemoryApplicantRepository(),
      persons: anyPerson,
      organizations: anyOrg,
    }),
  );
}

const application = { organizationId: ORG, personId: PERSON, requiredDocuments: ["transcript"] };

describe("ApplicantController", () => {
  it("starts, submits, reviews and approves an application", async () => {
    const ctrl = controller();
    const applicant = await ctrl.start(principal, application);
    expect(applicant.status).toBe("draft");
    expect(applicant.documents).toHaveLength(1);

    await ctrl.setDocumentStatus(principal, applicant.id, "transcript", { status: "verified" });
    await ctrl.submit(principal, applicant.id);
    await ctrl.beginReview(principal, applicant.id);
    const approved = await ctrl.approve(principal, applicant.id, { decidedById: STAFF });
    expect(approved.status).toBe("approved");
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.start(principal, { organizationId: ORG, personId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
