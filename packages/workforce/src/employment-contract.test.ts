import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateContract,
  draftContract,
  expireContract,
  isContractActive,
  setContractGrade,
  setContractTerms,
  terminateContract,
} from "./employment-contract";
import { ContractNotEditableError, InvalidContractTransitionError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (version = 1) =>
  draftContract({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    version,
    employmentType: "full_time",
    startDate: "2026-01-15",
    grade: "PGT-II",
  });

describe("draftContract", () => {
  it("drafts a version with the grade label and no compensation amount", () => {
    const c = make();
    expect(c.status).toBe("draft");
    expect(c.version).toBe(1);
    expect(c.grade).toBe("PGT-II");
    expect(c.supersedesContractId).toBeNull();
    expect(Object.keys(c)).not.toContain("salary");
    expect(Object.keys(c)).not.toContain("amount");
  });
});

describe("contract editing", () => {
  it("allows edits only while draft", () => {
    let c = make();
    c = setContractGrade(c, "PGT-III");
    c = setContractTerms(c, "  Full academic year  ");
    expect(c.grade).toBe("PGT-III");
    expect(c.terms).toBe("Full academic year");

    const active = activateContract(c);
    expect(() => setContractGrade(active, "PGT-IV")).toThrow(ContractNotEditableError);
    expect(() => setContractTerms(active, "x")).toThrow(ContractNotEditableError);
  });
});

describe("contract lifecycle", () => {
  it("activates, expires and terminates with guards", () => {
    const draft = make();
    const active = activateContract(draft, EMPLOYEE);
    expect(isContractActive(active)).toBe(true);
    expect(active.supersedesContractId).toBe(EMPLOYEE);
    expect(expireContract(active).status).toBe("expired");

    expect(terminateContract(make()).status).toBe("terminated"); // draft → terminated
    expect(terminateContract(activateContract(make())).status).toBe("terminated"); // active → terminated

    expect(() => activateContract(active)).toThrow(InvalidContractTransitionError);
    expect(() => expireContract(draft)).toThrow(InvalidContractTransitionError);
  });
});
