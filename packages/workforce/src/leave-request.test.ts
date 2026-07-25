import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidLeaveDaysError, InvalidLeaveTransitionError } from "./errors";
import {
  approveLeave,
  cancelLeave,
  isLeaveApproved,
  rejectLeave,
  requestLeave,
} from "./leave-request";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;
const MANAGER = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = (days = 5) =>
  requestLeave({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    leaveType: "annual",
    days,
    startDate: "2026-06-01",
  });

describe("requestLeave", () => {
  it("creates a pending request and derives the period from the start date", () => {
    const req = make();
    expect(req.status).toBe("requested");
    expect(req.period).toBe("2026");
    expect(req.decidedBy).toBeNull();
    expect(isLeaveApproved(req)).toBe(false);
  });

  it("rejects a non-positive day count", () => {
    expect(() => make(0)).toThrow(InvalidLeaveDaysError);
    expect(() => make(-2)).toThrow(InvalidLeaveDaysError);
  });
});

describe("leave-request lifecycle", () => {
  it("approves, recording the decider", () => {
    const approved = approveLeave(make(), MANAGER);
    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe(MANAGER);
    expect(isLeaveApproved(approved)).toBe(true);
  });

  it("rejects from requested and cancels from requested or approved", () => {
    expect(rejectLeave(make()).status).toBe("rejected");
    expect(cancelLeave(make()).status).toBe("cancelled");
    expect(cancelLeave(approveLeave(make())).status).toBe("cancelled");
  });

  it("forbids illegal transitions", () => {
    const approved = approveLeave(make());
    expect(() => approveLeave(approved)).toThrow(InvalidLeaveTransitionError);
    expect(() => rejectLeave(approved)).toThrow(InvalidLeaveTransitionError);
  });
});
