import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createBedAllocation, endAllocation, isAllocationActive } from "./bed-allocation";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  hostelId: "33333333-3333-3333-3333-333333333333" as Uuid,
  roomId: "44444444-4444-4444-4444-444444444444" as Uuid,
  bedKey: "b1",
  studentId: "55555555-5555-5555-5555-555555555555" as Uuid,
  effectiveFrom: "2026-07-01",
};

describe("bed allocation", () => {
  it("creates an active allocation and derives its hostel/room/bed", () => {
    const allocation = createBedAllocation(base);
    expect(allocation.status).toBe("active");
    expect(isAllocationActive(allocation)).toBe(true);
    expect(allocation.bedKey).toBe("b1");
    expect(allocation.effectiveTo).toBeNull();
  });

  it("ends an active allocation, recording the vacate date", () => {
    const ended = endAllocation(createBedAllocation(base), "2026-12-31");
    expect(ended.status).toBe("ended");
    expect(ended.effectiveTo).toBe("2026-12-31");
    expect(isAllocationActive(ended)).toBe(false);
  });

  it("rejects ending an already-ended allocation", () => {
    const ended = endAllocation(createBedAllocation(base));
    expect(() => endAllocation(ended)).toThrow();
  });
});
