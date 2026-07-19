import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  InMemoryStudentRepository,
  type MembershipDirectory,
  type OrganizationDirectory,
  type PersonDirectory,
  StudentService,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { StudentController } from "./student.controller";

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
const anyMembership: MembershipDirectory = { exists: async () => true };

function controller(): StudentController {
  return new StudentController(
    new StudentService({
      repository: new InMemoryStudentRepository(),
      persons: anyPerson,
      organizations: anyOrg,
      memberships: anyMembership,
    }),
  );
}

const enrollment = { organizationId: ORG, personId: PERSON, studentNumber: "S-2030-001" };

describe("StudentController", () => {
  it("enrolls a student and runs the lifecycle to alumni", async () => {
    const ctrl = controller();
    const student = await ctrl.enroll(principal, enrollment);
    expect(student.enrollmentStatus).toBe("enrolled");

    await ctrl.activate(principal, student.id);
    await ctrl.promote(principal, student.id, { academicYear: "2031" });
    await ctrl.graduate(principal, student.id, {});
    expect((await ctrl.becomeAlumni(principal, student.id)).enrollmentStatus).toBe("alumni");

    expect((await ctrl.getByStudentNumber(principal, "S-2030-001")).personId).toBe(PERSON);
    expect(await ctrl.listForPerson(principal, PERSON)).toHaveLength(1);
  });

  it("places a hold and rejects an invalid body or missing tenant", async () => {
    const ctrl = controller();
    const student = await ctrl.enroll(principal, enrollment);
    expect(
      (await ctrl.setAdministrativeStatus(principal, student.id, { status: "hold" }))
        .administrativeStatus,
    ).toBe("hold");
    await expect(
      ctrl.enroll(principal, { organizationId: ORG, personId: PERSON, studentNumber: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
