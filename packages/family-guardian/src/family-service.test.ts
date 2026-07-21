import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateFamilyNumberError,
  HouseholdMemberNotFoundError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
} from "./errors";
import { FamilyService } from "./family-service";
import {
  InMemoryFamilyRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const P1 = "33333333-3333-3333-3333-333333333333" as Uuid;
const P2 = "44444444-4444-4444-4444-444444444444" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === P1 || id === P2 };

function service(): { svc: FamilyService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new FamilyService({
    repository: new InMemoryFamilyRepository(),
    persons: personDir,
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const reg = (familyNumber = "FAM-1") =>
  ({ tenantId: TENANT, organizationId: ORG, familyNumber, name: "The Rao Family" }) as const;

describe("FamilyService", () => {
  it("registers a family and publishes family.registered", async () => {
    const { svc, events } = service();
    const f = await svc.register({ ...reg(), members: [{ personId: P1, role: "parent" }] });
    expect(f.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual(["family.registered"]);
    expect(await svc.getByFamilyNumber(TENANT, "FAM-1")).toMatchObject({ id: f.id });
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown organization, member or duplicate family number", async () => {
    const { svc } = service();
    await expect(svc.register({ ...reg(), organizationId: UNKNOWN })).rejects.toBeInstanceOf(
      OrganizationNotFoundForFamilyError,
    );
    await expect(
      svc.register({ ...reg(), members: [{ personId: UNKNOWN, role: "parent" }] }),
    ).rejects.toBeInstanceOf(PersonNotFoundForFamilyError);
    await svc.register(reg());
    await expect(svc.register(reg())).rejects.toBeInstanceOf(DuplicateFamilyNumberError);
  });

  it("validates the person when adding a member", async () => {
    const { svc } = service();
    const f = await svc.register(reg());
    await expect(
      svc.addMember(TENANT, f.id, { personId: UNKNOWN, role: "child" }),
    ).rejects.toBeInstanceOf(PersonNotFoundForFamilyError);
    const updated = await svc.addMember(TENANT, f.id, { personId: P1, role: "parent" });
    expect(updated.members).toHaveLength(1);
  });

  it("merges one household into another, folding members and closing the source", async () => {
    const { svc } = service();
    const target = await svc.register({
      ...reg("FAM-T"),
      members: [{ personId: P1, role: "parent" }],
    });
    const source = await svc.register({
      ...reg("FAM-S"),
      members: [{ personId: P2, role: "parent" }],
    });
    const merged = await svc.merge(TENANT, source.id, target.id);
    expect(merged.members.map((m) => m.personId).sort()).toEqual([P1, P2].sort());
    const closed = await svc.getById(TENANT, source.id);
    expect(closed.status).toBe("merged");
    expect(closed.mergedIntoFamilyId).toBe(target.id);
  });

  it("splits members off into a new household", async () => {
    const { svc } = service();
    const source = await svc.register({
      ...reg("FAM-1"),
      members: [
        { personId: P1, role: "parent" },
        { personId: P2, role: "child" },
      ],
    });
    const withPrimary = await svc.setPrimaryContact(TENANT, source.id, P2);
    expect(withPrimary.primaryContactPersonId).toBe(P2);
    const { source: remaining, created } = await svc.split(TENANT, source.id, {
      newFamilyNumber: "FAM-2",
      name: "New Household",
      memberPersonIds: [P2],
    });
    expect(created.members.map((m) => m.personId)).toEqual([P2]);
    expect(created.primaryContactPersonId).toBe(P2);
    expect(remaining.members.map((m) => m.personId)).toEqual([P1]);
    expect(remaining.primaryContactPersonId).toBeNull();
    expect(remaining.status).toBe("active");
    await expect(
      svc.split(TENANT, remaining.id, {
        newFamilyNumber: "FAM-3",
        name: "x",
        memberPersonIds: [UNKNOWN],
      }),
    ).rejects.toBeInstanceOf(HouseholdMemberNotFoundError);
  });
});
