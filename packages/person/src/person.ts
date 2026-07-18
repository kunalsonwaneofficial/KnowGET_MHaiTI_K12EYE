import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ContactPoint } from "./contact";
import { InvalidPersonStatusTransitionError } from "./errors";
import type { PersonName } from "./name";

export type Gender = "male" | "female" | "other" | "unspecified";

export type PersonStatus = "active" | "inactive" | "deceased" | "merged" | "archived";

/**
 * The persona-agnostic canonical record of a human in the institution. Personas
 * (Student, Teacher, Guardian, …) and login identities are layered on in later
 * contracts; a Person may exist with no login identity at all.
 */
export interface Person {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly name: PersonName;
  /** ISO calendar date (YYYY-MM-DD), or null if unknown. */
  readonly dateOfBirth: string | null;
  readonly gender: Gender;
  readonly status: PersonStatus;
  readonly contacts: readonly ContactPoint[];
  /** When merged, points to the surviving person. */
  readonly mergedInto: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreatePersonParams {
  readonly tenantId: TenantId;
  readonly name: PersonName;
  readonly dateOfBirth?: string | null;
  readonly gender?: Gender;
}

/** Create a new, active person. */
export function createPerson(params: CreatePersonParams): Person {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    name: params.name,
    dateOfBirth: params.dateOfBirth ?? null,
    gender: params.gender ?? "unspecified",
    status: "active",
    contacts: [],
    mergedInto: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (person: Person, patch: Partial<Person>): Person => ({
  ...person,
  ...patch,
  updatedAt: nowIso(),
});

export const renamePerson = (person: Person, name: PersonName): Person => touch(person, { name });

export const setDateOfBirth = (person: Person, dateOfBirth: string | null): Person =>
  touch(person, { dateOfBirth });

export const setGender = (person: Person, gender: Gender): Person => touch(person, { gender });

export const setContacts = (person: Person, contacts: readonly ContactPoint[]): Person =>
  touch(person, { contacts });

/** Allowed lifecycle transitions. `merged` is set only by the merge operation. */
const STATUS_TRANSITIONS: Readonly<Record<PersonStatus, readonly PersonStatus[]>> = {
  active: ["inactive", "deceased", "archived"],
  inactive: ["active", "archived"],
  deceased: ["archived"],
  merged: [],
  archived: [],
};

export function transitionPersonStatus(person: Person, to: PersonStatus): Person {
  if (to === "merged" || !STATUS_TRANSITIONS[person.status].includes(to)) {
    throw new InvalidPersonStatusTransitionError(person.status, to);
  }
  return touch(person, { status: to });
}

/** Mark a person as merged into `survivorId` (used by the merge use case). */
export const markMerged = (person: Person, survivorId: Uuid): Person =>
  touch(person, { status: "merged", mergedInto: survivorId });
