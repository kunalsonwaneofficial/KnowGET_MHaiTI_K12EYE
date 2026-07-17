import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { ContactType } from "./contact";
import { displayName } from "./name";
import type { Person, PersonStatus } from "./person";

export const PERSON_REGISTERED = "person.registered";
export const PERSON_RENAMED = "person.renamed";
export const PERSON_CONTACT_ADDED = "person.contact_added";
export const PERSON_STATUS_CHANGED = "person.status_changed";
export const PERSON_MERGED = "person.merged";

export interface PersonRegisteredPayload {
  readonly personId: Uuid;
  readonly displayName: string;
}
export interface PersonRenamedPayload {
  readonly personId: Uuid;
  readonly displayName: string;
}
export interface PersonContactAddedPayload {
  readonly personId: Uuid;
  readonly contactType: ContactType;
}
export interface PersonStatusChangedPayload {
  readonly personId: Uuid;
  readonly from: PersonStatus;
  readonly to: PersonStatus;
}
export interface PersonMergedPayload {
  readonly survivorId: Uuid;
  readonly mergedId: Uuid;
}

export type PersonRegisteredEvent = DomainEvent<typeof PERSON_REGISTERED, PersonRegisteredPayload>;
export type PersonMergedEvent = DomainEvent<typeof PERSON_MERGED, PersonMergedPayload>;

export const personRegistered = (person: Person): PersonRegisteredEvent =>
  createEvent(
    PERSON_REGISTERED,
    { personId: person.id, displayName: displayName(person.name) },
    { tenantId: person.tenantId },
  );

export const personRenamed = (
  person: Person,
): DomainEvent<typeof PERSON_RENAMED, PersonRenamedPayload> =>
  createEvent(
    PERSON_RENAMED,
    { personId: person.id, displayName: displayName(person.name) },
    { tenantId: person.tenantId },
  );

export const personContactAdded = (
  person: Person,
  contactType: ContactType,
): DomainEvent<typeof PERSON_CONTACT_ADDED, PersonContactAddedPayload> =>
  createEvent(
    PERSON_CONTACT_ADDED,
    { personId: person.id, contactType },
    { tenantId: person.tenantId },
  );

export const personStatusChanged = (
  person: Person,
  from: PersonStatus,
): DomainEvent<typeof PERSON_STATUS_CHANGED, PersonStatusChangedPayload> =>
  createEvent(
    PERSON_STATUS_CHANGED,
    { personId: person.id, from, to: person.status },
    { tenantId: person.tenantId },
  );

export const personMerged = (survivor: Person, mergedId: Uuid): PersonMergedEvent =>
  createEvent(
    PERSON_MERGED,
    { survivorId: survivor.id, mergedId },
    { tenantId: survivor.tenantId },
  );
