import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  assetDepreciationAsOf,
  disposeAsset,
  elapsedMonths,
  isAssetInService,
  registerAsset,
  retireAsset,
  returnAssetFromMaintenance,
  sendAssetToMaintenance,
} from "./asset";
import {
  EmptyAssetTagError,
  InvalidAssetTransitionError,
  InvalidAssetValuationError,
  InvalidCurrencyError,
  NegativeAmountError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  assetTag: "LAP-001",
  name: "Staff Laptop",
  acquisitionCostMinor: 6000000,
  salvageValueMinor: 600000,
  currency: "INR",
  acquisitionDate: "2025-01-15",
  usefulLifeMonths: 36,
} as const;
const register = () => registerAsset(base);

describe("asset", () => {
  it("registers in service and validates the valuation", () => {
    const a = register();
    expect(a.status).toBe("in_service");
    expect(isAssetInService(a)).toBe(true);
    expect(() => registerAsset({ ...base, assetTag: " " })).toThrow(EmptyAssetTagError);
    expect(() => registerAsset({ ...base, salvageValueMinor: 7000000 })).toThrow(
      InvalidAssetValuationError,
    );
    expect(() => registerAsset({ ...base, usefulLifeMonths: 0 })).toThrow(
      InvalidAssetValuationError,
    );
    expect(() => registerAsset({ ...base, acquisitionCostMinor: -1 })).toThrow(NegativeAmountError);
    expect(() => registerAsset({ ...base, currency: "rupee" })).toThrow(InvalidCurrencyError);
  });

  it("runs in_service ↔ under_maintenance → retired → disposed", () => {
    const inMaint = sendAssetToMaintenance(register());
    expect(inMaint.status).toBe("under_maintenance");
    expect(returnAssetFromMaintenance(inMaint).status).toBe("in_service");

    const retired = retireAsset(register());
    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    const disposed = disposeAsset(retired);
    expect(disposed.status).toBe("disposed");
    expect(disposed.disposedAt).not.toBeNull();
    expect(() => disposeAsset(register())).toThrow(InvalidAssetTransitionError);
  });

  it("computes elapsed months and depreciation as of a date", () => {
    expect(elapsedMonths("2025-01-15", "2025-01-15")).toBe(0);
    expect(elapsedMonths("2025-01-15", "2025-07-15")).toBe(6);
    expect(elapsedMonths("2025-01-15", "2025-07-14")).toBe(5); // partial month not counted
    expect(elapsedMonths("2025-01-15", "2024-01-15")).toBe(0); // clamped at zero

    const dep = assetDepreciationAsOf(register(), "2026-07-15"); // 18 months
    expect(dep.accumulatedDepreciationMinor).toBe(2700000); // half of the 5,400,000 base
    expect(dep.netBookValueMinor).toBe(3300000);
  });
});
