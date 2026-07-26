import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  deactivateSensor,
  installSensor,
  isSensorActive,
  reactivateSensor,
  retireSensor,
  setSensorUnit,
} from "./sensor";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;
const spaceId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = (unit: string | null = "°C") =>
  installSensor({
    tenantId,
    organizationId,
    buildingId,
    spaceId,
    code: "TMP-1",
    metric: "temperature",
    unit,
  });

describe("Sensor aggregate", () => {
  it("installs active with a trimmed code and normalizes a blank unit to null", () => {
    const s = installSensor({
      tenantId,
      organizationId,
      buildingId,
      spaceId,
      code: "  TMP-1 ",
      metric: "temperature",
      unit: "  ",
    });
    expect(s.code).toBe("TMP-1");
    expect(s.status).toBe("active");
    expect(s.unit).toBeNull();
    expect(() =>
      installSensor({ tenantId, organizationId, buildingId, spaceId, code: " ", metric: "co2" }),
    ).toThrow(/code/);
  });

  it("sets and clears the unit", () => {
    const s = make(null);
    expect(setSensorUnit(s, "°C").unit).toBe("°C");
    expect(setSensorUnit(make(), null).unit).toBeNull();
  });

  it("runs active ↔ inactive → retired and guards illegal moves", () => {
    const s = make();
    expect(isSensorActive(s)).toBe(true);
    const off = deactivateSensor(s);
    expect(off.status).toBe("inactive");
    expect(reactivateSensor(off).status).toBe("active");
    expect(() => deactivateSensor(off)).toThrow(/cannot move/); // already inactive
    expect(() => reactivateSensor(s)).toThrow(/cannot move/); // already active
    const dead = retireSensor(s);
    expect(dead.status).toBe("retired");
    expect(() => retireSensor(dead)).toThrow(/cannot move/); // terminal
  });
});
