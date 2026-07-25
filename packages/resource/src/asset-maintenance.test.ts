import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { cancelMaintenance, completeMaintenance, scheduleMaintenance } from "./asset-maintenance";
import {
  EmptyMaintenanceDescriptionError,
  InvalidCurrencyError,
  InvalidMaintenanceTransitionError,
} from "./errors";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  assetId: "66666666-6666-6666-6666-666666666666" as Uuid,
  description: "Annual service",
} as const;
const schedule = () => scheduleMaintenance(base);

describe("asset maintenance", () => {
  it("schedules and completes with a performed date and actual cost", () => {
    const m = schedule();
    expect(m.status).toBe("scheduled");
    expect(m.costMinor).toBeNull();

    const done = completeMaintenance(m, {
      performedDate: "2025-06-01",
      costMinor: 250000,
      currency: "INR",
      notes: "Replaced cooling fan",
    });
    expect(done.status).toBe("completed");
    expect(done.performedDate).toBe("2025-06-01");
    expect(done.costMinor).toBe(250000);
    expect(done.currency).toBe("INR");
  });

  it("cancels a scheduled record and guards transitions and validation", () => {
    expect(cancelMaintenance(schedule()).status).toBe("cancelled");
    expect(() =>
      completeMaintenance(cancelMaintenance(schedule()), { performedDate: "2025-06-01" }),
    ).toThrow(InvalidMaintenanceTransitionError);
    expect(() => scheduleMaintenance({ ...base, description: " " })).toThrow(
      EmptyMaintenanceDescriptionError,
    );
    expect(() =>
      completeMaintenance(schedule(), {
        performedDate: "2025-06-01",
        costMinor: 100,
        currency: "rupee",
      }),
    ).toThrow(InvalidCurrencyError);
  });
});
