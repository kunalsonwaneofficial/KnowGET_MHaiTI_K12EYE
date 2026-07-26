import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  approveOutpass,
  cancelOutpass,
  checkOutOutpass,
  isOutpassOpen,
  isOutpassOverdue,
  rejectOutpass,
  requestOutpass,
  returnOutpass,
} from "./outpass";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  hostelId: "33333333-3333-3333-3333-333333333333" as Uuid,
  studentId: "55555555-5555-5555-5555-555555555555" as Uuid,
  type: "home" as const,
  expectedOutAt: "2026-07-01T09:00:00Z",
  expectedInAt: "2026-07-03T18:00:00Z",
};
const wardenId = "66666666-6666-6666-6666-666666666666" as Uuid;

describe("requestOutpass", () => {
  it("requests an open outpass with trimmed reason", () => {
    const outpass = requestOutpass({ ...base, reason: "  family event  " });
    expect(outpass.status).toBe("requested");
    expect(outpass.reason).toBe("family event");
    expect(isOutpassOpen(outpass)).toBe(true);
  });

  it("rejects an invalid window (return before departure)", () => {
    expect(() => requestOutpass({ ...base, expectedInAt: "2026-06-01T00:00:00Z" })).toThrow(
      /cannot be before/,
    );
    expect(() => requestOutpass({ ...base, expectedOutAt: "not-a-date" })).toThrow(/valid date/);
  });
});

describe("outpass lifecycle", () => {
  it("runs requested → approved → checked_out → returned", () => {
    const approved = approveOutpass(requestOutpass(base), wardenId);
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(wardenId);
    const out = checkOutOutpass(approved, "2026-07-01T09:05:00Z");
    expect(out.status).toBe("checked_out");
    expect(out.actualOutAt).toBe("2026-07-01T09:05:00Z");
    const back = returnOutpass(out, "2026-07-03T17:30:00Z");
    expect(back.status).toBe("returned");
    expect(back.actualInAt).toBe("2026-07-03T17:30:00Z");
    expect(isOutpassOpen(back)).toBe(false);
  });

  it("supports reject and cancel, and blocks illegal jumps", () => {
    expect(rejectOutpass(requestOutpass(base)).status).toBe("rejected");
    expect(cancelOutpass(requestOutpass(base)).status).toBe("cancelled");
    expect(() => checkOutOutpass(requestOutpass(base))).toThrow(); // must be approved first
    expect(() => returnOutpass(requestOutpass(base))).toThrow();
  });
});

describe("isOutpassOverdue", () => {
  it("is overdue only when checked out and past the expected return", () => {
    const out = checkOutOutpass(
      approveOutpass(requestOutpass(base), wardenId),
      "2026-07-01T09:05:00Z",
    );
    expect(isOutpassOverdue(out, "2026-07-03T17:00:00Z")).toBe(false); // before return
    expect(isOutpassOverdue(out, "2026-07-04T00:00:00Z")).toBe(true); // after return
    // a returned outpass is never overdue
    const back = returnOutpass(out, "2026-07-10T00:00:00Z");
    expect(isOutpassOverdue(back, "2026-07-20T00:00:00Z")).toBe(false);
  });
});
