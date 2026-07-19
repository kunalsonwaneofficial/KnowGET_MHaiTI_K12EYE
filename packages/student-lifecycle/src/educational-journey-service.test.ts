import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EducationalJourneyService } from "./educational-journey-service";
import { DuplicateJourneyError, StudentNotFoundError } from "./errors";
import { InMemoryEducationalJourneyRepository, InMemoryStudentRepository } from "./ports";
import { enrollStudent } from "./student";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function setup(): Promise<{ svc: EducationalJourneyService; studentId: Uuid }> {
  const students = new InMemoryStudentRepository();
  const student = enrollStudent({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    studentNumber: "S-1",
  });
  await students.save(student);
  const svc = new EducationalJourneyService({
    repository: new InMemoryEducationalJourneyRepository(),
    students,
  });
  return { svc, studentId: student.id };
}

describe("EducationalJourneyService", () => {
  it("opens one journey per student and appends progression", async () => {
    const { svc, studentId } = await setup();
    const journey = await svc.start({ tenantId: TENANT, studentId, organizationId: ORG });
    expect(journey.entries).toHaveLength(0);

    const updated = await svc.record(TENANT, journey.id, {
      type: "promotion",
      fromGrade: "1",
      toGrade: "2",
      academicYear: "2031",
    });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0]?.type).toBe("promotion");
    expect(await svc.getForStudent(TENANT, studentId)).not.toBeNull();

    await expect(
      svc.start({ tenantId: TENANT, studentId, organizationId: ORG }),
    ).rejects.toBeInstanceOf(DuplicateJourneyError);
  });

  it("rejects a journey for an unknown student", async () => {
    const { svc } = await setup();
    await expect(
      svc.start({ tenantId: TENANT, studentId: ORG, organizationId: ORG }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });
});
