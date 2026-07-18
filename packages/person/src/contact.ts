import { newUuid } from "@knowget/shared";
import type { Uuid } from "@knowget/types";

export type ContactType = "email" | "phone" | "address";

/** A single way to reach a person. Owned by the Person aggregate. */
export interface ContactPoint {
  readonly id: Uuid;
  readonly type: ContactType;
  readonly value: string;
  readonly label?: string;
  /** At most one primary per type. */
  readonly primary: boolean;
  readonly verified: boolean;
}

export interface AddContactInput {
  readonly type: ContactType;
  readonly value: string;
  readonly label?: string;
}

/** Normalize a value for equality/dedup (emails are case-insensitive). */
const normalize = (type: ContactType, value: string): string =>
  type === "email" ? value.trim().toLowerCase() : value.trim();

/** Add a contact, de-duplicating by (type, normalized value). The first contact
 * of a given type becomes that type's primary. Returns a new array. */
export function addContact(
  contacts: readonly ContactPoint[],
  input: AddContactInput,
): readonly ContactPoint[] {
  const exists = contacts.some(
    (c) =>
      c.type === input.type && normalize(c.type, c.value) === normalize(input.type, input.value),
  );
  if (exists) {
    return contacts;
  }
  const isFirstOfType = !contacts.some((c) => c.type === input.type);
  const contact: ContactPoint = {
    id: newUuid(),
    type: input.type,
    value: input.value.trim(),
    ...(input.label !== undefined ? { label: input.label } : {}),
    primary: isFirstOfType,
    verified: false,
  };
  return [...contacts, contact];
}

export function removeContact(
  contacts: readonly ContactPoint[],
  id: Uuid,
): readonly ContactPoint[] {
  return contacts.filter((c) => c.id !== id);
}

/** Make `id` the primary contact for its type (clearing any prior primary of that type). */
export function setPrimaryContact(
  contacts: readonly ContactPoint[],
  id: Uuid,
): readonly ContactPoint[] {
  const target = contacts.find((c) => c.id === id);
  if (!target) {
    return contacts;
  }
  return contacts.map((c) => (c.type === target.type ? { ...c, primary: c.id === id } : c));
}

export function markVerified(contacts: readonly ContactPoint[], id: Uuid): readonly ContactPoint[] {
  return contacts.map((c) => (c.id === id ? { ...c, verified: true } : c));
}

/** Merge two contact lists, de-duplicating by (type, normalized value). */
export function mergeContacts(
  base: readonly ContactPoint[],
  incoming: readonly ContactPoint[],
): readonly ContactPoint[] {
  let result = base;
  for (const contact of incoming) {
    result = addContact(result, {
      type: contact.type,
      value: contact.value,
      ...(contact.label !== undefined ? { label: contact.label } : {}),
    });
  }
  return result;
}
