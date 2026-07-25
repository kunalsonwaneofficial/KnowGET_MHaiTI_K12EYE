import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateDocumentError, VehicleNotFoundError } from "./errors";
import { InMemoryVehicleDocumentRepository, InMemoryVehicleRepository } from "./ports";
import { registerVehicle } from "./vehicle";
import { VehicleDocumentService } from "./vehicle-document-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

async function harness() {
  const vehicles = new InMemoryVehicleRepository();
  const vehicle = registerVehicle({
    tenantId: TENANT,
    organizationId: ORG,
    registrationNumber: "MH12AB1234",
    type: "bus",
    seatingCapacity: 40,
    ownership: "owned",
  });
  await vehicles.save(vehicle);
  const events: DomainEvent[] = [];
  const svc = new VehicleDocumentService({
    repository: new InMemoryVehicleDocumentRepository(),
    vehicles,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, vehicleId: vehicle.id };
}

describe("VehicleDocumentService", () => {
  it("records a document deriving the org, one per type per vehicle", async () => {
    const { svc, events, vehicleId } = await harness();
    const doc = await svc.record({
      tenantId: TENANT,
      vehicleId,
      type: "insurance",
      documentNumber: "INS-1",
      issuedOn: "2026-01-01",
      expiresOn: "2027-01-01",
    });
    expect(doc.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["transport.document.recorded"]);
    await expect(
      svc.record({
        tenantId: TENANT,
        vehicleId,
        type: "insurance",
        documentNumber: "INS-2",
        issuedOn: "2026-01-01",
        expiresOn: "2027-01-01",
      }),
    ).rejects.toBeInstanceOf(DuplicateDocumentError);
    await expect(
      svc.record({
        tenantId: TENANT,
        vehicleId: "x" as Uuid,
        type: "fitness",
        documentNumber: "F-1",
        issuedOn: "2026-01-01",
        expiresOn: "2027-01-01",
      }),
    ).rejects.toBeInstanceOf(VehicleNotFoundError);
  });

  it("computes valid / expiring / expired compliance as of a date", async () => {
    const { svc, vehicleId } = await harness();
    await svc.record({
      tenantId: TENANT,
      vehicleId,
      type: "fitness",
      documentNumber: "F-1",
      issuedOn: "2026-01-01",
      expiresOn: "2026-08-20",
    });
    const valid = await svc.complianceForVehicle(TENANT, vehicleId, "2026-06-01");
    expect(valid[0]?.status).toBe("valid");
    const expiring = await svc.complianceForVehicle(TENANT, vehicleId, "2026-08-01"); // 19 days
    expect(expiring[0]?.status).toBe("expiring");
    const expired = await svc.complianceForVehicle(TENANT, vehicleId, "2026-09-01");
    expect(expired[0]?.status).toBe("expired");
    expect(expired[0]?.daysToExpiry).toBeLessThan(0);
  });
});
