import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyTimelineSummaryError, StudentNotFoundError } from "./errors";
import { InMemoryStudentRepository, InMemoryTimelineRepository } from "./ports";
import { enrollStudent } from "./student";
import { TimelineService } from "./timeline-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function setup(): Promise<{ svc: TimelineService; studentId: Uuid }> {
  const students = new InMemoryStudentRepository();
  const student = enrollStudent({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    studentNumber: "S-1",
  });
  await students.save(student);
  const svc = new TimelineService({ repository: new InMemoryTimelineRepository(), students });
  return { svc, studentId: student.id };
}

describe("TimelineService", () => {
  it("records immutable entries and returns them chronologically", async () => {
    const { svc, studentId } = await setup();
    await svc.record({
      tenantId: TENANT,
      studentId,
      organizationId: ORG,
      type: "promotion",
      summary: "Promoted to grade 2",
      occurredOn: "2031-04-01",
    });
    await svc.record({
      tenantId: TENANT,
      studentId,
      organizationId: ORG,
      type: "admission",
      summary: "Admitted",
      occurredOn: "2030-06-01",
    });

    const timeline = await svc.listForStudent(TENANT, studentId);
    expect(timeline.map((e) => e.summary)).toEqual(["Admitted", "Promoted to grade 2"]);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(2);
  });

  it("rejects an empty summary and an unknown student", async () => {
    const { svc, studentId } = await setup();
    await expect(
      svc.record({ tenantId: TENANT, studentId, organizationId: ORG, type: "note", summary: "  " }),
    ).rejects.toBeInstanceOf(EmptyTimelineSummaryError);
    await expect(
      svc.record({
        tenantId: TENANT,
        studentId: ORG,
        organizationId: ORG,
        type: "note",
        summary: "x",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });
});
