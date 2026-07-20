import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  AddressNotFoundError,
  DuplicateHouseholdMemberError,
  EmptyFamilyNameError,
  EmptyFamilyNumberError,
  HouseholdMemberNotFoundError,
  InactiveFamilyError,
  IncompleteAddressError,
} from "./errors";
import {
  addMember,
  archiveFamily,
  markMerged,
  markSplit,
  putAddress,
  registerFamily,
  removeAddress,
  removeMember,
  renameFamily,
  setMemberRole,
  setPreferredCommunication,
  setPrimaryContact,
} from "./family";
import type { FamilyAddress } from "./family-address";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const P1 = "33333333-3333-3333-3333-333333333333" as Uuid;
const P2 = "44444444-4444-4444-4444-444444444444" as Uuid;
const OTHER = "55555555-5555-5555-5555-555555555555" as Uuid;

const base = () =>
  registerFamily({
    tenantId: TENANT,
    organizationId: ORG,
    familyNumber: "FAM-1",
    name: "The Rao Family",
  });

const address = (label: string, isPrimary: boolean): FamilyAddress => ({
  label,
  line1: "1 A Street",
  line2: null,
  city: "Pune",
  region: null,
  postalCode: null,
  country: "IN",
  isPrimary,
});

describe("Family aggregate", () => {
  it("registers an active family with trimmed fields", () => {
    const f = registerFamily({
      tenantId: TENANT,
      organizationId: ORG,
      familyNumber: " FAM-1 ",
      name: "  Rao  ",
    });
    expect(f.status).toBe("active");
    expect(f.familyNumber).toBe("FAM-1");
    expect(f.name).toBe("Rao");
    expect(f.members).toEqual([]);
    expect(f.primaryContactPersonId).toBeNull();
    expect(f.mergedIntoFamilyId).toBeNull();
  });

  it("rejects an empty family number or name", () => {
    expect(() =>
      registerFamily({ tenantId: TENANT, organizationId: ORG, familyNumber: "  ", name: "x" }),
    ).toThrow(EmptyFamilyNumberError);
    expect(() =>
      registerFamily({ tenantId: TENANT, organizationId: ORG, familyNumber: "F", name: "  " }),
    ).toThrow(EmptyFamilyNameError);
  });

  it("rejects duplicate members at registration", () => {
    expect(() =>
      registerFamily({
        tenantId: TENANT,
        organizationId: ORG,
        familyNumber: "F",
        name: "n",
        members: [
          { personId: P1, role: "parent" },
          { personId: P1, role: "guardian" },
        ],
      }),
    ).toThrow(DuplicateHouseholdMemberError);
  });

  it("adds, re-roles and removes members; clears primary contact on removal", () => {
    let f = addMember(base(), { personId: P1, role: "parent" });
    f = addMember(f, { personId: P2, role: "child" });
    expect(f.members).toHaveLength(2);
    f = setPrimaryContact(f, P1);
    expect(f.primaryContactPersonId).toBe(P1);
    f = setMemberRole(f, P2, "guardian");
    expect(f.members.find((m) => m.personId === P2)?.role).toBe("guardian");
    f = removeMember(f, P1);
    expect(f.primaryContactPersonId).toBeNull();
    expect(f.members).toHaveLength(1);
  });

  it("rejects duplicate add and unknown-member operations", () => {
    const f = addMember(base(), { personId: P1, role: "parent" });
    expect(() => addMember(f, { personId: P1, role: "child" })).toThrow(
      DuplicateHouseholdMemberError,
    );
    expect(() => removeMember(f, OTHER)).toThrow(HouseholdMemberNotFoundError);
    expect(() => setPrimaryContact(f, OTHER)).toThrow(HouseholdMemberNotFoundError);
    expect(() => setMemberRole(f, OTHER, "child")).toThrow(HouseholdMemberNotFoundError);
  });

  it("keeps at most one primary address and requires a first line + city", () => {
    let f = putAddress(base(), address("home", true));
    f = putAddress(f, address("office", true));
    const primaries = f.addresses.filter((a) => a.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.label).toBe("office");
    expect(() => putAddress(f, { ...address("bad", false), line1: "  ", city: "" })).toThrow(
      IncompleteAddressError,
    );
    f = removeAddress(f, "home");
    expect(f.addresses).toHaveLength(1);
    expect(() => removeAddress(f, "missing")).toThrow(AddressNotFoundError);
  });

  it("updates preferred communication and renames", () => {
    let f = setPreferredCommunication(base(), {
      preferredLanguage: " hi ",
      preferredChannel: "sms",
    });
    expect(f.preferredLanguage).toBe("hi");
    expect(f.preferredChannel).toBe("sms");
    f = renameFamily(f, "The Rao-Iyer Family");
    expect(f.name).toBe("The Rao-Iyer Family");
    expect(() => renameFamily(f, "   ")).toThrow(EmptyFamilyNameError);
  });

  it("moves through terminal lifecycle states and blocks further edits", () => {
    const merged = markMerged(base(), OTHER);
    expect(merged.status).toBe("merged");
    expect(merged.mergedIntoFamilyId).toBe(OTHER);
    expect(() => addMember(merged, { personId: P1, role: "parent" })).toThrow(InactiveFamilyError);

    const split = markSplit(base());
    expect(split.status).toBe("split");
    expect(() => renameFamily(split, "x")).toThrow(InactiveFamilyError);

    const archived = archiveFamily(base());
    expect(archived.status).toBe("archived");
    expect(() => archiveFamily(archived)).toThrow(InactiveFamilyError);
  });
});
