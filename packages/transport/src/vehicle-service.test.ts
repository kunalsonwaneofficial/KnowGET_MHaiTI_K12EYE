import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateVehicleRegistrationError, OrganizationNotFoundForTransportError } from "./errors";
import type { OrganizationDirectory } from "./ports";
import { InMemoryVehicleRepository } from "./ports";
import { VehicleService } from "./vehicle-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function harness() {
  const events: DomainEvent[] = [];
  const svc = new VehicleService({
    repository: new InMemoryVehicleRepository(),
    organizations,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = {
  tenantId: TENANT,
  organizationId: ORG,
  registrationNumber: "MH12AB1234",
  type: "bus" as const,
  seatingCapacity: 40,
  ownership: "owned" as const,
};

describe("VehicleService", () => {
  it("registers a vehicle, rejecting an unknown org and a duplicate registration", async () => {
    const { svc, events } = harness();
    const v = await svc.create(input);
    expect(v.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual(["transport.vehicle.registered"]);
    await expect(svc.create(input)).rejects.toBeInstanceOf(DuplicateVehicleRegistrationError);
    await expect(
      svc.create({ ...input, registrationNumber: "OTHER", organizationId: "x" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForTransportError);
  });

  it("drives the maintenance/retire lifecycle with events", async () => {
    const { svc, events } = harness();
    const v = await svc.create(input);
    await svc.sendToMaintenance(TENANT, v.id);
    await svc.returnFromMaintenance(TENANT, v.id);
    const retired = await svc.retire(TENANT, v.id);
    expect(retired.status).toBe("retired");
    expect(events.map((e) => e.type)).toEqual([
      "transport.vehicle.registered",
      "transport.vehicle.sent_to_maintenance",
      "transport.vehicle.returned_from_maintenance",
      "transport.vehicle.retired",
    ]);
  });
});
