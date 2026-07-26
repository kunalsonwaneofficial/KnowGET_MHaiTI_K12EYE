import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createBedAllocation } from "./bed-allocation";
import { OutpassService } from "./outpass-service";
import {
  InMemoryBedAllocationRepository,
  InMemoryOutpassRepository,
  InMemoryWardenRepository,
} from "./ports";
import { registerWarden, relieveWarden } from "./warden";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostelId = "33333333-3333-3333-3333-333333333333" as Uuid;
const roomId = "44444444-4444-4444-4444-444444444444" as Uuid;
const studentId = "55555555-5555-5555-5555-555555555555" as Uuid;

const setup = async (resident = true) => {
  const repository = new InMemoryOutpassRepository();
  const allocations = new InMemoryBedAllocationRepository();
  const wardens = new InMemoryWardenRepository();
  if (resident) {
    await allocations.save(
      createBedAllocation({
        tenantId,
        organizationId,
        hostelId,
        roomId,
        bedKey: "b1",
        studentId,
        effectiveFrom: "2026-07-01",
      }),
    );
  }
  const warden = registerWarden({
    tenantId,
    organizationId,
    employeeId: "e" as Uuid,
    role: "warden",
  });
  await wardens.save(warden);
  const service = new OutpassService({ repository, allocations, wardens });
  return { repository, allocations, wardens, service, warden };
};

const req = {
  tenantId,
  studentId,
  type: "day" as const,
  expectedOutAt: "2026-07-05T08:00:00Z",
  expectedInAt: "2026-07-05T20:00:00Z",
};

describe("OutpassService.request", () => {
  it("requests an outpass for a current resident, deriving hostel/org", async () => {
    const { service } = await setup();
    const outpass = await service.request(req);
    expect(outpass.hostelId).toBe(hostelId);
    expect(outpass.organizationId).toBe(organizationId);
    expect(outpass.status).toBe("requested");
  });

  it("rejects a non-resident and a second open outpass", async () => {
    const { service: noRes } = await setup(false);
    await expect(noRes.request(req)).rejects.toThrow(/not a current resident/);
    const { service } = await setup();
    await service.request(req);
    await expect(service.request(req)).rejects.toThrow(/already has an open outpass/);
  });
});

describe("OutpassService.approve", () => {
  it("approves against an active warden and blocks an inactive one", async () => {
    const { service, warden } = await setup();
    const outpass = await service.request(req);
    const approved = await service.approve(tenantId, outpass.id, warden.id);
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(warden.id);
  });

  it("rejects approval by an unknown or relieved warden", async () => {
    const { service, wardens } = await setup();
    const outpass = await service.request(req);
    await expect(service.approve(tenantId, outpass.id, "missing" as Uuid)).rejects.toThrow(
      /not found/,
    );
    const relieved = relieveWarden(
      registerWarden({ tenantId, organizationId, employeeId: "e2" as Uuid, role: "warden" }),
    );
    await wardens.save(relieved);
    await expect(service.approve(tenantId, outpass.id, relieved.id)).rejects.toThrow(/not active/);
  });
});

describe("OutpassService lifecycle", () => {
  it("checks out, returns, and re-opens the resident for a new outpass", async () => {
    const { service, warden } = await setup();
    const outpass = await service.request(req);
    await service.approve(tenantId, outpass.id, warden.id);
    const out = await service.checkOut(tenantId, outpass.id, "2026-07-05T08:05:00Z");
    expect(out.status).toBe("checked_out");
    const back = await service.return(tenantId, outpass.id, "2026-07-05T19:00:00Z");
    expect(back.status).toBe("returned");
    // resident is free to request again
    const second = await service.request(req);
    expect(second.status).toBe("requested");
  });
});
