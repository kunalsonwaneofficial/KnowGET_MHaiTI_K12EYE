import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type EmergencyAuthorizations,
  NO_EMERGENCY_AUTHORIZATIONS,
} from "./emergency-authorization";
import type { EmergencyContactAttempt, EmergencyContactOutcome } from "./emergency-contact-attempt";
import {
  EmergencyContactArchivedError,
  EmptyEmergencyRelationshipError,
  InvalidEmergencyPriorityError,
} from "./errors";

/** An emergency contact is `active` until it is `archived` (terminal). */
export type EmergencyContactStatus = "active" | "archived";

/**
 * A prioritized emergency contact for a learner. The contact is a {@link Person}
 * (`personId`) — identity is never duplicated — with a priority (1 = call first;
 * unique per student), a relationship label, reachability, the actions they are
 * authorized to take (pickup / medical), and an append-only contact history.
 */
export interface EmergencyContact {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly personId: Uuid;
  readonly priority: number;
  readonly relationshipLabel: string;
  readonly phone: string | null;
  readonly availabilityNote: string | null;
  readonly authorizations: EmergencyAuthorizations;
  readonly contactHistory: readonly EmergencyContactAttempt[];
  readonly status: EmergencyContactStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterEmergencyContactParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly personId: Uuid;
  readonly priority: number;
  readonly relationshipLabel: string;
  readonly phone?: string | null;
  readonly availabilityNote?: string | null;
  readonly authorizations?: Partial<EmergencyAuthorizations>;
}

/** Validate an emergency priority: a positive integer (1 = highest). */
function validatePriority(priority: number): number {
  if (!Number.isInteger(priority) || priority < 1) {
    throw new InvalidEmergencyPriorityError(priority);
  }
  return priority;
}

/** Register a new, active emergency contact. */
export function registerEmergencyContact(params: RegisterEmergencyContactParams): EmergencyContact {
  const relationshipLabel = params.relationshipLabel.trim();
  if (relationshipLabel.length === 0) {
    throw new EmptyEmergencyRelationshipError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    personId: params.personId,
    priority: validatePriority(params.priority),
    relationshipLabel,
    phone: params.phone?.trim() || null,
    availabilityNote: params.availabilityNote?.trim() || null,
    authorizations: { ...NO_EMERGENCY_AUTHORIZATIONS, ...(params.authorizations ?? {}) },
    contactHistory: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (contact: EmergencyContact, patch: Partial<EmergencyContact>): EmergencyContact => ({
  ...contact,
  ...patch,
  updatedAt: nowIso(),
});

/** Guard: an archived emergency contact can no longer be modified. */
function requireActive(contact: EmergencyContact): void {
  if (contact.status !== "active") {
    throw new EmergencyContactArchivedError(contact.id);
  }
}

/** Set the emergency-contact priority (1 = call first). */
export function setPriority(contact: EmergencyContact, priority: number): EmergencyContact {
  requireActive(contact);
  return touch(contact, { priority: validatePriority(priority) });
}

/** Change the relationship label. */
export function setRelationshipLabel(contact: EmergencyContact, label: string): EmergencyContact {
  requireActive(contact);
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new EmptyEmergencyRelationshipError();
  }
  return touch(contact, { relationshipLabel: trimmed });
}

/** Set the contact phone number. */
export function setPhone(contact: EmergencyContact, phone: string | null): EmergencyContact {
  requireActive(contact);
  return touch(contact, { phone: phone?.trim() || null });
}

/** Set the availability note. */
export function setEmergencyAvailability(
  contact: EmergencyContact,
  note: string | null,
): EmergencyContact {
  requireActive(contact);
  return touch(contact, { availabilityNote: note?.trim() || null });
}

/** Update the authorized actions (pickup / medical). */
export function setAuthorizations(
  contact: EmergencyContact,
  patch: Partial<EmergencyAuthorizations>,
): EmergencyContact {
  requireActive(contact);
  return touch(contact, { authorizations: { ...contact.authorizations, ...patch } });
}

export interface RecordAttemptParams {
  readonly outcome: EmergencyContactOutcome;
  readonly note?: string | null;
}

/** Append an attempt to the immutable contact history. */
export function recordContactAttempt(
  contact: EmergencyContact,
  params: RecordAttemptParams,
): EmergencyContact {
  requireActive(contact);
  const attempt: EmergencyContactAttempt = {
    at: nowIso(),
    outcome: params.outcome,
    note: params.note?.trim() || null,
  };
  return touch(contact, { contactHistory: [...contact.contactHistory, attempt] });
}

/** Archive the emergency contact (terminal). */
export function archiveEmergencyContact(contact: EmergencyContact): EmergencyContact {
  requireActive(contact);
  return touch(contact, { status: "archived" });
}
