import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  deactivateDriver,
  isLicenseValidAsOf,
  reinstateDriver,
  registerDriver,
  renewLicense,
  suspendDriver,
} from "./driver";
import { InvalidDriverTransitionError, InvalidLicenseExpiryError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  registerDriver({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMP,
    licenseNumber: "DL-0099",
    licenseExpiry: "2027-03-31",
  });

describe("driver", () => {
  it("registers active and rejects an invalid expiry", () => {
    const d = make();
    expect(d.status).toBe("active");
    expect(d.licenseExpiry).toBe("2027-03-31");
    expect(() => registerDriver({ ...d, licenseExpiry: "not-a-date" })).toThrow(
      InvalidLicenseExpiryError,
    );
  });

  it("checks licence validity as of a date and renews it", () => {
    const d = make();
    expect(isLicenseValidAsOf(d, "2026-07-25")).toBe(true);
    expect(isLicenseValidAsOf(d, "2027-04-01")).toBe(false);
    const renewed = renewLicense(d, "2030-01-01");
    expect(isLicenseValidAsOf(renewed, "2029-12-31")).toBe(true);
  });

  it("runs active ↔ suspended → deactivated and blocks illegal transitions", () => {
    const d = make();
    const suspended = suspendDriver(d);
    expect(suspended.status).toBe("suspended");
    expect(() => suspendDriver(suspended)).toThrow(InvalidDriverTransitionError);
    expect(reinstateDriver(suspended).status).toBe("active");
    const gone = deactivateDriver(suspended);
    expect(gone.status).toBe("deactivated");
    expect(() => reinstateDriver(gone)).toThrow(InvalidDriverTransitionError);
  });
});
