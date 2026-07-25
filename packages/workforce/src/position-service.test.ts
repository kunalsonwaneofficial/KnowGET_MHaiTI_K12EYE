import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { archiveDepartment, createDepartment, type Department } from "./department";
import {
  DepartmentNotActiveError,
  DepartmentNotFoundError,
  DuplicatePositionCodeError,
} from "./errors";
import { InMemoryDepartmentRepository, InMemoryPositionRepository } from "./ports";
import { PositionService } from "./position-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

async function harness(seed: Department[] = []): Promise<{
  svc: PositionService;
  departments: InMemoryDepartmentRepository;
  events: DomainEvent[];
}> {
  const departments = new InMemoryDepartmentRepository();
  for (const d of seed) {
    await departments.save(d);
  }
  const events: DomainEvent[] = [];
  const svc = new PositionService({
    repository: new InMemoryPositionRepository(),
    departments,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, departments, events };
}

const dept = (): Department =>
  createDepartment({ tenantId: TENANT, organizationId: ORG, code: "MATH", name: "Mathematics" });

const create = (departmentId: Uuid, code = "TEACH-MATH") =>
  ({
    tenantId: TENANT,
    departmentId,
    code,
    title: "Mathematics Teacher",
    employmentType: "full_time" as const,
  }) as const;

describe("PositionService", () => {
  it("creates a position under an active department, deriving the organization", async () => {
    const d = dept();
    const { svc, events } = await harness([d]);
    const pos = await svc.create(create(d.id));
    expect(pos.organizationId).toBe(ORG);
    expect(pos.status).toBe("draft");
    expect(events.map((e) => e.type)).toEqual(["workforce.position.created"]);
    await expect(svc.create(create(d.id, "TEACH-MATH"))).rejects.toBeInstanceOf(
      DuplicatePositionCodeError,
    );
  });

  it("rejects an unknown or archived department", async () => {
    const d = archiveDepartment(dept());
    const { svc } = await harness([d]);
    await expect(
      svc.create(create("00000000-0000-0000-0000-000000000000" as Uuid)),
    ).rejects.toBeInstanceOf(DepartmentNotFoundError);
    await expect(svc.create(create(d.id))).rejects.toBeInstanceOf(DepartmentNotActiveError);
  });

  it("runs the position lifecycle, publishing opened and closed events", async () => {
    const d = dept();
    const { svc, events } = await harness([d]);
    const pos = await svc.create(create(d.id));
    await svc.open(TENANT, pos.id);
    await svc.hold(TENANT, pos.id);
    await svc.resume(TENANT, pos.id);
    await svc.close(TENANT, pos.id);
    expect(events.map((e) => e.type)).toEqual([
      "workforce.position.created",
      "workforce.position.opened",
      "workforce.position.closed",
    ]);
    expect((await svc.getById(TENANT, pos.id)).status).toBe("closed");
    expect(await svc.listForDepartment(TENANT, d.id)).toHaveLength(1);
  });
});
