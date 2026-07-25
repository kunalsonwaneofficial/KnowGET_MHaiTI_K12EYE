import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidSubstitutionError, SubstitutionStateError } from "./errors";

/** Whether a substitution replaces the slot's teacher or its venue. */
export type SubstitutionType = "teacher" | "venue";

/** Lifecycle state of a substitution. */
export type SubstitutionStatus = "assigned" | "cancelled" | "completed";

/**
 * A tracked, auditable override of a schedule slot's teacher or venue — a stand-in teacher,
 * a moved room, an emergency adjustment. Recorded against the slot it covers, optionally for
 * a specific date, across an assigned → cancelled | completed lifecycle so every
 * substitution is traceable.
 */
export interface Substitution {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scheduleSlotId: Uuid;
  readonly substitutionType: SubstitutionType;
  readonly originalId: Uuid;
  readonly replacementId: Uuid;
  readonly reason: string | null;
  readonly date: string | null;
  readonly status: SubstitutionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSubstitutionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scheduleSlotId: Uuid;
  readonly substitutionType: SubstitutionType;
  readonly originalId: Uuid;
  readonly replacementId: Uuid;
  readonly reason?: string | null;
  readonly date?: string | null;
}

const touch = (substitution: Substitution, patch: Partial<Substitution>): Substitution => ({
  ...substitution,
  ...patch,
  updatedAt: nowIso(),
});

/** Create an assigned substitution; the replacement must differ from the original. */
export function createSubstitution(params: CreateSubstitutionParams): Substitution {
  if (params.originalId === params.replacementId) {
    throw new InvalidSubstitutionError("the replacement must differ from the original");
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    scheduleSlotId: params.scheduleSlotId,
    substitutionType: params.substitutionType,
    originalId: params.originalId,
    replacementId: params.replacementId,
    reason: params.reason?.trim() || null,
    date: params.date?.trim() || null,
    status: "assigned",
    createdAt: now,
    updatedAt: now,
  };
}

/** Cancel an assigned substitution. */
export function cancelSubstitution(substitution: Substitution): Substitution {
  if (substitution.status !== "assigned") {
    throw new SubstitutionStateError(substitution.id, "assigned", substitution.status);
  }
  return touch(substitution, { status: "cancelled" });
}

/** Mark an assigned substitution as completed (the covered session has taken place). */
export function completeSubstitution(substitution: Substitution): Substitution {
  if (substitution.status !== "assigned") {
    throw new SubstitutionStateError(substitution.id, "assigned", substitution.status);
  }
  return touch(substitution, { status: "completed" });
}
