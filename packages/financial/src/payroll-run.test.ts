import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyPayrollRunLabelError,
  InvalidCurrencyError,
  InvalidPayrollRunTransitionError,
} from "./errors";
import {
  cancelPayrollRun,
  createPayrollRun,
  isPayrollRunEditable,
  markPayrollRunPaid,
  processPayrollRun,
} from "./payroll-run";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const base = { tenantId: TENANT, organizationId: ORG, label: "May 2025", currency: "INR" } as const;
const create = () => createPayrollRun(base);

describe("payroll run", () => {
  it("creates draft and runs draft → processed → paid", () => {
    const run = create();
    expect(run.status).toBe("draft");
    expect(isPayrollRunEditable(run)).toBe(true);

    const processed = processPayrollRun(run);
    expect(processed.status).toBe("processed");
    expect(processed.processedAt).not.toBeNull();
    expect(isPayrollRunEditable(processed)).toBe(false);

    const paid = markPayrollRunPaid(processed);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
  });

  it("cancels draft/processed but not paid, and guards label/currency/transitions", () => {
    expect(cancelPayrollRun(create()).status).toBe("cancelled");
    expect(() => markPayrollRunPaid(create())).toThrow(InvalidPayrollRunTransitionError);
    expect(() => cancelPayrollRun(markPayrollRunPaid(processPayrollRun(create())))).toThrow(
      InvalidPayrollRunTransitionError,
    );
    expect(() => createPayrollRun({ ...base, label: " " })).toThrow(EmptyPayrollRunLabelError);
    expect(() => createPayrollRun({ ...base, currency: "rupee" })).toThrow(InvalidCurrencyError);
  });
});
