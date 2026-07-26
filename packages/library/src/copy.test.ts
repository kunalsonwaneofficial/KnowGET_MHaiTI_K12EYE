import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  accessionCopy,
  isCopyAvailable,
  isCopyOnLoan,
  issueCopy,
  markCopyLost,
  returnCopy,
  setCopyCondition,
  withdrawCopy,
} from "./copy";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const titleId = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  accessionCopy({ tenantId, organizationId, titleId, barcode: " BC-001 ", location: " A3 " });

describe("accessionCopy", () => {
  it("accessions an available copy with trimmed fields and a default condition", () => {
    const c = make();
    expect(c.barcode).toBe("BC-001");
    expect(c.location).toBe("A3");
    expect(c.condition).toBe("good");
    expect(c.status).toBe("available");
    expect(isCopyAvailable(c)).toBe(true);
  });

  it("rejects an empty barcode", () => {
    expect(() => accessionCopy({ tenantId, organizationId, titleId, barcode: "  " })).toThrow();
  });
});

describe("copy circulation transitions", () => {
  it("issues and returns an available copy", () => {
    const onLoan = issueCopy(make());
    expect(onLoan.status).toBe("on_loan");
    expect(isCopyOnLoan(onLoan)).toBe(true);
    expect(returnCopy(onLoan).status).toBe("available");
  });

  it("rejects issuing a non-available copy and returning a non-loaned one", () => {
    expect(() => issueCopy(issueCopy(make()))).toThrow();
    expect(() => returnCopy(make())).toThrow();
  });
});

describe("copy terminal transitions", () => {
  it("marks lost from available or on loan, and withdraws only from available", () => {
    expect(markCopyLost(make()).status).toBe("lost");
    expect(markCopyLost(issueCopy(make())).status).toBe("lost");
    expect(withdrawCopy(make()).status).toBe("withdrawn");
    expect(() => withdrawCopy(issueCopy(make()))).toThrow(); // can't withdraw an on-loan copy
    expect(() => markCopyLost(withdrawCopy(make()))).toThrow();
  });

  it("sets condition", () => {
    expect(setCopyCondition(make(), "poor").condition).toBe("poor");
  });
});
