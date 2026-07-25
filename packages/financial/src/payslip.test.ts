import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicatePayComponentKeyError,
  InvalidPayslipTransitionError,
  PayComponentNotFoundError,
  PayslipNotEditableError,
} from "./errors";
import {
  addPayslipEarning,
  approvePayslip,
  draftPayslip,
  markPayslipPaid,
  payslipDeductions,
  payslipGross,
  payslipNet,
  payslipNetMinor,
  removePayslipDeduction,
} from "./payslip";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const RUN = "44444444-4444-4444-4444-444444444444" as Uuid;
const EMP = "55555555-5555-5555-5555-555555555555" as Uuid;

const draft = () =>
  draftPayslip({
    tenantId: TENANT,
    organizationId: ORG,
    payrollRunId: RUN,
    employeeId: EMP,
    currency: "INR",
    earnings: [
      { key: "basic", label: "Basic", amountMinor: 5000000 },
      { key: "hra", label: "HRA", amountMinor: 1000000 },
    ],
    deductions: [{ key: "pf", label: "Provident Fund", amountMinor: 600000 }],
  });

describe("payslip", () => {
  it("computes gross, deductions and net purely", () => {
    const p = draft();
    expect(payslipGross(p)).toEqual({ amountMinor: 6000000, currency: "INR" });
    expect(payslipDeductions(p)).toEqual({ amountMinor: 600000, currency: "INR" });
    expect(payslipNet(p)).toEqual({ amountMinor: 5400000, currency: "INR" });
    expect(payslipNetMinor(p)).toBe(5400000);
  });

  it("edits earnings/deductions only while draft, rejecting duplicates and unknowns", () => {
    let p = addPayslipEarning(draft(), { key: "bonus", label: "Bonus", amountMinor: 200000 });
    expect(payslipNetMinor(p)).toBe(5600000);
    p = removePayslipDeduction(p, "pf");
    expect(payslipNetMinor(p)).toBe(6200000);
    expect(() => addPayslipEarning(p, { key: "basic", label: "Dup", amountMinor: 1 })).toThrow(
      DuplicatePayComponentKeyError,
    );
    expect(() => removePayslipDeduction(p, "missing")).toThrow(PayComponentNotFoundError);
    const approved = approvePayslip(draft());
    expect(() => addPayslipEarning(approved, { key: "x", label: "X", amountMinor: 1 })).toThrow(
      PayslipNotEditableError,
    );
  });

  it("runs draft → approved → paid", () => {
    const approved = approvePayslip(draft());
    expect(approved.status).toBe("approved");
    expect(markPayslipPaid(approved).status).toBe("paid");
    expect(() => markPayslipPaid(draft())).toThrow(InvalidPayslipTransitionError);
  });
});
