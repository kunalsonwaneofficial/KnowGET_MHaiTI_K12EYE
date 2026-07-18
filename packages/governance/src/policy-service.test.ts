import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  OrganizationNotFoundForGovernanceError,
  PolicyNotFoundError,
  PolicyNotPublishedError,
} from "./errors";
import { PolicyService } from "./policy-service";
import {
  InMemoryPolicyAcknowledgmentRepository,
  InMemoryPolicyRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const OWNER = "33333333-3333-3333-3333-333333333333" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === OWNER };

let events: DomainEvent[];
let service: PolicyService;

beforeEach(() => {
  events = [];
  service = new PolicyService({
    repository: new InMemoryPolicyRepository(),
    acknowledgments: new InMemoryPolicyAcknowledgmentRepository(),
    organizations: orgDir,
    persons: personDir,
    events: { publish: async (e) => void events.push(e) },
  });
});

const authoredDraft = () =>
  service.author({
    tenantId: TENANT,
    organizationId: ORG,
    category: "child_protection",
    title: "Safeguarding Policy",
    ownerId: OWNER,
  });

describe("PolicyService", () => {
  it("rejects authoring under an unknown organization", async () => {
    await expect(
      service.author({
        tenantId: TENANT,
        organizationId: MISSING,
        category: "other",
        title: "X",
        ownerId: OWNER,
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
  });

  it("publishes and emits governance.policy.published; lists it as applicable", async () => {
    const draft = await authoredDraft();
    await service.approve(TENANT, draft.id);
    const published = await service.publish(TENANT, draft.id, { effectiveOn: "2026-08-01" });
    expect(published.status).toBe("published");
    expect(events.map((e) => e.type)).toEqual(["governance.policy.published"]);
    const applicable = await service.listApplicable(TENANT, ORG);
    expect(applicable.map((p) => p.id)).toEqual([draft.id]);
  });

  it("retires and emits governance.policy.retired", async () => {
    const draft = await authoredDraft();
    await service.approve(TENANT, draft.id);
    await service.publish(TENANT, draft.id);
    await service.retire(TENANT, draft.id);
    expect(events.map((e) => e.type)).toEqual([
      "governance.policy.published",
      "governance.policy.retired",
    ]);
  });

  it("acknowledges only published policies, by a real person", async () => {
    const draft = await authoredDraft();
    await expect(service.acknowledgePolicy(TENANT, draft.id, OWNER)).rejects.toBeInstanceOf(
      PolicyNotPublishedError,
    );
    await service.approve(TENANT, draft.id);
    await service.publish(TENANT, draft.id);
    const ack = await service.acknowledgePolicy(TENANT, draft.id, OWNER);
    expect(ack.personId).toBe(OWNER);
    expect((await service.listAcknowledgments(TENANT, draft.id)).length).toBe(1);
  });

  it("isolates tenants", async () => {
    const draft = await authoredDraft();
    const other = "cccccccc-cccc-cccc-cccc-cccccccccccc" as TenantId;
    await expect(service.getById(other, draft.id)).rejects.toBeInstanceOf(PolicyNotFoundError);
  });
});
