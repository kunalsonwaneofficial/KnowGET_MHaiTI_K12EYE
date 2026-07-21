import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidEmergencyPriorityError, RelationshipEndedError } from "./errors";
import type { StudentGuardianRelationshipType } from "./relationship-type";
import { NO_RESPONSIBILITIES, type ResponsibilityProfile } from "./responsibility";

/** A student–guardian relationship is `active` until it is `ended` (terminal). */
export type RelationshipStatus = "active" | "ended";

/**
 * The relationship between a learner (a P2-D03 {@link Student}) and a
 * {@link Guardian}. A student may have many guardians and a guardian many students —
 * neither reference is unique here. It records the relationship type, the independently
 * managed legal / educational / financial responsibilities and pickup / medical
 * authorizations, an optional emergency priority, and the effective period.
 */
export interface StudentGuardianRelationship {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly relationshipType: StudentGuardianRelationshipType;
  readonly responsibilities: ResponsibilityProfile;
  readonly emergencyPriority: number | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: RelationshipStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface LinkGuardianParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly relationshipType: StudentGuardianRelationshipType;
  readonly responsibilities?: Partial<ResponsibilityProfile>;
  readonly emergencyPriority?: number | null;
  readonly effectiveFrom?: string | null;
}

/** Validate an emergency priority: null (none) or a positive integer (1 = highest). */
function validatePriority(priority: number | null): number | null {
  if (priority === null) {
    return null;
  }
  if (!Number.isInteger(priority) || priority < 1) {
    throw new InvalidEmergencyPriorityError(priority);
  }
  return priority;
}

/** Link a guardian to a learner (status `active`). */
export function linkGuardianToStudent(params: LinkGuardianParams): StudentGuardianRelationship {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    guardianId: params.guardianId,
    relationshipType: params.relationshipType,
    responsibilities: { ...NO_RESPONSIBILITIES, ...(params.responsibilities ?? {}) },
    emergencyPriority: validatePriority(params.emergencyPriority ?? null),
    effectiveFrom: params.effectiveFrom ?? now.slice(0, 10),
    effectiveTo: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  relationship: StudentGuardianRelationship,
  patch: Partial<StudentGuardianRelationship>,
): StudentGuardianRelationship => ({
  ...relationship,
  ...patch,
  updatedAt: nowIso(),
});

/** Guard: an ended relationship can no longer be modified. */
function requireActive(relationship: StudentGuardianRelationship): void {
  if (relationship.status !== "active") {
    throw new RelationshipEndedError(relationship.id);
  }
}

/** Change the relationship type. */
export function setRelationshipType(
  relationship: StudentGuardianRelationship,
  relationshipType: StudentGuardianRelationshipType,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, { relationshipType });
}

/** Merge a patch into the responsibility profile. */
export function updateResponsibilities(
  relationship: StudentGuardianRelationship,
  patch: Partial<ResponsibilityProfile>,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, {
    responsibilities: { ...relationship.responsibilities, ...patch },
  });
}

/** Grant or revoke pickup authorization. */
export function setPickupAuthorization(
  relationship: StudentGuardianRelationship,
  authorized: boolean,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, {
    responsibilities: { ...relationship.responsibilities, pickupAuthorized: authorized },
  });
}

/** Grant or revoke medical authorization. */
export function setMedicalAuthorization(
  relationship: StudentGuardianRelationship,
  authorized: boolean,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, {
    responsibilities: { ...relationship.responsibilities, medicalAuthorized: authorized },
  });
}

/** Set (or clear, with null) the emergency-contact priority. */
export function setEmergencyPriority(
  relationship: StudentGuardianRelationship,
  priority: number | null,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, { emergencyPriority: validatePriority(priority) });
}

/** End the relationship (terminal). */
export function endRelationship(
  relationship: StudentGuardianRelationship,
  effectiveTo?: string | null,
): StudentGuardianRelationship {
  requireActive(relationship);
  return touch(relationship, {
    status: "ended",
    effectiveTo: effectiveTo ?? nowIso().slice(0, 10),
  });
}

/** Whether the relationship is currently active. */
export const isActiveRelationship = (relationship: StudentGuardianRelationship): boolean =>
  relationship.status === "active";
