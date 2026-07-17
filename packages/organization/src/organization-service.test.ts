import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CircularHierarchyError,
  DuplicateOrganizationCodeError,
  OrganizationNotFoundError,
} from "./errors";
import { InMemoryOrganizationRepository } from "./organization-repository";
import { OrganizationService } from "./organization-service";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "22222222-2222-2222-2222-222222222222" as TenantId;

function setup(): { service: OrganizationService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const service = new OrganizationService(new InMemoryOrganizationRepository(), {
    publish: async (event) => {
      events.push(event);
    },
  });
  return { service, events };
}

describe("OrganizationService.create", () => {
  it("creates an organization and publishes an event", async () => {
    const { service, events } = setup();
    const created = await service.create({
      tenantId: TENANT_A,
      type: "school",
      name: "Central",
      code: "CEN",
    });
    expect(created.status).toBe("draft");
    expect(events.map((e) => e.type)).toEqual(["organization.created"]);
    expect(events[0]?.metadata.tenantId).toBe(TENANT_A);
  });

  it("rejects a duplicate code within the tenant", async () => {
    const { service } = setup();
    await service.create({ tenantId: TENANT_A, type: "school", name: "A", code: "DUP" });
    await expect(
      service.create({ tenantId: TENANT_A, type: "school", name: "B", code: "DUP" }),
    ).rejects.toBeInstanceOf(DuplicateOrganizationCodeError);
  });

  it("allows the same code in a different tenant", async () => {
    const { service } = setup();
    await service.create({ tenantId: TENANT_A, type: "school", name: "A", code: "SAME" });
    await expect(
      service.create({ tenantId: TENANT_B, type: "school", name: "B", code: "SAME" }),
    ).resolves.toBeDefined();
  });

  it("requires an existing parent in the same tenant", async () => {
    const { service } = setup();
    await expect(
      service.create({
        tenantId: TENANT_A,
        type: "campus",
        name: "C",
        code: "C",
        parentId: "33333333-3333-3333-3333-333333333333" as Uuid,
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });
});

describe("OrganizationService hierarchy & lifecycle", () => {
  it("moves an organization and prevents cycles", async () => {
    const { service } = setup();
    const root = await service.create({
      tenantId: TENANT_A,
      type: "trust",
      name: "Root",
      code: "R",
    });
    const child = await service.create({
      tenantId: TENANT_A,
      type: "school",
      name: "Child",
      code: "CH",
      parentId: root.id,
    });
    // Moving root under its own child would create a cycle.
    await expect(service.move(TENANT_A, root.id, child.id)).rejects.toBeInstanceOf(
      CircularHierarchyError,
    );
    // Moving the child to a root position is fine.
    const moved = await service.move(TENANT_A, child.id, null);
    expect(moved.parentId).toBeNull();
  });

  it("builds a tenant-scoped tree", async () => {
    const { service } = setup();
    const root = await service.create({
      tenantId: TENANT_A,
      type: "trust",
      name: "Root",
      code: "R",
    });
    await service.create({
      tenantId: TENANT_A,
      type: "school",
      name: "S",
      code: "S",
      parentId: root.id,
    });
    await service.create({ tenantId: TENANT_B, type: "trust", name: "Other", code: "O" });

    const tree = await service.tree(TENANT_A);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(1);
  });

  it("transitions status and publishes the change", async () => {
    const { service, events } = setup();
    const created = await service.create({
      tenantId: TENANT_A,
      type: "school",
      name: "S",
      code: "S",
    });
    await service.setStatus(TENANT_A, created.id, "active");
    const statusEvent = events.find((e) => e.type === "organization.status_changed");
    expect(statusEvent?.payload).toMatchObject({ from: "draft", to: "active" });
  });
});

describe("OrganizationService tenant isolation", () => {
  it("does not expose another tenant's organization", async () => {
    const { service } = setup();
    const created = await service.create({
      tenantId: TENANT_A,
      type: "school",
      name: "A",
      code: "A",
    });
    await expect(service.getById(TENANT_B, created.id)).rejects.toBeInstanceOf(
      OrganizationNotFoundError,
    );
  });
});
