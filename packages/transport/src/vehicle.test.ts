import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidCapacityError, InvalidVehicleTransitionError } from "./errors";
import {
  isVehicleActive,
  registerVehicle,
  retireVehicle,
  returnVehicleFromMaintenance,
  sendVehicleToMaintenance,
  setSeatingCapacity,
} from "./vehicle";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  registerVehicle({
    tenantId: TENANT,
    organizationId: ORG,
    registrationNumber: " MH12AB1234 ",
    type: "bus",
    seatingCapacity: 40,
    ownership: "owned",
  });

describe("vehicle", () => {
  it("registers active, trims registration and validates capacity", () => {
    const v = make();
    expect(v.registrationNumber).toBe("MH12AB1234");
    expect(v.status).toBe("active");
    expect(isVehicleActive(v)).toBe(true);
    expect(() => setSeatingCapacity(v, 0)).toThrow(InvalidCapacityError);
    expect(() => registerVehicle({ ...v, seatingCapacity: 12.5 })).toThrow(InvalidCapacityError);
  });

  it("runs active ↔ under_maintenance → retired and blocks illegal transitions", () => {
    const v = make();
    const inMaint = sendVehicleToMaintenance(v);
    expect(inMaint.status).toBe("under_maintenance");
    expect(() => sendVehicleToMaintenance(inMaint)).toThrow(InvalidVehicleTransitionError);
    expect(returnVehicleFromMaintenance(inMaint).status).toBe("active");
    const retired = retireVehicle(inMaint);
    expect(retired.status).toBe("retired");
    expect(() => retireVehicle(retired)).toThrow(InvalidVehicleTransitionError);
    expect(() => returnVehicleFromMaintenance(retired)).toThrow(InvalidVehicleTransitionError);
  });
});
