import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidRelationshipStatusTransitionError, SelfRelationshipError } from "./errors";
import { fromRole, type RelationshipKind, toRole } from "./kind";

export type RelationshipStatus = "active" | "ended";

/**
 * A typed association between two people — a directed edge `from → to`. The
 * {@link RelationshipKind} fixes what each side is (e.g. `from` is the guardian,
 * `to` is the dependent). Persona-agnostic: it links {@link Person} records only.
 */
export interface Relationship {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly fromPersonId: Uuid;
  readonly toPersonId: Uuid;
  readonly kind: RelationshipKind;
  readonly status: RelationshipStatus;
  /** ISO calendar date the relationship is effective from (or null if unknown). */
  readonly startDate: string | null;
  /** ISO calendar date the relationship ended (set when `ended`). */
  readonly endDate: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateRelationshipParams {
  readonly tenantId: TenantId;
  readonly fromPersonId: Uuid;
  readonly toPersonId: Uuid;
  readonly kind: RelationshipKind;
  readonly startDate?: string | null;
}

/** Create a new, `active` relationship (rejecting a self-relationship). */
export function createRelationship(params: CreateRelationshipParams): Relationship {
  if (params.fromPersonId === params.toPersonId) {
    throw new SelfRelationshipError(params.fromPersonId);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    fromPersonId: params.fromPersonId,
    toPersonId: params.toPersonId,
    kind: params.kind,
    status: "active",
    startDate: params.startDate ?? null,
    endDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (relationship: Relationship, patch: Partial<Relationship>): Relationship => ({
  ...relationship,
  ...patch,
  updatedAt: nowIso(),
});

export function endRelationship(relationship: Relationship, endDate?: string | null): Relationship {
  if (relationship.status !== "active") {
    throw new InvalidRelationshipStatusTransitionError(relationship.status, "ended");
  }
  return touch(relationship, { status: "ended", endDate: endDate ?? null });
}

/** True when the relationship is currently in effect (status `active`). */
export const isActiveRelationship = (relationship: Relationship): boolean =>
  relationship.status === "active";

/** The other person in a relationship, and the role they play relative to `personId`. */
export interface Counterpart {
  readonly personId: Uuid;
  readonly role: string;
}

/**
 * Given a relationship and one of its people, return the other person and what
 * they are to them (e.g. for a guardian edge, the dependent's counterpart is the
 * `guardian`). Returns null if `personId` is not part of the relationship.
 */
export function counterpart(relationship: Relationship, personId: Uuid): Counterpart | null {
  if (personId === relationship.toPersonId) {
    return { personId: relationship.fromPersonId, role: fromRole(relationship.kind) };
  }
  if (personId === relationship.fromPersonId) {
    return { personId: relationship.toPersonId, role: toRole(relationship.kind) };
  }
  return null;
}
