import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type CollectionProfileCounts,
  createCollectionProfile,
  refreshCollectionProfile,
} from "./collection-profile";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const counts = (onLoan: number): CollectionProfileCounts => ({
  titleCount: 5,
  copyCount: 10,
  availableCount: 10 - onLoan,
  onLoanCount: onLoan,
  lostCount: 0,
  digitalAssetCount: 3,
  activeLoanCount: onLoan,
  overdueLoanCount: 1,
  openReservationCount: 2,
  utilizationPercent: Math.round((onLoan / 10) * 100),
});

describe("collection profile", () => {
  it("creates version 1 with the counts", () => {
    const p = createCollectionProfile({ tenantId, organizationId, counts: counts(4) });
    expect(p.version).toBe(1);
    expect(p.onLoanCount).toBe(4);
    expect(p.digitalAssetCount).toBe(3);
    expect(p.utilizationPercent).toBe(40);
  });

  it("refreshes with a version bump and fresh counts", () => {
    const first = createCollectionProfile({ tenantId, organizationId, counts: counts(4) });
    const refreshed = refreshCollectionProfile(first, counts(7));
    expect(refreshed.version).toBe(2);
    expect(refreshed.onLoanCount).toBe(7);
    expect(refreshed.id).toBe(first.id);
  });
});
