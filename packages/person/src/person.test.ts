import type { TenantId } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { addContact, mergeContacts, setPrimaryContact } from "./contact";
import { InvalidPersonStatusTransitionError } from "./errors";
import { matchKey, normalizeForMatch } from "./matching";
import { displayName, fullName } from "./name";
import { createPerson, transitionPersonStatus } from "./person";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;

describe("name", () => {
  it("computes display and full names", () => {
    const name = { given: "Jonathan", family: "Doe", middle: "Q", preferred: "Jon" };
    expect(displayName(name)).toBe("Jon Doe");
    expect(fullName(name)).toBe("Jonathan Q Doe");
    expect(displayName({ given: "Ann", family: "Lee" })).toBe("Ann Lee");
  });
});

describe("matching", () => {
  it("normalizes away case, punctuation and diacritics", () => {
    expect(normalizeForMatch("  Zoë-María  ")).toBe("zoe maria");
  });
  it("builds a stable match key from family, given and DOB", () => {
    const a = matchKey({ given: "José", family: "Álvarez" }, "2010-05-01");
    const b = matchKey({ given: "jose", family: "alvarez" }, "2010-05-01");
    expect(a).toBe(b);
    expect(a).toBe("alvarez|jose|2010-05-01");
  });
});

describe("contacts", () => {
  it("adds, de-duplicates and assigns the first-of-type as primary", () => {
    let contacts = addContact([], { type: "email", value: "A@x.com" });
    contacts = addContact(contacts, { type: "email", value: "a@x.com" }); // dup (case-insensitive)
    contacts = addContact(contacts, { type: "phone", value: "123" });
    expect(contacts).toHaveLength(2);
    expect(contacts.find((c) => c.type === "email")?.primary).toBe(true);
  });

  it("moves the primary flag within a type", () => {
    let contacts = addContact([], { type: "email", value: "a@x.com" });
    contacts = addContact(contacts, { type: "email", value: "b@x.com" });
    const second = contacts[1]!;
    contacts = setPrimaryContact(contacts, second.id);
    expect(contacts.find((c) => c.primary && c.type === "email")?.id).toBe(second.id);
    expect(contacts.filter((c) => c.type === "email" && c.primary)).toHaveLength(1);
  });

  it("merges contact lists without duplicates", () => {
    const a = addContact([], { type: "email", value: "shared@x.com" });
    const b = addContact(addContact([], { type: "email", value: "SHARED@x.com" }), {
      type: "phone",
      value: "999",
    });
    expect(mergeContacts(a, b)).toHaveLength(2);
  });
});

describe("person lifecycle", () => {
  it("creates an active person and transitions through the state machine", () => {
    const person = createPerson({ tenantId: TENANT, name: { given: "A", family: "B" } });
    expect(person.status).toBe("active");
    expect(transitionPersonStatus(person, "inactive").status).toBe("inactive");
    expect(transitionPersonStatus(person, "deceased").status).toBe("deceased");
  });

  it("rejects illegal transitions and never transitions to merged", () => {
    const person = createPerson({ tenantId: TENANT, name: { given: "A", family: "B" } });
    const deceased = transitionPersonStatus(person, "deceased");
    expect(() => transitionPersonStatus(deceased, "active")).toThrow(
      InvalidPersonStatusTransitionError,
    );
    expect(() => transitionPersonStatus(person, "merged")).toThrow(
      InvalidPersonStatusTransitionError,
    );
  });
});
