import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidAllocationTransitionError } from "./errors";
import type { AllocationStatus } from "./residential-value";

/**
 * A bed allocation — a student's residency in a specific bed of a {@link Room} for a period. It runs
 * `active → ended` (terminal, on vacating). At most one allocation is active per bed, and at most one is
 * active per student (a resident lives in one bed at a time); the service enforces both. The organization
 * and hostel are derived from the room; the student is a validated Student (P2-D03).
 */
export interface BedAllocation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomId: Uuid;
  readonly bedKey: string;
  readonly studentId: Uuid;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: AllocationStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAllocationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomId: Uuid;
  readonly bedKey: string;
  readonly studentId: Uuid;
  readonly effectiveFrom: string;
}

/** Create a bed allocation (status `active`). */
export function createBedAllocation(params: CreateAllocationParams): BedAllocation {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    roomId: params.roomId,
    bedKey: params.bedKey,
    studentId: params.studentId,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (allocation: BedAllocation, patch: Partial<BedAllocation>): BedAllocation => ({
  ...allocation,
  ...patch,
  updatedAt: nowIso(),
});

/** End an active allocation (→ `ended`), recording the effective end date (a student vacating a bed). */
export function endAllocation(
  allocation: BedAllocation,
  effectiveTo?: string | null,
): BedAllocation {
  if (allocation.status !== "active") {
    throw new InvalidAllocationTransitionError(allocation.status, "ended");
  }
  return touch(allocation, { status: "ended", effectiveTo: effectiveTo ?? null });
}

/** Whether the allocation is currently active (an occupant counted for occupancy). */
export const isAllocationActive = (allocation: BedAllocation): boolean =>
  allocation.status === "active";
