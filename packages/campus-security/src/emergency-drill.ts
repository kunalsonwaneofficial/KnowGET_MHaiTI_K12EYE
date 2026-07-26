import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { DrillStatus, DrillType } from "./campus-security-value";
import { EmptyDrillCodeError, InvalidDrillCountError, InvalidDrillTransitionError } from "./errors";

/**
 * An emergency drill — a planned safety exercise (fire, lockdown, evacuation, earthquake, shelter-in-place)
 * for a zone or the whole site, with an expected roster and, once run, an accounted-for muster headcount. It
 * runs `scheduled → in_progress → completed`, with `cancelled` reachable from scheduled or in-progress. The
 * roster is set while scheduled; the muster is recorded while in progress. The **safety-critical
 * unaccounted-for** number and the completion percent are DERIVED by the pure muster engine from the
 * expected and accounted counts — never stored.
 */
export interface EmergencyDrill {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: DrillType;
  readonly zoneId: Uuid | null;
  readonly conductedById: Uuid | null;
  readonly scheduledFor: string;
  readonly expectedCount: number;
  readonly accountedCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly status: DrillStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleDrillParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: DrillType;
  readonly zoneId?: Uuid | null;
  readonly conductedById?: Uuid | null;
  readonly scheduledFor: string;
  readonly expectedCount?: number;
}

function requireCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidDrillCountError(value);
  }
  return value;
}

/** Schedule an emergency drill (status `scheduled`). Code required; expected roster a non-negative integer. */
export function scheduleDrill(params: ScheduleDrillParams): EmergencyDrill {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyDrillCodeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    type: params.type,
    zoneId: params.zoneId ?? null,
    conductedById: params.conductedById ?? null,
    scheduledFor: params.scheduledFor,
    expectedCount: requireCount(params.expectedCount ?? 0),
    accountedCount: 0,
    startedAt: null,
    completedAt: null,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (drill: EmergencyDrill, patch: Partial<EmergencyDrill>): EmergencyDrill => ({
  ...drill,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the expected roster — only while `scheduled` (before the drill runs). */
export function setDrillExpected(drill: EmergencyDrill, expectedCount: number): EmergencyDrill {
  if (drill.status !== "scheduled") {
    throw new InvalidDrillTransitionError(drill.status, "expected-set");
  }
  return touch(drill, { expectedCount: requireCount(expectedCount) });
}

/** Start a scheduled drill (→ `in_progress`, recording the start time). */
export function startDrill(drill: EmergencyDrill, startedAt: string): EmergencyDrill {
  if (drill.status !== "scheduled") {
    throw new InvalidDrillTransitionError(drill.status, "in_progress");
  }
  return touch(drill, { status: "in_progress", startedAt });
}

/** Record the accounted-for muster headcount — only while `in_progress`. */
export function recordDrillMuster(drill: EmergencyDrill, accountedCount: number): EmergencyDrill {
  if (drill.status !== "in_progress") {
    throw new InvalidDrillTransitionError(drill.status, "muster-recorded");
  }
  return touch(drill, { accountedCount: requireCount(accountedCount) });
}

/** Complete an in-progress drill (→ `completed`, recording the completion time). */
export function completeDrill(drill: EmergencyDrill, completedAt: string): EmergencyDrill {
  if (drill.status !== "in_progress") {
    throw new InvalidDrillTransitionError(drill.status, "completed");
  }
  return touch(drill, { status: "completed", completedAt });
}

/** Cancel a scheduled or in-progress drill (→ `cancelled`, terminal). */
export function cancelDrill(drill: EmergencyDrill): EmergencyDrill {
  if (drill.status !== "scheduled" && drill.status !== "in_progress") {
    throw new InvalidDrillTransitionError(drill.status, "cancelled");
  }
  return touch(drill, { status: "cancelled" });
}
