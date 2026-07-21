import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateGuardianError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
} from "./errors";
import { GuardianService } from "./guardian-service";
import {
  InMemoryGuardianRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === PERSON };

function service(): { svc: GuardianService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new GuardianService({
    repository: new InMemoryGuardianRepository(),
    persons: personDir,
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const reg = () => ({ tenantId: TENANT, organizationId: ORG, personId: PERSON }) as const;

describe("GuardianService", () => {
  it("registers a guardian and publishes family.guardian.registered", async () => {
    const { svc, events } = service();
    const g = await svc.register(reg());
    expect(g.status).toBe("pending");
    expect(events.map((e) => e.type)).toEqual(["family.guardian.registered"]);
    expect(await svc.listForPerson(TENANT, PERSON)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("runs the verify flow through the service", async () => {
    const { svc } = service();
    const g = await svc.register(reg());
    await svc.submitForVerification(TENANT, g.id);
    const verified = await svc.verify(TENANT, g.id, "2026-03-01");
    expect(verified.verification).toBe("verified");
    expect(verified.status).toBe("active");
  });

  it("rejects an unknown organization, person, or a duplicate guardian", async () => {
    const { svc } = service();
    await expect(svc.register({ ...reg(), organizationId: UNKNOWN })).rejects.toBeInstanceOf(
      OrganizationNotFoundForFamilyError,
    );
    await expect(svc.register({ ...reg(), personId: UNKNOWN })).rejects.toBeInstanceOf(
      PersonNotFoundForFamilyError,
    );
    await svc.register(reg());
    await expect(svc.register(reg())).rejects.toBeInstanceOf(DuplicateGuardianError);
  });
});
