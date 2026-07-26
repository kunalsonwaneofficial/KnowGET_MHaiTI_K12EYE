import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * The descriptive counts a collection profile carries — the catalog and holdings size, the circulation
 * state (active/overdue loans, open reservations), the digital collection size and the on-loan-vs-loanable
 * utilization percent. All are produced by the pure engines and repository counts; the profile is never
 * posted to directly.
 */
export interface CollectionProfileCounts {
  readonly titleCount: number;
  readonly copyCount: number;
  readonly availableCount: number;
  readonly onLoanCount: number;
  readonly lostCount: number;
  readonly digitalAssetCount: number;
  readonly activeLoanCount: number;
  readonly overdueLoanCount: number;
  readonly openReservationCount: number;
  readonly utilizationPercent: number;
}

/**
 * A collection profile — the descriptive read model of an organization's library collection, kept in step
 * with the catalog, holdings and circulation by the pure engines. It is never a transaction: it is
 * refreshed (bumping `version`) whenever the collection or circulation changes. Exactly one per
 * organization.
 */
export interface CollectionProfile extends CollectionProfileCounts {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCollectionProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly counts: CollectionProfileCounts;
}

/** Create a collection profile from a first reconciliation (version 1). */
export function createCollectionProfile(params: CreateCollectionProfileParams): CollectionProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    ...params.counts,
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh a collection profile from a fresh reconciliation, bumping the version. */
export function refreshCollectionProfile(
  existing: CollectionProfile,
  counts: CollectionProfileCounts,
): CollectionProfile {
  const now = nowIso();
  return {
    ...existing,
    ...counts,
    version: existing.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}
