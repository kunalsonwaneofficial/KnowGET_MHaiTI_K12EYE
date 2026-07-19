import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { OrganizationNotFoundForLifecycleError, PersonNotFoundForLifecycleError } from "./errors";
import type { OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryProspectRepository } from "./ports";
import { ProspectService } from "./prospect-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === PERSON };

function service(): { svc: ProspectService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new ProspectService({
    repository: new InMemoryProspectRepository(),
    persons: personDir,
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const capture = () =>
  ({ tenantId: TENANT, organizationId: ORG, personId: PERSON, leadSource: "referral" }) as const;

describe("ProspectService", () => {
  it("captures an enquiry, publishes an event, and reads it back", async () => {
    const { svc, events } = service();
    const p = await svc.capture(capture());
    expect(p.status).toBe("new");
    expect(events.map((e) => e.type)).toEqual(["student.prospect.created"]);
    expect((await svc.getById(TENANT, p.id)).personId).toBe(PERSON);
    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("qualifies and converts a prospect, and records follow-ups", async () => {
    const { svc } = service();
    const p = await svc.capture(capture());
    await svc.recordFollowUp(TENANT, p.id, "Sent brochure");
    await svc.contact(TENANT, p.id);
    await svc.qualify(TENANT, p.id);
    const converted = await svc.convert(TENANT, p.id);
    expect(converted.status).toBe("converted");
    expect(converted.followUps).toHaveLength(1);
  });

  it("rejects an unknown organization or person", async () => {
    const { svc } = service();
    await expect(svc.capture({ ...capture(), organizationId: PERSON })).rejects.toBeInstanceOf(
      OrganizationNotFoundForLifecycleError,
    );
    await expect(svc.capture({ ...capture(), personId: ORG })).rejects.toBeInstanceOf(
      PersonNotFoundForLifecycleError,
    );
  });
});
