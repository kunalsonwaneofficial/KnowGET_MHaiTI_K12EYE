import { InvalidDepreciationError } from "./errors";
import { prorataMinor } from "./money";
import type { AssetDepreciationView, DepreciationResult } from "./resource-view";

/**
 * The pure straight-line depreciation engine — apportions an asset's **depreciable base** (acquisition
 * cost − salvage value) evenly across its useful life, in integer minor units. Accumulated depreciation
 * as of `monthsElapsed` is `round(base × min(monthsElapsed, life) / life)`, so it is 0 at acquisition
 * and lands **exactly** on the depreciable base at end of life — net book value therefore lands exactly
 * on the salvage value, never drifting below it. Pure, deterministic and exact; date-to-months
 * conversion is a caller concern, keeping the engine free of clocks. Built and tested before any
 * aggregate depends on it.
 */
export function computeDepreciation(
  asset: AssetDepreciationView,
  monthsElapsed: number,
): DepreciationResult {
  const { acquisitionCostMinor, salvageValueMinor, usefulLifeMonths, currency } = asset;
  if (!Number.isInteger(acquisitionCostMinor) || acquisitionCostMinor < 0) {
    throw new InvalidDepreciationError("the acquisition cost must be a non-negative integer");
  }
  if (!Number.isInteger(salvageValueMinor) || salvageValueMinor < 0) {
    throw new InvalidDepreciationError("the salvage value must be a non-negative integer");
  }
  if (salvageValueMinor > acquisitionCostMinor) {
    throw new InvalidDepreciationError("the salvage value cannot exceed the acquisition cost");
  }
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
    throw new InvalidDepreciationError("the useful life must be a positive number of months");
  }
  if (!Number.isInteger(monthsElapsed) || monthsElapsed < 0) {
    throw new InvalidDepreciationError("months elapsed must be a non-negative integer");
  }
  const depreciableBase = acquisitionCostMinor - salvageValueMinor;
  const monthsToDepreciate = Math.min(monthsElapsed, usefulLifeMonths);
  const accumulatedDepreciationMinor = prorataMinor(
    depreciableBase,
    monthsToDepreciate,
    usefulLifeMonths,
  );
  return {
    currency,
    acquisitionCostMinor,
    salvageValueMinor,
    accumulatedDepreciationMinor,
    netBookValueMinor: acquisitionCostMinor - accumulatedDepreciationMinor,
    monthsElapsed,
    usefulLifeMonths,
    fullyDepreciated: monthsElapsed >= usefulLifeMonths,
  };
}
