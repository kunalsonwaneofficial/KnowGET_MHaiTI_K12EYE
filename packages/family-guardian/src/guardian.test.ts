import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  GuardianArchivedError,
  GuardianContactNotFoundError,
  InvalidGuardianTransitionError,
  InvalidVerificationTransitionError,
} from "./errors";
import {
  activateGuardian,
  archiveGuardian,
  hasLegalAuthority,
  putContact,
  registerGuardian,
  rejectVerification,
  removeContact,
  setAvailability,
  submitForVerification,
  suspendGuardian,
  updateLegalAuthority,
  verifyGuardian,
} from "./guardian";
import type { GuardianContact } from "./guardian-contact";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const base = () => registerGuardian({ tenantId: TENANT, organizationId: ORG, personId: PERSON });

const contact = (value: string, isPrimary: boolean): GuardianContact => ({
  channel: "email",
  value,
  isPrimary,
});

describe("Guardian aggregate", () => {
  it("registers a pending, unverified guardian with no legal authority by default", () => {
    const g = base();
    expect(g.status).toBe("pending");
    expect(g.verification).toBe("unverified");
    expect(g.legalAuthority).toBe("none");
    expect(hasLegalAuthority(g)).toBe(false);
    expect(g.verifiedOn).toBeNull();
  });

  it("verifies identity and thereby activates a pending guardian", () => {
    const submitted = submitForVerification(base());
    expect(submitted.verification).toBe("pending");
    const verified = verifyGuardian(submitted, "2026-03-01");
    expect(verified.verification).toBe("verified");
    expect(verified.verifiedOn).toBe("2026-03-01");
    expect(verified.status).toBe("active");
    expect(() => verifyGuardian(verified)).toThrow(InvalidVerificationTransitionError);
  });

  it("rejects verification and forbids rejecting a verified guardian", () => {
    const rejected = rejectVerification(submitForVerification(base()));
    expect(rejected.verification).toBe("rejected");
    const verified = verifyGuardian(base());
    expect(() => rejectVerification(verified)).toThrow(InvalidVerificationTransitionError);
  });

  it("drives the activate → suspend → activate → archive lifecycle", () => {
    let g = activateGuardian(base());
    expect(g.status).toBe("active");
    g = suspendGuardian(g);
    expect(g.status).toBe("suspended");
    g = activateGuardian(g);
    expect(g.status).toBe("active");
    expect(() => suspendGuardian(suspendGuardian(g))).toThrow(InvalidGuardianTransitionError);
    const archived = archiveGuardian(g);
    expect(archived.status).toBe("archived");
    expect(() => archiveGuardian(archived)).toThrow(GuardianArchivedError);
    expect(() => activateGuardian(archived)).toThrow(InvalidGuardianTransitionError);
  });

  it("updates legal authority and blocks it once archived", () => {
    const g = updateLegalAuthority(base(), "legal_guardian");
    expect(g.legalAuthority).toBe("legal_guardian");
    expect(hasLegalAuthority(g)).toBe(true);
    const archived = archiveGuardian(base());
    expect(() => updateLegalAuthority(archived, "biological_parent")).toThrow(
      GuardianArchivedError,
    );
  });

  it("manages contacts with a single primary", () => {
    let g = putContact(base(), contact("a@x.test", true));
    g = putContact(g, contact("b@x.test", true));
    const primaries = g.contacts.filter((c) => c.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.value).toBe("b@x.test");
    g = removeContact(g, "a@x.test");
    expect(g.contacts).toHaveLength(1);
    expect(() => removeContact(g, "missing@x.test")).toThrow(GuardianContactNotFoundError);
  });

  it("sets an availability note", () => {
    const g = setAvailability(base(), "  Weekdays 9-5  ");
    expect(g.availabilityNote).toBe("Weekdays 9-5");
    expect(setAvailability(g, "   ").availabilityNote).toBeNull();
  });
});
