import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateRequisitionLineKeyError,
  EmptyRequisitionError,
  InvalidRequisitionTransitionError,
  RequisitionNotEditableError,
} from "./errors";
import {
  addRequisitionLine,
  approveRequisition,
  draftRequisition,
  isRequisitionApproved,
  rejectRequisition,
  removeRequisitionLine,
  requisitionTotal,
  requisitionTotalMinor,
  submitRequisition,
} from "./purchase-requisition";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "44444444-4444-4444-4444-444444444444" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  requesterId: EMP,
  title: "Classroom supplies",
  currency: "INR",
  lines: [{ key: "pens", description: "Blue pens", quantity: 10, estimatedUnitCostMinor: 5000 }],
} as const;
const draft = () => draftRequisition(base);

describe("purchase requisition", () => {
  it("drafts, totals its lines, and submits (freezing them)", () => {
    const r = draft();
    expect(r.status).toBe("draft");
    expect(requisitionTotal(r)).toEqual({ amountMinor: 50000, currency: "INR" }); // 10 × 5000

    const submitted = submitRequisition(r);
    expect(submitted.status).toBe("submitted");
    expect(() =>
      addRequisitionLine(submitted, {
        key: "x",
        description: "X",
        quantity: 1,
        estimatedUnitCostMinor: 1,
      }),
    ).toThrow(RequisitionNotEditableError);
  });

  it("edits lines only while draft, rejecting duplicates; submit requires a line", () => {
    let r = addRequisitionLine(draft(), {
      key: "paper",
      description: "A4 paper",
      quantity: 5,
      estimatedUnitCostMinor: 20000,
    });
    expect(requisitionTotalMinor(r)).toBe(150000); // 50000 + 100000
    r = removeRequisitionLine(r, "pens");
    expect(r.lines.map((l) => l.key)).toEqual(["paper"]);
    expect(() =>
      addRequisitionLine(r, {
        key: "paper",
        description: "Dup",
        quantity: 1,
        estimatedUnitCostMinor: 1,
      }),
    ).toThrow(DuplicateRequisitionLineKeyError);
    expect(() => submitRequisition(draftRequisition({ ...base, lines: [] }))).toThrow(
      EmptyRequisitionError,
    );
  });

  it("runs submitted → approved | rejected", () => {
    const approved = approveRequisition(submitRequisition(draft()), "Approved");
    expect(approved.status).toBe("approved");
    expect(isRequisitionApproved(approved)).toBe(true);
    expect(rejectRequisition(submitRequisition(draft()), "No budget").status).toBe("rejected");
    expect(() => approveRequisition(draft())).toThrow(InvalidRequisitionTransitionError);
  });
});
