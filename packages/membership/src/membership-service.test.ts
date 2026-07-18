import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateMembershipError,
  MembershipNotFoundError,
  OrganizationNotFoundForMembershipError,
  PersonNotFoundForMembershipError,
} from "./errors";
import { MembershipService } from "./membership-service";
import {
  InMemoryMembershipRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const SCHOOL = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION = "44444444-4444-4444-4444-444444444444" as Uuid;
const GHOST = "99999999-9999-9999-9999-999999999999" as Uuid;

/** Directory that knows a fixed set of tenant-scoped ids. */
class FakeDirectory implements PersonDirectory, OrganizationDirectory {
  private readonly known = new Set<string>();
  constructor(entries: ReadonlyArray<[TenantId, Uuid]>) {
    for (const [tenant, id] of entries) {
      this.known.add(`${tenant}:${id}`);
    }
  }
  async exists(tenantId: TenantId, id: Uuid): Promise<boolean> {
    return this.known.has(`${tenantId}:${id}`);
  }
}

function build(): { service: MembershipService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const directory = new FakeDirectory([
    [TENANT_A, ADA],
    [TENANT_A, SCHOOL],
    [TENANT_A, SECTION],
  ]);
  const service = new MembershipService({
    repository: new InMemoryMembershipRepository(),
    persons: directory,
    organizations: directory,
    events: { publish: async (event: DomainEvent) => void events.push(event) },
  });
  return { service, events };
}

describe("MembershipService — grant", () => {
  let service: MembershipService;
  let events: DomainEvent[];
  beforeEach(() => {
    ({ service, events } = build());
  });

  it("grants a membership when person and organization exist", async () => {
    const membership = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    expect(membership.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("membership.granted");
  });

  it("refuses a person or organization that does not exist in the tenant", async () => {
    await expect(
      service.grant({ tenantId: TENANT_A, personId: GHOST, organizationId: SCHOOL, roles: ["x"] }),
    ).rejects.toBeInstanceOf(PersonNotFoundForMembershipError);
    await expect(
      service.grant({ tenantId: TENANT_A, personId: ADA, organizationId: GHOST, roles: ["x"] }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForMembershipError);
  });

  it("enforces one active membership per person per organization", async () => {
    await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    await expect(
      service.grant({
        tenantId: TENANT_A,
        personId: ADA,
        organizationId: SCHOOL,
        roles: ["principal"],
      }),
    ).rejects.toBeInstanceOf(DuplicateMembershipError);
  });

  it("allows a fresh membership after the previous one has ended", async () => {
    const first = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    await service.end(TENANT_A, first.id);
    await expect(
      service.grant({
        tenantId: TENANT_A,
        personId: ADA,
        organizationId: SCHOOL,
        roles: ["teacher"],
      }),
    ).resolves.toBeDefined();
  });

  it("does not see another tenant's membership", async () => {
    const membership = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    await expect(service.getById(TENANT_B, membership.id)).rejects.toBeInstanceOf(
      MembershipNotFoundError,
    );
  });
});

describe("MembershipService — lifecycle & role resolution", () => {
  let service: MembershipService;
  beforeEach(() => {
    ({ service } = build());
  });

  it("lists by person and organization and changes roles", async () => {
    const membership = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    expect(await service.listByPerson(TENANT_A, ADA)).toHaveLength(1);
    expect(await service.listByOrganization(TENANT_A, SCHOOL)).toHaveLength(1);
    const updated = await service.changeRoles(TENANT_A, membership.id, ["teacher", "coordinator"]);
    expect(updated.roles).toEqual(["teacher", "coordinator"]);
  });

  it("unions active role names for a person and excludes suspended/ended", async () => {
    await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher", "coordinator"],
    });
    const section = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SECTION,
      roles: ["form-tutor"],
    });
    expect((await service.activeRoleNamesForPerson(TENANT_A, ADA)).sort()).toEqual([
      "coordinator",
      "form-tutor",
      "teacher",
    ]);

    await service.suspend(TENANT_A, section.id);
    expect((await service.activeRoleNamesForPerson(TENANT_A, ADA)).sort()).toEqual([
      "coordinator",
      "teacher",
    ]);
  });

  it("suspends, reinstates and ends", async () => {
    const membership = await service.grant({
      tenantId: TENANT_A,
      personId: ADA,
      organizationId: SCHOOL,
      roles: ["teacher"],
    });
    expect((await service.suspend(TENANT_A, membership.id)).status).toBe("suspended");
    expect((await service.reinstate(TENANT_A, membership.id)).status).toBe("active");
    expect((await service.end(TENANT_A, membership.id, "2027-03-31")).status).toBe("ended");
  });
});
