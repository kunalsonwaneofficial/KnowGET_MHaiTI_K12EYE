import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { registerAsset } from "./asset";
import { AssetMaintenanceService } from "./asset-maintenance-service";
import { AssetNotFoundError } from "./errors";
import { InMemoryAssetMaintenanceRepository, InMemoryAssetRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

async function harness() {
  const events: DomainEvent[] = [];
  const assets = new InMemoryAssetRepository();
  const asset = registerAsset({
    tenantId: TENANT,
    organizationId: ORG,
    assetTag: "LAP-001",
    name: "Staff Laptop",
    acquisitionCostMinor: 6000000,
    salvageValueMinor: 600000,
    currency: "INR",
    acquisitionDate: "2025-01-15",
    usefulLifeMonths: 36,
  });
  await assets.save(asset);
  const svc = new AssetMaintenanceService({
    repository: new InMemoryAssetMaintenanceRepository(),
    assets,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, assetId: asset.id };
}

describe("AssetMaintenanceService", () => {
  it("schedules against an asset deriving the organization, then completes it", async () => {
    const { svc, events, assetId } = await harness();
    const m = await svc.schedule({ tenantId: TENANT, assetId, description: "Annual service" });
    expect(m.organizationId).toBe(ORG);
    await svc.complete(TENANT, m.id, {
      performedDate: "2025-06-01",
      costMinor: 100000,
      currency: "INR",
    });
    expect(events.map((e) => e.type)).toEqual([
      "resource.maintenance.scheduled",
      "resource.maintenance.completed",
    ]);
  });

  it("emits a cancelled event when a scheduled maintenance is cancelled", async () => {
    const { svc, events, assetId } = await harness();
    const m = await svc.schedule({ tenantId: TENANT, assetId, description: "Annual service" });
    const cancelled = await svc.cancel(TENANT, m.id, "no longer needed");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.notes).toBe("no longer needed");
    expect(events.map((e) => e.type)).toEqual([
      "resource.maintenance.scheduled",
      "resource.maintenance.cancelled",
    ]);
  });

  it("rejects scheduling against an unknown asset", async () => {
    const { svc } = await harness();
    await expect(
      svc.schedule({
        tenantId: TENANT,
        assetId: "00000000-0000-0000-0000-000000000000" as Uuid,
        description: "x",
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
  });
});
