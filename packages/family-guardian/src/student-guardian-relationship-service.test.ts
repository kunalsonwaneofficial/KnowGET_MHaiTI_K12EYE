import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CustodyValidationError,
  DuplicateRelationshipError,
  GuardianArchivedError,
  GuardianNotFoundError,
  StudentNotFoundForFamilyError,
} from "./errors";
import { archiveGuardian, registerGuardian } from "./guardian";
import {
  InMemoryGuardianRepository,
  InMemoryStudentGuardianRelationshipRepository,
  type StudentDirectory,
} from "./ports";
import { StudentGuardianRelationshipService } from "./student-guardian-relationship-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const PERSON = "44444444-4444-4444-4444-444444444444" as Uuid;
const PERSON2 = "55555555-5555-5555-5555-555555555555" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const studentDir: StudentDirectory = { exists: async (_t, id) => id === STUDENT };

interface Harness {
  readonly svc: StudentGuardianRelationshipService;
  readonly guardianRepo: InMemoryGuardianRepository;
  readonly guardianId: Uuid;
  readonly events: DomainEvent[];
}

async function setup(
  opts: { legalAuthority?: boolean; archived?: boolean } = {},
): Promise<Harness> {
  const guardianRepo = new InMemoryGuardianRepository();
  const events: DomainEvent[] = [];
  let guardian = registerGuardian({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    legalAuthority: opts.legalAuthority ? "legal_guardian" : "none",
  });
  if (opts.archived) {
    guardian = archiveGuardian(guardian);
  }
  await guardianRepo.save(guardian);
  const svc = new StudentGuardianRelationshipService({
    repository: new InMemoryStudentGuardianRelationshipRepository(),
    guardians: guardianRepo,
    students: studentDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, guardianRepo, guardianId: guardian.id, events };
}

describe("StudentGuardianRelationshipService", () => {
  it("links a guardian to a student, deriving the org and publishing guardian.assigned", async () => {
    const { svc, guardianId, events } = await setup();
    const r = await svc.link({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      relationshipType: "biological_parent",
    });
    expect(r.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["family.guardian.assigned"]);
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(1);
    expect(await svc.listForGuardian(TENANT, guardianId)).toHaveLength(1);
  });

  it("enforces custody validation: legal responsibility needs a guardian with legal authority", async () => {
    const withoutAuthority = await setup({ legalAuthority: false });
    await expect(
      withoutAuthority.svc.link({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId: withoutAuthority.guardianId,
        relationshipType: "legal_guardian",
        responsibilities: { legal: true },
      }),
    ).rejects.toBeInstanceOf(CustodyValidationError);

    const withAuthority = await setup({ legalAuthority: true });
    const r = await withAuthority.svc.link({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId: withAuthority.guardianId,
      relationshipType: "legal_guardian",
      responsibilities: { legal: true },
    });
    expect(r.responsibilities.legal).toBe(true);
    await expect(
      withAuthority.svc.updateResponsibilities(TENANT, r.id, { legal: true }),
    ).resolves.toMatchObject({ id: r.id });
  });

  it("rejects an unknown student, an unknown or archived guardian, and a duplicate active link", async () => {
    const { svc, guardianId } = await setup();
    await expect(
      svc.link({ tenantId: TENANT, studentId: UNKNOWN, guardianId, relationshipType: "other" }),
    ).rejects.toBeInstanceOf(StudentNotFoundForFamilyError);
    await expect(
      svc.link({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId: UNKNOWN,
        relationshipType: "other",
      }),
    ).rejects.toBeInstanceOf(GuardianNotFoundError);
    await svc.link({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      relationshipType: "biological_parent",
    });
    await expect(
      svc.link({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId,
        relationshipType: "biological_parent",
      }),
    ).rejects.toBeInstanceOf(DuplicateRelationshipError);

    const archived = await setup({ archived: true });
    await expect(
      archived.svc.link({
        tenantId: TENANT,
        studentId: STUDENT,
        guardianId: archived.guardianId,
        relationshipType: "other",
      }),
    ).rejects.toBeInstanceOf(GuardianArchivedError);
  });

  it("supports many guardians per student and emits pickup + removed events", async () => {
    const { svc, guardianRepo, guardianId, events } = await setup();
    const guardian2 = registerGuardian({
      tenantId: TENANT,
      organizationId: ORG,
      personId: PERSON2,
    });
    await guardianRepo.save(guardian2);

    const first = await svc.link({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId,
      relationshipType: "biological_parent",
    });
    await svc.link({
      tenantId: TENANT,
      studentId: STUDENT,
      guardianId: guardian2.id,
      relationshipType: "grandparent",
    });
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(2);

    await svc.setPickupAuthorization(TENANT, first.id, true);
    await svc.end(TENANT, first.id, "2026-06-30");
    expect(events.map((e) => e.type)).toEqual([
      "family.guardian.assigned",
      "family.guardian.assigned",
      "family.pickup_authorization.changed",
      "family.guardian.removed",
    ]);
  });
});
