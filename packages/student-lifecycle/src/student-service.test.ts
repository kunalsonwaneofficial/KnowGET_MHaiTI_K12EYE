import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateEnrollmentError,
  DuplicateStudentNumberError,
  MembershipNotFoundForLifecycleError,
} from "./errors";
import type { MembershipDirectory, OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryStudentRepository } from "./ports";
import { StudentService } from "./student-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const MEMBERSHIP = "44444444-4444-4444-4444-444444444444" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === PERSON };
const membershipDir: MembershipDirectory = { exists: async (_t, id) => id === MEMBERSHIP };

function service(): { svc: StudentService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new StudentService({
    repository: new InMemoryStudentRepository(),
    persons: personDir,
    organizations: orgDir,
    memberships: membershipDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const enroll = (studentNumber = "S-1") =>
  ({ tenantId: TENANT, organizationId: ORG, personId: PERSON, studentNumber }) as const;

describe("StudentService", () => {
  it("enrolls a learner and runs the lifecycle, publishing events", async () => {
    const { svc, events } = service();
    const s = await svc.enroll({ ...enroll(), membershipId: MEMBERSHIP });
    expect(s.enrollmentStatus).toBe("enrolled");

    await svc.activate(TENANT, s.id);
    await svc.promote(TENANT, s.id, { academicYear: "2031" });
    await svc.graduate(TENANT, s.id);
    const alumni = await svc.becomeAlumni(TENANT, s.id);
    expect(alumni.enrollmentStatus).toBe("alumni");

    expect(events.map((e) => e.type)).toEqual([
      "student.enrolled",
      "student.promoted",
      "student.graduated",
      "student.became_alumni",
    ]);
    expect((await svc.getByStudentNumber(TENANT, "S-1")).personId).toBe(PERSON);
    expect(await svc.listForPerson(TENANT, PERSON)).toHaveLength(1);
  });

  it("enforces a unique student number and one active enrollment per institution", async () => {
    const { svc } = service();
    await svc.enroll(enroll("DUP"));
    await expect(svc.enroll(enroll("DUP"))).rejects.toBeInstanceOf(DuplicateStudentNumberError);
    await expect(svc.enroll(enroll("OTHER"))).rejects.toBeInstanceOf(DuplicateEnrollmentError);
  });

  it("rejects an unknown membership link", async () => {
    const { svc } = service();
    await expect(svc.enroll({ ...enroll(), membershipId: ORG })).rejects.toBeInstanceOf(
      MembershipNotFoundForLifecycleError,
    );
  });
});
