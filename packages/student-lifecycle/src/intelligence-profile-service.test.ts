import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateProfileError, StudentNotFoundError } from "./errors";
import { IntelligenceProfileService } from "./intelligence-profile-service";
import { InMemoryIntelligenceProfileRepository, InMemoryStudentRepository } from "./ports";
import { enrollStudent } from "./student";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function setup(): Promise<{ svc: IntelligenceProfileService; studentId: Uuid }> {
  const students = new InMemoryStudentRepository();
  const student = enrollStudent({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    studentNumber: "S-1",
  });
  await students.save(student);
  const svc = new IntelligenceProfileService({
    repository: new InMemoryIntelligenceProfileRepository(),
    students,
  });
  return { svc, studentId: student.id };
}

describe("IntelligenceProfileService", () => {
  it("creates a profile, updates indicators and records interventions", async () => {
    const { svc, studentId } = await setup();
    const profile = await svc.create({ tenantId: TENANT, studentId, organizationId: ORG });
    expect(profile.indicators.academicRisk).toBeNull();

    const updated = await svc.updateIndicators(TENANT, profile.id, {
      academicRisk: "high",
      attendanceTrend: "declining",
    });
    expect(updated.indicators.academicRisk).toBe("high");
    expect(updated.indicators.attendanceTrend).toBe("declining");

    const withIntervention = await svc.recordIntervention(TENANT, profile.id, {
      kind: "counselling",
      note: "Met with counsellor",
    });
    expect(withIntervention.interventions).toHaveLength(1);

    await expect(
      svc.create({ tenantId: TENANT, studentId, organizationId: ORG }),
    ).rejects.toBeInstanceOf(DuplicateProfileError);
  });

  it("rejects a profile for an unknown student", async () => {
    const { svc } = await setup();
    await expect(
      svc.create({ tenantId: TENANT, studentId: ORG, organizationId: ORG }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });
});
