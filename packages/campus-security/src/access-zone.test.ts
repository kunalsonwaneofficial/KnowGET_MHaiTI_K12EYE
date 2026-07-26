import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createAccessZone,
  decommissionZone,
  isZoneActive,
  liftZoneLockdown,
  lockDownZone,
  renameZone,
  setZoneCapacity,
  setZoneSecurityLevel,
} from "./access-zone";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (capacity = 50) =>
  createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Main Gate",
    securityLevel: "restricted",
    capacity,
  });

describe("AccessZone aggregate", () => {
  it("creates active with a trimmed code/name and validates capacity", () => {
    const z = createAccessZone({
      tenantId,
      organizationId,
      code: "  Z-1 ",
      name: "  Main Gate ",
      securityLevel: "restricted",
      capacity: 50,
    });
    expect(z.code).toBe("Z-1");
    expect(z.name).toBe("Main Gate");
    expect(z.capacity).toBe(50);
    expect(isZoneActive(z)).toBe(true);
    expect(() =>
      createAccessZone({ tenantId, organizationId, code: " ", name: "X", securityLevel: "public" }),
    ).toThrow(/code/);
    expect(() =>
      createAccessZone({
        tenantId,
        organizationId,
        code: "Z",
        name: "X",
        securityLevel: "public",
        capacity: -1,
      }),
    ).toThrow(/non-negative/);
  });

  it("edits name/level/capacity while in service and reflects them", () => {
    const z = make();
    expect(renameZone(z, "Rear Gate").name).toBe("Rear Gate");
    expect(setZoneSecurityLevel(z, "high_security").securityLevel).toBe("high_security");
    expect(setZoneCapacity(z, 80).capacity).toBe(80);
  });

  it("runs active ↔ locked_down → decommissioned and guards illegal moves", () => {
    const z = make();
    const locked = lockDownZone(z);
    expect(locked.status).toBe("locked_down");
    expect(isZoneActive(locked)).toBe(false);
    expect(liftZoneLockdown(locked).status).toBe("active");
    expect(() => liftZoneLockdown(z)).toThrow(/cannot move/); // active, not locked
    expect(() => lockDownZone(locked)).toThrow(/cannot move/); // already locked
    const dead = decommissionZone(z);
    expect(dead.status).toBe("decommissioned");
    expect(() => decommissionZone(dead)).toThrow(/cannot move/); // terminal
    expect(() => renameZone(dead, "X")).toThrow(/cannot move/); // frozen once decommissioned
    expect(() => setZoneCapacity(dead, 10)).toThrow(/cannot move/);
  });
});
