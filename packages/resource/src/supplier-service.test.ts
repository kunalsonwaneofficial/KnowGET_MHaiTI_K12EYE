import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateSupplierCodeError, OrganizationNotFoundForResourceError } from "./errors";
import { type OrganizationDirectory, InMemorySupplierRepository } from "./ports";
import { SupplierService } from "./supplier-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: SupplierService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new SupplierService({
    repository: new InMemorySupplierRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = (code = "ACME") =>
  ({ tenantId: TENANT, organizationId: ORG, code, name: "Acme Supplies" }) as const;

describe("SupplierService", () => {
  it("registers, enforces a unique code, and publishes an event", async () => {
    const { svc, events } = service();
    const s = await svc.create(input());
    expect(events.map((e) => e.type)).toEqual(["resource.supplier.registered"]);
    await expect(svc.create(input("ACME"))).rejects.toBeInstanceOf(DuplicateSupplierCodeError);
    expect((await svc.getByCode(TENANT, "ACME")).id).toBe(s.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...input(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForResourceError);
  });

  it("drives the lifecycle, publishing each event", async () => {
    const { svc, events } = service();
    const s = await svc.create(input());
    await svc.suspend(TENANT, s.id);
    await svc.reinstate(TENANT, s.id);
    await svc.blacklist(TENANT, s.id);
    expect(events.map((e) => e.type)).toEqual([
      "resource.supplier.registered",
      "resource.supplier.suspended",
      "resource.supplier.reinstated",
      "resource.supplier.blacklisted",
    ]);
  });
});
