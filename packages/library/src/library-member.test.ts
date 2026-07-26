import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  expireMember,
  isMemberActive,
  registerMember,
  reinstateMember,
  setMemberCategory,
  suspendMember,
} from "./library-member";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const personId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  registerMember({
    tenantId,
    organizationId,
    personId,
    membershipNumber: " M-001 ",
    category: "student",
    joinedOn: "2026-01-01",
  });

describe("registerMember", () => {
  it("registers an active member with a trimmed number", () => {
    const m = make();
    expect(m.membershipNumber).toBe("M-001");
    expect(m.category).toBe("student");
    expect(m.status).toBe("active");
    expect(isMemberActive(m)).toBe(true);
  });

  it("rejects an empty membership number", () => {
    expect(() =>
      registerMember({
        tenantId,
        organizationId,
        personId,
        membershipNumber: "  ",
        category: "student",
        joinedOn: "d",
      }),
    ).toThrow();
  });
});

describe("member lifecycle", () => {
  it("suspends, reinstates and expires, and updates category", () => {
    const suspended = suspendMember(make());
    expect(suspended.status).toBe("suspended");
    expect(isMemberActive(suspended)).toBe(false);
    expect(reinstateMember(suspended).status).toBe("active");
    expect(expireMember(make()).status).toBe("expired");
    expect(expireMember(suspended).status).toBe("expired"); // from suspended too
    expect(setMemberCategory(make(), "faculty").category).toBe("faculty");
  });

  it("rejects invalid transitions", () => {
    expect(() => reinstateMember(make())).toThrow();
    expect(() => expireMember(expireMember(make()))).toThrow();
  });
});
