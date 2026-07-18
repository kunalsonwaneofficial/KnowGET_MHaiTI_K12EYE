import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { DelegationService } from "./delegation-service";
import {
  DelegationNotFoundError,
  OrganizationNotFoundForGovernanceError,
  PersonNotFoundForGovernanceError,
  SelfDelegationError,
} from "./errors";
import {
  InMemoryDelegationRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PRINCIPAL = "33333333-3333-3333-3333-333333333333" as Uuid;
const VP = "44444444-4444-4444-4444-444444444444" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = {
  exists: async (_t, id) => id === PRINCIPAL || id === VP,
};

let repository: InMemoryDelegationRepository;
let events: DomainEvent[];
let service: DelegationService;

beforeEach(() => {
  repository = new InMemoryDelegationRepository();
  events = [];
  service = new DelegationService({
    repository,
    organizations: orgDir,
    persons: personDir,
    events: { publish: async (e) => void events.push(e) },
  });
});

const grant = () =>
  service.grant({
    tenantId: TENANT,
    organizationId: ORG,
    delegatorId: PRINCIPAL,
    delegateId: VP,
    scope: "financial",
    effectiveFrom: "2026-01-01",
    monetaryLimit: 100_000,
  });

describe("DelegationService", () => {
  it("grants a delegation and publishes governance.delegation.granted", async () => {
    const d = await grant();
    expect(await service.getById(TENANT, d.id)).toEqual(d);
    expect(events.map((e) => e.type)).toEqual(["governance.delegation.granted"]);
  });

  it("validates the organization, delegator, delegate and self-delegation", async () => {
    await expect(
      service.grant({
        tenantId: TENANT,
        organizationId: MISSING,
        delegatorId: PRINCIPAL,
        delegateId: VP,
        scope: "hr",
        effectiveFrom: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
    await expect(
      service.grant({
        tenantId: TENANT,
        organizationId: ORG,
        delegatorId: PRINCIPAL,
        delegateId: MISSING,
        scope: "hr",
        effectiveFrom: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForGovernanceError);
    await expect(
      service.grant({
        tenantId: TENANT,
        organizationId: ORG,
        delegatorId: PRINCIPAL,
        delegateId: PRINCIPAL,
        scope: "hr",
        effectiveFrom: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(SelfDelegationError);
  });

  it("answers the approval matrix and authorization queries", async () => {
    await grant();
    expect((await service.approvalMatrix(TENANT, ORG, "financial", "2026-03-01")).length).toBe(1);
    expect((await service.approvalMatrix(TENANT, ORG, "hr", "2026-03-01")).length).toBe(0);
    expect(await service.authorizes(TENANT, ORG, VP, "financial", 100_000, "2026-03-01")).toBe(
      true,
    );
    expect(await service.authorizes(TENANT, ORG, VP, "financial", 100_001, "2026-03-01")).toBe(
      false,
    );
  });

  it("revokes and publishes governance.delegation.revoked", async () => {
    const d = await grant();
    await service.revoke(TENANT, d.id, { reason: "reassigned" });
    expect(events.map((e) => e.type)).toEqual([
      "governance.delegation.granted",
      "governance.delegation.revoked",
    ]);
    expect(await service.authorizes(TENANT, ORG, VP, "financial", 1, "2026-03-01")).toBe(false);
  });

  it("isolates tenants", async () => {
    const d = await grant();
    const other = "dddddddd-dddd-dddd-dddd-dddddddddddd" as TenantId;
    await expect(service.getById(other, d.id)).rejects.toBeInstanceOf(DelegationNotFoundError);
  });
});
