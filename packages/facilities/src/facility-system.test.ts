import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  commissionSystem,
  decommissionSystem,
  isSystemOperational,
  recordSystemService,
  returnSystemToService,
  sendSystemToMaintenance,
  setServiceInterval,
} from "./facility-system";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (interval = 90) =>
  commissionSystem({
    tenantId,
    organizationId,
    buildingId,
    code: "HVAC-1",
    type: "hvac",
    commissionedOn: "2026-01-01",
    serviceIntervalDays: interval,
  });

describe("FacilitySystem aggregate", () => {
  it("commissions operational with a trimmed code and validates the interval", () => {
    const s = commissionSystem({
      tenantId,
      organizationId,
      buildingId,
      code: "  HVAC-1 ",
      type: "hvac",
      commissionedOn: "2026-01-01",
      serviceIntervalDays: 90,
    });
    expect(s.code).toBe("HVAC-1");
    expect(s.status).toBe("operational");
    expect(s.lastServicedOn).toBeNull();
    expect(() =>
      commissionSystem({
        tenantId,
        organizationId,
        buildingId,
        code: " ",
        type: "hvac",
        commissionedOn: "2026-01-01",
        serviceIntervalDays: 90,
      }),
    ).toThrow(/code/);
    expect(() =>
      commissionSystem({
        tenantId,
        organizationId,
        buildingId,
        code: "X",
        type: "hvac",
        commissionedOn: "2026-01-01",
        serviceIntervalDays: 0,
      }),
    ).toThrow(/positive integer/);
  });

  it("records service and edits the interval while not decommissioned", () => {
    const s = make();
    expect(recordSystemService(s, "2026-06-01").lastServicedOn).toBe("2026-06-01");
    expect(setServiceInterval(s, 30).serviceIntervalDays).toBe(30);
    expect(() => setServiceInterval(s, 0)).toThrow(/positive integer/);
    const dead = decommissionSystem(s);
    expect(() => recordSystemService(dead, "2026-06-01")).toThrow(/cannot move/);
    expect(() => setServiceInterval(dead, 30)).toThrow(/cannot move/);
  });

  it("runs operational ↔ under_maintenance → decommissioned and guards illegal moves", () => {
    const s = make();
    expect(isSystemOperational(s)).toBe(true);
    const m = sendSystemToMaintenance(s);
    expect(m.status).toBe("under_maintenance");
    expect(returnSystemToService(m).status).toBe("operational");
    expect(() => returnSystemToService(s)).toThrow(/cannot move/); // operational, not under maintenance
    expect(() => sendSystemToMaintenance(m)).toThrow(/cannot move/); // already under maintenance
    const d = decommissionSystem(s);
    expect(d.status).toBe("decommissioned");
    expect(() => decommissionSystem(d)).toThrow(/cannot move/); // terminal
  });
});
