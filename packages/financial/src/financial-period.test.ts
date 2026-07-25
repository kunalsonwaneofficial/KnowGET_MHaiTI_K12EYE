import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyPeriodCodeError,
  EmptyPeriodLabelError,
  InvalidPeriodRangeError,
  InvalidPeriodTransitionError,
} from "./errors";
import {
  closeFinancialPeriod,
  isPeriodOpen,
  openFinancialPeriod,
  relabelFinancialPeriod,
  reopenFinancialPeriod,
} from "./financial-period";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const params = {
  tenantId: TENANT,
  organizationId: ORG,
  code: "FY25-Q1",
  label: "FY25 Quarter 1",
  startDate: "2025-04-01",
  endDate: "2025-06-30",
} as const;

const open = () => openFinancialPeriod(params);

describe("financial period", () => {
  it("opens open with no close stamp and drives open → closed → open", () => {
    const period = open();
    expect(period.status).toBe("open");
    expect(period.closedAt).toBeNull();
    expect(isPeriodOpen(period)).toBe(true);

    const closed = closeFinancialPeriod(period);
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    expect(isPeriodOpen(closed)).toBe(false);

    const reopened = reopenFinancialPeriod(closed);
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
  });

  it("rejects an empty code/label and an inverted date range", () => {
    expect(() => openFinancialPeriod({ ...params, code: "  " })).toThrow(EmptyPeriodCodeError);
    expect(() => openFinancialPeriod({ ...params, label: "  " })).toThrow(EmptyPeriodLabelError);
    expect(() =>
      openFinancialPeriod({ ...params, startDate: "2025-06-30", endDate: "2025-04-01" }),
    ).toThrow(InvalidPeriodRangeError);
    expect(() => openFinancialPeriod({ ...params, startDate: "  " })).toThrow(
      InvalidPeriodRangeError,
    );
  });

  it("rejects invalid lifecycle transitions", () => {
    const period = open();
    expect(() => reopenFinancialPeriod(period)).toThrow(InvalidPeriodTransitionError);
    const closed = closeFinancialPeriod(period);
    expect(() => closeFinancialPeriod(closed)).toThrow(InvalidPeriodTransitionError);
  });

  it("relabels while keeping the window and rejects an empty label", () => {
    expect(relabelFinancialPeriod(open(), "Renamed").label).toBe("Renamed");
    expect(() => relabelFinancialPeriod(open(), " ")).toThrow(EmptyPeriodLabelError);
  });
});
