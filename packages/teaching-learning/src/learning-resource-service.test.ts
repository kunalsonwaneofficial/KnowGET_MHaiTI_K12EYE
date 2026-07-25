import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { LearningResourceArchivedError } from "./errors";
import { LearningResourceService } from "./learning-resource-service";
import { LEARNING_RESOURCE_ADDED } from "./teaching-learning-events";
import { InMemoryLearningResourceRepository, type OrganizationDirectory } from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;

const allow = (allowed: readonly string[]): OrganizationDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("LearningResourceService", () => {
  let repository: InMemoryLearningResourceRepository;
  let events: DomainEvent[];
  let service: LearningResourceService;

  beforeEach(() => {
    repository = new InMemoryLearningResourceRepository();
    events = [];
    service = new LearningResourceService({
      repository,
      organizations: allow([ORG]),
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Fractions worksheet",
      resourceType: "document",
      tags: ["maths", "fractions"],
    });

  it("adds a draft resource and emits the added event", async () => {
    const resource = await create();
    expect(resource.status).toBe("draft");
    expect(resource.version).toBe(1);
    expect(events.map((e) => e.type)).toEqual([LEARNING_RESOURCE_ADDED]);
  });

  it("publishes then revises to a new version, keeping status", async () => {
    const resource = await create();
    const published = await service.publish(TENANT, resource.id);
    expect(published.status).toBe("published");
    const revised = await service.revise(TENANT, resource.id, "fixed a typo");
    expect(revised.version).toBe(2);
    expect(revised.status).toBe("published");
    expect(revised.revisions).toHaveLength(1);
  });

  it("freezes an archived resource", async () => {
    const resource = await create();
    await service.archive(TENANT, resource.id);
    await expect(service.setTags(TENANT, resource.id, ["x"])).rejects.toBeInstanceOf(
      LearningResourceArchivedError,
    );
  });
});
