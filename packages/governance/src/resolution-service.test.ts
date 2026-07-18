import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
  ResolutionNotFoundError,
} from "./errors";
import { GovernanceBodyService } from "./governance-body-service";
import {
  InMemoryGovernanceBodyRepository,
  InMemoryResolutionRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";
import { ResolutionService } from "./resolution-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "44444444-4444-4444-4444-444444444444" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async () => true };

let repository: InMemoryResolutionRepository;
let bodies: InMemoryGovernanceBodyRepository;
let events: DomainEvent[];
let service: ResolutionService;
let bodyId: Uuid;

beforeEach(async () => {
  repository = new InMemoryResolutionRepository();
  bodies = new InMemoryGovernanceBodyRepository();
  events = [];
  service = new ResolutionService({
    repository,
    organizations: orgDir,
    persons: personDir,
    governanceBodies: bodies,
    events: { publish: async (e) => void events.push(e) },
  });
  const body = await new GovernanceBodyService({
    repository: bodies,
    organizations: orgDir,
  }).establish({ tenantId: TENANT, organizationId: ORG, name: "Board", type: "board_of_trustees" });
  bodyId = body.id;
});

const draft = () =>
  service.draft({
    tenantId: TENANT,
    organizationId: ORG,
    governanceBodyId: bodyId,
    title: "Approve budget",
    proposalText: "Resolved to approve the annual budget.",
    proposedById: PERSON,
  });

describe("ResolutionService", () => {
  it("validates organization and governance body on draft", async () => {
    await expect(
      service.draft({
        tenantId: TENANT,
        organizationId: MISSING,
        governanceBodyId: bodyId,
        title: "X",
        proposalText: "y",
        proposedById: PERSON,
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
    await expect(
      service.draft({
        tenantId: TENANT,
        organizationId: ORG,
        governanceBodyId: MISSING,
        title: "X",
        proposalText: "y",
        proposedById: PERSON,
      }),
    ).rejects.toBeInstanceOf(ParentGovernanceBodyNotFoundError);
  });

  it("runs voting to approval and emits approved + implemented", async () => {
    const r = await draft();
    await service.openVoting(TENANT, r.id);
    await service.vote(TENANT, r.id, { voterId: PERSON, decision: "for" });
    const approved = await service.tally(TENANT, r.id, { effectiveOn: "2026-09-01" });
    expect(approved.status).toBe("approved");
    await service.implement(TENANT, r.id, "2026-09-10");
    expect(events.map((e) => e.type)).toEqual([
      "governance.resolution.approved",
      "governance.resolution.implemented",
    ]);
  });

  it("does not emit approved when a resolution is rejected", async () => {
    const r = await draft();
    await service.openVoting(TENANT, r.id);
    await service.vote(TENANT, r.id, { voterId: PERSON, decision: "against" });
    const rejected = await service.tally(TENANT, r.id);
    expect(rejected.status).toBe("rejected");
    expect(events).toHaveLength(0);
  });

  it("isolates tenants", async () => {
    const r = await draft();
    const other = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" as TenantId;
    await expect(service.getById(other, r.id)).rejects.toBeInstanceOf(ResolutionNotFoundError);
  });
});
