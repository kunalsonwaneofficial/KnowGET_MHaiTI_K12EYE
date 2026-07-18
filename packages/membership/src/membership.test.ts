import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidMembershipStatusTransitionError, MembershipRolesRequiredError } from "./errors";
import {
  changeMembershipRoles,
  createMembership,
  endMembership,
  isActiveMembership,
  type Membership,
  reinstateMembership,
  suspendMembership,
} from "./membership";
import { normalizeRoles } from "./roles";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const ORG = "33333333-3333-3333-3333-333333333333" as Uuid;

const grant = (roles: readonly string[] = ["teacher"]): Membership =>
  createMembership({ tenantId: TENANT, personId: PERSON, organizationId: ORG, roles });

describe("membership roles", () => {
  it("trims and de-duplicates role names", () => {
    expect(normalizeRoles([" teacher ", "teacher", "tutor"])).toEqual(["teacher", "tutor"]);
  });

  it("rejects an empty role set", () => {
    expect(() => normalizeRoles([])).toThrow(MembershipRolesRequiredError);
    expect(() => normalizeRoles(["", "   "])).toThrow(MembershipRolesRequiredError);
  });
});

describe("membership — creation", () => {
  it("creates an active membership linking a person to an organization", () => {
    const membership = grant(["teacher", "form-tutor"]);
    expect(membership.status).toBe("active");
    expect(membership.personId).toBe(PERSON);
    expect(membership.organizationId).toBe(ORG);
    expect(membership.roles).toEqual(["teacher", "form-tutor"]);
    expect(membership.endDate).toBeNull();
    expect(isActiveMembership(membership)).toBe(true);
  });

  it("carries an optional start date", () => {
    const membership = createMembership({
      tenantId: TENANT,
      personId: PERSON,
      organizationId: ORG,
      roles: ["student"],
      startDate: "2026-04-01",
    });
    expect(membership.startDate).toBe("2026-04-01");
  });
});

describe("membership — roles & lifecycle", () => {
  it("replaces the granted roles", () => {
    expect(changeMembershipRoles(grant(), ["principal"]).roles).toEqual(["principal"]);
    expect(() => changeMembershipRoles(grant(), [])).toThrow(MembershipRolesRequiredError);
  });

  it("suspends and reinstates", () => {
    const suspended = suspendMembership(grant());
    expect(suspended.status).toBe("suspended");
    expect(isActiveMembership(suspended)).toBe(false);
    expect(reinstateMembership(suspended).status).toBe("active");
  });

  it("ends a membership and records the end date", () => {
    const ended = endMembership(grant(), "2027-03-31");
    expect(ended.status).toBe("ended");
    expect(ended.endDate).toBe("2027-03-31");
  });

  it("rejects illegal transitions", () => {
    const ended = endMembership(grant());
    expect(() => reinstateMembership(ended)).toThrow(InvalidMembershipStatusTransitionError);
    expect(() => suspendMembership(ended)).toThrow(InvalidMembershipStatusTransitionError);
  });
});
