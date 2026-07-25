import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DepartmentService } from "./department-service";
import {
  CrossOrganizationDepartmentError,
  DepartmentHierarchyError,
  DuplicateDepartmentCodeError,
  OrganizationNotFoundForWorkforceError,
} from "./errors";
import { InMemoryDepartmentRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const OTHER_ORG = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = {
  exists: async (_t, id) => id === ORG || id === OTHER_ORG,
};

function service(): { svc: DepartmentService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new DepartmentService({
    repository: new InMemoryDepartmentRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const create = (code = "MATH", name = "Mathematics") =>
  ({ tenantId: TENANT, organizationId: ORG, code, name }) as const;

describe("DepartmentService", () => {
  it("creates a department, enforces a unique code, and publishes an event", async () => {
    const { svc, events } = service();
    const dept = await svc.create(create());
    expect(dept.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual(["workforce.department.created"]);
    await expect(svc.create(create("MATH", "Maths 2"))).rejects.toBeInstanceOf(
      DuplicateDepartmentCodeError,
    );
    expect((await svc.getByCode(TENANT, "MATH")).id).toBe(dept.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...create(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForWorkforceError);
  });

  it("validates the parent exists and shares the organization", async () => {
    const { svc } = service();
    const parent = await svc.create(create("SCI", "Science"));
    const child = await svc.create({ ...create("PHY", "Physics"), parentDepartmentId: parent.id });
    expect(child.parentDepartmentId).toBe(parent.id);

    // parent in a different organization is rejected
    const foreign = await svc.create({ ...create("BIO", "Biology"), organizationId: OTHER_ORG });
    await expect(
      svc.create({ ...create("CHE", "Chemistry"), parentDepartmentId: foreign.id }),
    ).rejects.toBeInstanceOf(CrossOrganizationDepartmentError);
  });

  it("rejects a reparent that would form a cycle", async () => {
    const { svc } = service();
    const a = await svc.create(create("A", "A"));
    const b = await svc.create({ ...create("B", "B"), parentDepartmentId: a.id });
    // making A a child of B (its own descendant) forms a cycle
    await expect(svc.reparent(TENANT, a.id, b.id)).rejects.toBeInstanceOf(DepartmentHierarchyError);
    // a department cannot be its own parent
    await expect(svc.reparent(TENANT, a.id, a.id)).rejects.toBeInstanceOf(DepartmentHierarchyError);
  });

  it("archives and reactivates a department, publishing the archive event", async () => {
    const { svc, events } = service();
    const dept = await svc.create(create());
    await svc.archive(TENANT, dept.id);
    expect(events.map((e) => e.type)).toContain("workforce.department.archived");
    const back = await svc.reactivate(TENANT, dept.id);
    expect(back.status).toBe("active");
  });
});
