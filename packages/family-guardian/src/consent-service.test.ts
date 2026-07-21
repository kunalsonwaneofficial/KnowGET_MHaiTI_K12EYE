import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ConsentService } from "./consent-service";
import {
  ConsentAlreadyWithdrawnError,
  GuardianNotFoundError,
  NoConsentToWithdrawError,
  PolicyNotFoundForConsentError,
  StudentNotFoundForFamilyError,
} from "./errors";
import { registerGuardian } from "./guardian";
import {
  InMemoryConsentRepository,
  InMemoryGuardianRepository,
  type PolicyDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const PERSON = "44444444-4444-4444-4444-444444444444" as Uuid;
const POLICY = "66666666-6666-6666-6666-666666666666" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const studentDir: StudentDirectory = { exists: async (_t, id) => id === STUDENT };
const policyDir: PolicyDirectory = { exists: async (_t, id) => id === POLICY };

async function setup(): Promise<{
  svc: ConsentService;
  guardianId: Uuid;
  events: DomainEvent[];
}> {
  const guardianRepo = new InMemoryGuardianRepository();
  const guardian = registerGuardian({ tenantId: TENANT, organizationId: ORG, personId: PERSON });
  await guardianRepo.save(guardian);
  const events: DomainEvent[] = [];
  const svc = new ConsentService({
    repository: new InMemoryConsentRepository(),
    guardians: guardianRepo,
    students: studentDir,
    policies: policyDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, guardianId: guardian.id, events };
}

describe("ConsentService", () => {
  it("grants and withdraws with monotonic versions, deriving org and publishing events", async () => {
    const { svc, guardianId, events } = await setup();
    const v1 = await svc.grant({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "medical",
    });
    expect(v1.version).toBe(1);
    expect(v1.organizationId).toBe(ORG);
    const v2 = await svc.withdraw({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "medical",
    });
    expect(v2.version).toBe(2);
    expect(v2.decision).toBe("withdrawn");
    const v3 = await svc.grant({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "medical",
    });
    expect(v3.version).toBe(3);
    expect(events.map((e) => e.type)).toEqual([
      "family.consent.granted",
      "family.consent.withdrawn",
      "family.consent.granted",
    ]);
    expect(await svc.history(TENANT, STUDENT, "medical")).toHaveLength(3);
  });

  it("verifies current standing across grant and withdrawal", async () => {
    const { svc, guardianId } = await setup();
    expect((await svc.verify(TENANT, STUDENT, "media")).active).toBe(false);
    await svc.grant({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "media",
      effectiveOn: "2026-01-01",
    });
    expect((await svc.verify(TENANT, STUDENT, "media", "2026-06-01")).active).toBe(true);
    await svc.withdraw({ tenantId: TENANT, studentId: STUDENT, guardianId, consentType: "media" });
    expect((await svc.verify(TENANT, STUDENT, "media", "2026-06-01")).active).toBe(false);
  });

  it("rejects withdrawing when nothing is granted or it is already withdrawn", async () => {
    const { svc, guardianId } = await setup();
    await expect(
      svc.withdraw({ tenantId: TENANT, studentId: STUDENT, guardianId, consentType: "academic" }),
    ).rejects.toBeInstanceOf(NoConsentToWithdrawError);
    await svc.grant({ tenantId: TENANT, studentId: STUDENT, guardianId, consentType: "academic" });
    await svc.withdraw({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "academic",
    });
    await expect(
      svc.withdraw({ tenantId: TENANT, studentId: STUDENT, guardianId, consentType: "academic" }),
    ).rejects.toBeInstanceOf(ConsentAlreadyWithdrawnError);
  });

  it("validates the guardian, the student and any linked policy", async () => {
    const { svc, guardianId } = await setup();
    await expect(
      svc.grant({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId: UNKNOWN,
        consentType: "medical",
      }),
    ).rejects.toBeInstanceOf(GuardianNotFoundError);
    await expect(
      svc.grant({ tenantId: TENANT, studentId: UNKNOWN, guardianId, consentType: "medical" }),
    ).rejects.toBeInstanceOf(StudentNotFoundForFamilyError);
    await expect(
      svc.grant({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId,
        consentType: "medical",
        policyId: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(PolicyNotFoundForConsentError);
    const linked = await svc.grant({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      consentType: "medical",
      policyId: POLICY,
    });
    expect(linked.policyId).toBe(POLICY);
  });
});
