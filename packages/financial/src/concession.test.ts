import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  approveConcession,
  concessionAmount,
  isConcessionActive,
  rejectConcession,
  requestConcession,
  revokeConcession,
} from "./concession";
import {
  CurrencyMismatchError,
  EmptyConcessionReasonError,
  InvalidConcessionAmountError,
  InvalidConcessionPercentageError,
  InvalidConcessionTransitionError,
} from "./errors";
import { money } from "./money";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const base = { tenantId: TENANT, organizationId: ORG, studentId: STUDENT } as const;
const pct = (percentage = 20) =>
  requestConcession({ ...base, type: "percentage", percentage, reason: "Merit" });
const fixed = (amountMinor = 50000) =>
  requestConcession({ ...base, type: "fixed", amountMinor, currency: "INR", reason: "Sibling" });

describe("concession", () => {
  it("requests a percentage or fixed concession with validation", () => {
    expect(pct().percentage).toBe(20);
    expect(pct().amountMinor).toBeNull();
    expect(fixed().amountMinor).toBe(50000);
    expect(fixed().currency).toBe("INR");
    expect(() =>
      requestConcession({ ...base, type: "percentage", percentage: 0, reason: "x" }),
    ).toThrow(InvalidConcessionPercentageError);
    expect(() =>
      requestConcession({ ...base, type: "percentage", percentage: 150, reason: "x" }),
    ).toThrow(InvalidConcessionPercentageError);
    expect(() =>
      requestConcession({ ...base, type: "fixed", amountMinor: 0, currency: "INR", reason: "x" }),
    ).toThrow(InvalidConcessionAmountError);
    expect(() =>
      requestConcession({ ...base, type: "percentage", percentage: 10, reason: " " }),
    ).toThrow(EmptyConcessionReasonError);
  });

  it("runs requested → approved → revoked and requested → rejected", () => {
    const approved = approveConcession(pct());
    expect(approved.status).toBe("approved");
    expect(isConcessionActive(approved)).toBe(true);
    expect(revokeConcession(approved).status).toBe("revoked");
    expect(rejectConcession(pct()).status).toBe("rejected");
    expect(() => approveConcession(rejectConcession(pct()))).toThrow(
      InvalidConcessionTransitionError,
    );
    expect(() => revokeConcession(pct())).toThrow(InvalidConcessionTransitionError);
  });

  it("computes the money off a base — percentage, and fixed capped at the base", () => {
    expect(concessionAmount(pct(20), money(100000, "INR"))).toEqual({
      amountMinor: 20000,
      currency: "INR",
    });
    expect(concessionAmount(fixed(50000), money(100000, "INR"))).toEqual({
      amountMinor: 50000,
      currency: "INR",
    });
    expect(concessionAmount(fixed(150000), money(100000, "INR"))).toEqual({
      amountMinor: 100000,
      currency: "INR",
    });
    expect(() => concessionAmount(fixed(50000), money(100000, "USD"))).toThrow(
      CurrencyMismatchError,
    );
  });
});
