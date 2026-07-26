import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  isWardenActive,
  registerWarden,
  reinstateWarden,
  relieveWarden,
  setWardenRole,
  suspendWarden,
} from "./warden";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () => registerWarden({ tenantId, organizationId, employeeId, role: "warden" });

describe("registerWarden", () => {
  it("registers an active warden linked to an employee", () => {
    const warden = make();
    expect(warden.employeeId).toBe(employeeId);
    expect(warden.role).toBe("warden");
    expect(warden.status).toBe("active");
    expect(isWardenActive(warden)).toBe(true);
  });
});

describe("warden lifecycle", () => {
  it("moves active ↔ suspended and → relieved", () => {
    const suspended = suspendWarden(make());
    expect(suspended.status).toBe("suspended");
    expect(isWardenActive(suspended)).toBe(false);
    const reinstated = reinstateWarden(suspended);
    expect(reinstated.status).toBe("active");
    expect(relieveWarden(reinstated).status).toBe("relieved");
  });

  it("updates the role", () => {
    expect(setWardenRole(make(), "chief_warden").role).toBe("chief_warden");
  });

  it("rejects invalid transitions", () => {
    expect(() => reinstateWarden(make())).toThrow();
    const relieved = relieveWarden(make());
    expect(() => suspendWarden(relieved)).toThrow();
    expect(() => relieveWarden(relieved)).toThrow();
  });
});
