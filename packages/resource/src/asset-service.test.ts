import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AssetService } from "./asset-service";
import {
  DuplicateAssetTagError,
  EmployeeNotFoundForResourceError,
  OrganizationNotFoundForResourceError,
} from "./errors";
import {
  type EmployeeDirectory,
  InMemoryAssetRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "44444444-4444-4444-4444-444444444444" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMP,
  organizationOf: async (_t, id) => (id === EMP ? ORG : null),
};

function service(): { svc: AssetService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new AssetService({
    repository: new InMemoryAssetRepository(),
    organizations,
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = (assetTag = "LAP-001") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    assetTag,
    name: "Staff Laptop",
    acquisitionCostMinor: 6000000,
    salvageValueMinor: 600000,
    currency: "INR",
    acquisitionDate: "2025-01-15",
    usefulLifeMonths: 36,
    custodianId: EMP,
  }) as const;

describe("AssetService", () => {
  it("registers validating org/tag/custodian, publishes an event, and depreciates", async () => {
    const { svc, events } = service();
    const a = await svc.register(input());
    expect(events.map((e) => e.type)).toEqual(["resource.asset.registered"]);
    await expect(svc.register(input("LAP-001"))).rejects.toBeInstanceOf(DuplicateAssetTagError);

    const dep = await svc.depreciationAsOf(TENANT, a.id, "2026-07-15");
    expect(dep.netBookValueMinor).toBe(3300000);
  });

  it("rejects an unknown organization and an unknown custodian", async () => {
    const { svc } = service();
    await expect(
      svc.register({ ...input(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForResourceError);
    await expect(
      svc.register({
        ...input("LAP-002"),
        custodianId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForResourceError);
  });

  it("drives maintenance, retire and dispose, publishing lifecycle events", async () => {
    const { svc, events } = service();
    const a = await svc.register({ ...input(), custodianId: null });
    await svc.sendToMaintenance(TENANT, a.id);
    await svc.returnFromMaintenance(TENANT, a.id);
    await svc.retire(TENANT, a.id);
    await svc.dispose(TENANT, a.id);
    expect(events.map((e) => e.type)).toEqual([
      "resource.asset.registered",
      "resource.asset.retired",
      "resource.asset.disposed",
    ]);
  });
});
