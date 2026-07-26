import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activatePolicy,
  archivePolicy,
  type CategoryRule,
  type DefaultRule,
  draftCirculationPolicy,
  isPolicyActive,
  resolveTerms,
  setPolicyRules,
} from "./circulation-policy";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const defaultRule: DefaultRule = {
  loanPeriodDays: 14,
  borrowingLimit: 3,
  renewalLimit: 1,
  holdShelfDays: 3,
};
const facultyRule: CategoryRule = {
  category: "faculty",
  loanPeriodDays: 30,
  borrowingLimit: 10,
  renewalLimit: 3,
  holdShelfDays: 7,
};

const draft = () =>
  draftCirculationPolicy({
    tenantId,
    organizationId,
    name: "  Default  ",
    defaultRule,
    rules: [facultyRule],
  });

describe("draftCirculationPolicy", () => {
  it("drafts a version-1 policy with a trimmed name", () => {
    const p = draft();
    expect(p.name).toBe("Default");
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
  });

  it("rejects negative rule limits and duplicate category rules", () => {
    expect(() =>
      draftCirculationPolicy({
        tenantId,
        organizationId,
        name: "P",
        defaultRule: { ...defaultRule, loanPeriodDays: -1 },
      }),
    ).toThrow(/non-negative/);
    expect(() =>
      draftCirculationPolicy({
        tenantId,
        organizationId,
        name: "P",
        defaultRule,
        rules: [facultyRule, facultyRule],
      }),
    ).toThrow(/duplicate/);
  });
});

describe("policy lifecycle & rules", () => {
  it("edits rules while draft, freezes them once active, and archives", () => {
    const withRules = setPolicyRules(draft(), []);
    expect(withRules.rules).toHaveLength(0);
    const active = activatePolicy(draft());
    expect(isPolicyActive(active)).toBe(true);
    expect(() => setPolicyRules(active, [])).toThrow(/only be edited while draft/);
    expect(archivePolicy(active).status).toBe("archived");
  });

  it("rejects invalid transitions", () => {
    expect(() => archivePolicy(draft())).toThrow(); // must be active
    expect(() => activatePolicy(activatePolicy(draft()))).toThrow();
  });
});

describe("resolveTerms", () => {
  it("returns the category rule when present, else the default", () => {
    const p = draft();
    expect(resolveTerms(p, "faculty").loanPeriodDays).toBe(30);
    expect(resolveTerms(p, "student").loanPeriodDays).toBe(14); // falls back to default
  });
});
