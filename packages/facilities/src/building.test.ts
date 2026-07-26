import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  completeBuildingRenovation,
  decommissionBuilding,
  isBuildingActive,
  registerBuilding,
  renameBuilding,
  setBuildingFloors,
  startBuildingRenovation,
} from "./building";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (floors = 3) =>
  registerBuilding({
    tenantId,
    organizationId,
    code: "B-1",
    name: "Science Block",
    type: "academic",
    floors,
  });

describe("Building aggregate", () => {
  it("registers active with a trimmed code/name and the given floors", () => {
    const b = registerBuilding({
      tenantId,
      organizationId,
      code: "  B-1 ",
      name: "  Science Block ",
      type: "academic",
      floors: 3,
    });
    expect(b.code).toBe("B-1");
    expect(b.name).toBe("Science Block");
    expect(b.floors).toBe(3);
    expect(isBuildingActive(b)).toBe(true);
  });

  it("defaults floors to zero and rejects a negative/non-integer floor count", () => {
    expect(
      registerBuilding({ tenantId, organizationId, code: "B", name: "X", type: "utility" }).floors,
    ).toBe(0);
    expect(() => make(-1)).toThrow(/non-negative/);
    expect(() => make(2.5)).toThrow(/non-negative/);
    expect(() => setBuildingFloors(make(), -3)).toThrow(/non-negative/);
  });

  it("rejects an empty code or name", () => {
    expect(() =>
      registerBuilding({ tenantId, organizationId, code: " ", name: "X", type: "academic" }),
    ).toThrow(/code/);
    expect(() =>
      registerBuilding({ tenantId, organizationId, code: "B", name: " ", type: "academic" }),
    ).toThrow(/name/);
  });

  it("runs active ↔ under_renovation → decommissioned and guards illegal moves", () => {
    const b = make();
    const r = startBuildingRenovation(b);
    expect(r.status).toBe("under_renovation");
    expect(isBuildingActive(r)).toBe(false);
    expect(completeBuildingRenovation(r).status).toBe("active");
    expect(() => startBuildingRenovation(r)).toThrow(/cannot move/); // already renovating
    const d = decommissionBuilding(b);
    expect(d.status).toBe("decommissioned");
    expect(() => decommissionBuilding(d)).toThrow(/cannot move/);
    expect(() => completeBuildingRenovation(b)).toThrow(/cannot move/); // active, not renovating
  });

  it("freezes a decommissioned (terminal) building against edits", () => {
    const d = decommissionBuilding(make());
    expect(() => renameBuilding(d, "New name")).toThrow(/cannot move/);
    expect(() => setBuildingFloors(d, 5)).toThrow(/cannot move/);
    expect(renameBuilding(make(), "New name").name).toBe("New name"); // still fine while active
  });
});
