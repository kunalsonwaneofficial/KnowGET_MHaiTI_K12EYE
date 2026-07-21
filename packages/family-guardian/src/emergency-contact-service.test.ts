import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmergencyContactService } from "./emergency-contact-service";
import {
  DuplicateEmergencyPriorityError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
  StudentNotFoundForFamilyError,
} from "./errors";
import {
  InMemoryEmergencyContactRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const P1 = "44444444-4444-4444-4444-444444444444" as Uuid;
const P2 = "55555555-5555-5555-5555-555555555555" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === P1 || id === P2 };
const studentDir: StudentDirectory = { exists: async (_t, id) => id === STUDENT };

function service(): { svc: EmergencyContactService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new EmergencyContactService({
    repository: new InMemoryEmergencyContactRepository(),
    persons: personDir,
    organizations: orgDir,
    students: studentDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const reg = (personId: Uuid, priority: number) =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    personId,
    priority,
    relationshipLabel: "Contact",
  }) as const;

describe("EmergencyContactService", () => {
  it("registers contacts, lists them in priority order and publishes updates", async () => {
    const { svc, events } = service();
    await svc.register(reg(P1, 2));
    await svc.register(reg(P2, 1));
    const ordered = await svc.listForStudent(TENANT, STUDENT);
    expect(ordered.map((c) => c.priority)).toEqual([1, 2]);
    expect(events.map((e) => e.type)).toEqual([
      "family.emergency_contact.updated",
      "family.emergency_contact.updated",
    ]);
  });

  it("enforces a unique priority per student but lets a contact keep its own", async () => {
    const { svc } = service();
    const first = await svc.register(reg(P1, 1));
    await expect(svc.register(reg(P2, 1))).rejects.toBeInstanceOf(DuplicateEmergencyPriorityError);
    await expect(svc.setPriority(TENANT, first.id, 1)).resolves.toMatchObject({ priority: 1 });
    await svc.register(reg(P2, 2));
    await expect(svc.setPriority(TENANT, first.id, 2)).rejects.toBeInstanceOf(
      DuplicateEmergencyPriorityError,
    );
  });

  it("emits an update when authorizations change", async () => {
    const { svc, events } = service();
    const c = await svc.register(reg(P1, 1));
    await svc.setAuthorizations(TENANT, c.id, { pickup: true, medical: true });
    expect(events.filter((e) => e.type === "family.emergency_contact.updated")).toHaveLength(2);
  });

  it("rejects an unknown organization, person or student", async () => {
    const { svc } = service();
    await expect(svc.register({ ...reg(P1, 1), organizationId: UNKNOWN })).rejects.toBeInstanceOf(
      OrganizationNotFoundForFamilyError,
    );
    await expect(svc.register(reg(UNKNOWN, 1))).rejects.toBeInstanceOf(
      PersonNotFoundForFamilyError,
    );
    await expect(svc.register({ ...reg(P1, 1), studentId: UNKNOWN })).rejects.toBeInstanceOf(
      StudentNotFoundForFamilyError,
    );
  });
});
