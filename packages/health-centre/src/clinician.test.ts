import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  isClinicianActive,
  registerClinician,
  reinstateClinician,
  relieveClinician,
  setClinicianRole,
  setRegistrationNumber,
  suspendClinician,
} from "./clinician";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () => registerClinician({ tenantId, organizationId, employeeId, role: "physician" });

describe("Clinician aggregate", () => {
  it("registers active, trimming the registration number to null when blank", () => {
    const c = registerClinician({
      tenantId,
      organizationId,
      employeeId,
      role: "nurse",
      registrationNumber: "  ",
    });
    expect(c.role).toBe("nurse");
    expect(c.registrationNumber).toBeNull();
    expect(isClinicianActive(c)).toBe(true);
  });

  it("sets the role and registration number", () => {
    expect(setClinicianRole(make(), "dentist").role).toBe("dentist");
    expect(setRegistrationNumber(make(), " MC-4471 ").registrationNumber).toBe("MC-4471");
    expect(setRegistrationNumber(make(), null).registrationNumber).toBeNull();
  });

  it("runs active ↔ suspended → relieved and guards illegal moves", () => {
    const c = make();
    const s = suspendClinician(c);
    expect(s.status).toBe("suspended");
    expect(isClinicianActive(s)).toBe(false);
    expect(reinstateClinician(s).status).toBe("active");
    expect(() => suspendClinician(s)).toThrow(/cannot move/); // already suspended
    const r = relieveClinician(c);
    expect(r.status).toBe("relieved");
    expect(() => relieveClinician(r)).toThrow(/cannot move/);
    expect(() => reinstateClinician(c)).toThrow(/cannot move/); // active, not suspended
  });
});
