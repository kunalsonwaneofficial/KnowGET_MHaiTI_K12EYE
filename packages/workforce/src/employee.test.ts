import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateEmployee,
  assignEmployeeDepartment,
  giveNotice,
  isEmployeeOnStaff,
  makeEmployeeAlumni,
  onboardEmployee,
  placeEmployeeOnLeave,
  reinstateEmployee,
  resignEmployee,
  retireEmployee,
  returnEmployeeFromLeave,
  suspendEmployee,
  terminateEmployee,
} from "./employee";
import { EmptyEmployeeNumberError, InvalidEmployeeTransitionError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const DEPT = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = (employeeNumber = "E-1") =>
  onboardEmployee({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    employeeNumber,
    employmentType: "full_time",
    hireDate: "2026-01-15",
  });

describe("onboardEmployee", () => {
  it("onboards a staff member in onboarding status", () => {
    const e = make();
    expect(e.status).toBe("onboarding");
    expect(e.hireDate).toBe("2026-01-15");
    expect(e.exitDate).toBeNull();
    expect(isEmployeeOnStaff(e)).toBe(true);
  });

  it("rejects an empty employee number", () => {
    expect(() => make("  ")).toThrow(EmptyEmployeeNumberError);
  });
});

describe("employee lifecycle", () => {
  it("runs onboarding → active → on_leave → active and suspend/reinstate", () => {
    let e = activateEmployee(make());
    expect(e.status).toBe("active");
    e = placeEmployeeOnLeave(e);
    expect(e.status).toBe("on_leave");
    e = returnEmployeeFromLeave(e);
    e = suspendEmployee(e);
    expect(e.status).toBe("suspended");
    e = reinstateEmployee(e);
    expect(e.status).toBe("active");
  });

  it("separates via resign/terminate/retire, stamping an exit date, then alumni", () => {
    const active = activateEmployee(make());
    const resigned = resignEmployee(active, "2027-03-31");
    expect(resigned.status).toBe("resigned");
    expect(resigned.exitDate).toBe("2027-03-31");
    expect(isEmployeeOnStaff(resigned)).toBe(false);
    expect(makeEmployeeAlumni(resigned).status).toBe("alumni");

    expect(terminateEmployee(activateEmployee(make("E-2"))).status).toBe("terminated");
    const onNotice = giveNotice(activateEmployee(make("E-3")));
    expect(onNotice.status).toBe("notice_period");
    expect(retireEmployee(onNotice).status).toBe("retired");
  });

  it("rejects illegal transitions and mutating a separated employee", () => {
    const onboarding = make();
    expect(() => placeEmployeeOnLeave(onboarding)).toThrow(InvalidEmployeeTransitionError);
    const terminated = terminateEmployee(activateEmployee(make()));
    expect(() => assignEmployeeDepartment(terminated, DEPT)).toThrow(
      InvalidEmployeeTransitionError,
    );
    expect(() => makeEmployeeAlumni(activateEmployee(make()))).toThrow(
      InvalidEmployeeTransitionError,
    );
  });

  it("assigns department while on staff", () => {
    const e = assignEmployeeDepartment(activateEmployee(make()), DEPT);
    expect(e.departmentId).toBe(DEPT);
    expect(assignEmployeeDepartment(e, null).departmentId).toBeNull();
  });
});
