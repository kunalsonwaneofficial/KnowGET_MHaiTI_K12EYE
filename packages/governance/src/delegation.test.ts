import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  authorizesAmount,
  grantDelegation,
  isEffectiveOn,
  isTemporary,
  revokeDelegation,
} from "./delegation";
import {
  InvalidDelegationPeriodError,
  InvalidDelegationTransitionError,
  InvalidMonetaryLimitError,
  SelfDelegationError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PRINCIPAL = "33333333-3333-3333-3333-333333333333" as Uuid;
const VP = "44444444-4444-4444-4444-444444444444" as Uuid;

const grant = (over: Partial<Parameters<typeof grantDelegation>[0]> = {}) =>
  grantDelegation({
    tenantId: TENANT,
    organizationId: ORG,
    delegatorId: PRINCIPAL,
    delegateId: VP,
    scope: "financial",
    effectiveFrom: "2026-01-01",
    monetaryLimit: 100_000,
    ...over,
  });

describe("Delegation", () => {
  it("grants an active delegation", () => {
    const d = grant();
    expect(d.status).toBe("active");
    expect(d.monetaryLimit).toBe(100_000);
    expect(isTemporary(d)).toBe(false);
  });

  it("rejects self-delegation, a negative limit, and an inverted period", () => {
    expect(() => grant({ delegateId: PRINCIPAL })).toThrow(SelfDelegationError);
    expect(() => grant({ monetaryLimit: -1 })).toThrow(InvalidMonetaryLimitError);
    expect(() => grant({ effectiveFrom: "2026-06-01", effectiveUntil: "2026-01-01" })).toThrow(
      InvalidDelegationPeriodError,
    );
  });

  it("computes effectiveness within the window and marks temporary delegations", () => {
    const d = grant({ effectiveFrom: "2026-01-01", effectiveUntil: "2026-06-30" });
    expect(isTemporary(d)).toBe(true);
    expect(isEffectiveOn(d, "2026-03-01")).toBe(true);
    expect(isEffectiveOn(d, "2025-12-31")).toBe(false);
    expect(isEffectiveOn(d, "2026-07-01")).toBe(false);
  });

  it("authorizes amounts within the monetary limit only while effective", () => {
    const d = grant({ monetaryLimit: 50_000 });
    expect(authorizesAmount(d, 50_000, "2026-02-01")).toBe(true);
    expect(authorizesAmount(d, 50_001, "2026-02-01")).toBe(false);
    expect(authorizesAmount(revokeDelegation(d), 10, "2026-02-01")).toBe(false);
  });

  it("revokes an active delegation and blocks a second revocation", () => {
    const revoked = revokeDelegation(grant(), { reason: "role change" });
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedReason).toBe("role change");
    expect(() => revokeDelegation(revoked)).toThrow(InvalidDelegationTransitionError);
  });
});
