import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createSpace,
  decommissionSpace,
  isSpaceAvailable,
  makeSpaceAvailable,
  returnSpaceToService,
  setSpaceCapacity,
  setSpaceFloor,
  setSpaceType,
  takeSpaceOutOfService,
} from "./space";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (capacity = 30) =>
  createSpace({
    tenantId,
    organizationId,
    buildingId,
    code: "R-101",
    type: "classroom",
    floor: 1,
    capacity,
  });

describe("Space aggregate", () => {
  it("creates draft with a trimmed code and validates floor/capacity", () => {
    const s = createSpace({
      tenantId,
      organizationId,
      buildingId,
      code: "  R-101 ",
      type: "classroom",
      floor: 1,
      capacity: 30,
    });
    expect(s.code).toBe("R-101");
    expect(s.status).toBe("draft");
    expect(s.capacity).toBe(30);
    expect(() =>
      createSpace({ tenantId, organizationId, buildingId, code: " ", type: "office", floor: 1 }),
    ).toThrow(/code/);
    expect(() =>
      createSpace({ tenantId, organizationId, buildingId, code: "R", type: "office", floor: -1 }),
    ).toThrow(/non-negative/);
  });

  it("freezes the floor once in service but allows capacity reconfiguration", () => {
    const draft = make();
    expect(setSpaceFloor(draft, 2).floor).toBe(2); // draft: floor editable
    const available = makeSpaceAvailable(draft);
    expect(() => setSpaceFloor(available, 3)).toThrow(/cannot move/); // frozen once in service
    expect(setSpaceCapacity(available, 40).capacity).toBe(40); // capacity still editable
  });

  it("runs draft → available ↔ out_of_service → decommissioned and guards illegal moves", () => {
    const s = make();
    const a = makeSpaceAvailable(s);
    expect(isSpaceAvailable(a)).toBe(true);
    const out = takeSpaceOutOfService(a);
    expect(out.status).toBe("out_of_service");
    expect(returnSpaceToService(out).status).toBe("available");
    expect(() => takeSpaceOutOfService(s)).toThrow(/cannot move/); // draft, not available
    const d = decommissionSpace(a);
    expect(d.status).toBe("decommissioned");
    expect(() => setSpaceCapacity(d, 10)).toThrow(/cannot move/); // no reconfig once decommissioned
    expect(() => setSpaceType(d, "office")).toThrow(/cannot move/); // type frozen too
  });
});
