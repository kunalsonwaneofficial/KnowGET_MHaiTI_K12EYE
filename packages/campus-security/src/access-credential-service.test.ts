import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AccessCredentialService } from "./access-credential-service";
import { createAccessZone } from "./access-zone";
import type { EmployeeDirectory, OrganizationDirectory, PersonDirectory } from "./ports";
import {
  InMemoryAccessCredentialRepository,
  InMemoryAccessZoneRepository,
  InMemoryVisitorRepository,
} from "./ports";
import { registerVisitor } from "./visitor";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "66666666-6666-6666-6666-666666666666" as Uuid;

const employees: EmployeeDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === employeeId;
  },
  async organizationOf(_t: TenantId, id: Uuid) {
    return id === employeeId ? organizationId : null;
  },
};
const persons: PersonDirectory = {
  async exists() {
    return false;
  },
};
const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = async () => {
  const repository = new InMemoryAccessCredentialRepository();
  const zones = new InMemoryAccessZoneRepository();
  const visitors = new InMemoryVisitorRepository();
  const events: DomainEvent[] = [];
  const zone = createAccessZone({
    tenantId,
    organizationId,
    code: "Z-1",
    name: "Main Gate",
    securityLevel: "restricted",
  });
  await zones.save(zone);
  const visitor = registerVisitor({
    tenantId,
    organizationId,
    code: "V-1",
    fullName: "Asha Rao",
    type: "vendor",
  });
  await visitors.save(visitor);
  const service = new AccessCredentialService({
    repository,
    organizations,
    zones,
    employees,
    persons,
    visitors,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, zones, visitors, service, zone, visitor, events };
};

describe("AccessCredentialService", () => {
  it("issues to an employee holder granting an existing zone, and emits", async () => {
    const { service, zone, events } = await setup();
    const c = await service.issue({
      tenantId,
      organizationId,
      credentialNumber: "C-1",
      holderType: "employee",
      holderId: employeeId,
      grantedZoneIds: [zone.id],
      issuedOn: "2026-07-01",
    });
    expect(c.status).toBe("active");
    expect(c.grantedZoneIds).toEqual([zone.id]);
    expect(events.map((e) => e.type)).toContain("campus-security.credential.issued");
    await expect(
      service.issue({
        tenantId,
        organizationId,
        credentialNumber: "C-1",
        holderType: "employee",
        holderId: employeeId,
        issuedOn: "2026-07-01",
      }),
    ).rejects.toThrow(/already in use/);
  });

  it("validates the organization, the holder and every granted zone", async () => {
    const { service, zone, visitor } = await setup();
    // unknown organization
    await expect(
      service.issue({
        tenantId,
        organizationId: "missing" as Uuid,
        credentialNumber: "C-0",
        holderType: "employee",
        holderId: employeeId,
        issuedOn: "2026-07-01",
      }),
    ).rejects.toThrow(/Organization/);
    // unknown employee holder
    await expect(
      service.issue({
        tenantId,
        organizationId,
        credentialNumber: "C-2",
        holderType: "employee",
        holderId: "ghost" as Uuid,
        issuedOn: "2026-07-01",
      }),
    ).rejects.toThrow(/Employee/);
    // unknown granted zone
    await expect(
      service.issue({
        tenantId,
        organizationId,
        credentialNumber: "C-3",
        holderType: "visitor",
        holderId: visitor.id,
        grantedZoneIds: [zone.id, "nozone" as Uuid],
        issuedOn: "2026-07-01",
      }),
    ).rejects.toThrow(/Access zone/);
    // a visitor holder is valid
    const c = await service.issue({
      tenantId,
      organizationId,
      credentialNumber: "C-4",
      holderType: "visitor",
      holderId: visitor.id,
      issuedOn: "2026-07-01",
    });
    expect(c.holderType).toBe("visitor");
  });

  it("grants a zone and drives the suspend/revoke lifecycle with events", async () => {
    const { service, zone, events } = await setup();
    const c = await service.issue({
      tenantId,
      organizationId,
      credentialNumber: "C-5",
      holderType: "employee",
      holderId: employeeId,
      issuedOn: "2026-07-01",
    });
    await service.grantZone(tenantId, c.id, zone.id);
    await service.setExpiry(tenantId, c.id, "2027-01-01");
    await service.suspend(tenantId, c.id);
    await service.reinstate(tenantId, c.id);
    await service.revoke(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("campus-security.credential.zone_granted")).toBe(true);
    expect(types.has("campus-security.credential.expiry_set")).toBe(true);
    expect(types.has("campus-security.credential.suspended")).toBe(true);
    expect(types.has("campus-security.credential.reinstated")).toBe(true);
    expect(types.has("campus-security.credential.revoked")).toBe(true);
  });
});
