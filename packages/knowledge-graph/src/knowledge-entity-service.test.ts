import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { EntityTypeService } from "./entity-type-service";
import { KnowledgeEntityService } from "./knowledge-entity-service";
import {
  DuplicateKnowledgeEntityError,
  MergeTargetNotFoundError,
  UnknownEntityTypeError,
} from "./errors";
import {
  InMemoryEntityTypeRepository,
  InMemoryKnowledgeEntityRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_t, id) {
    return id === ORG;
  },
};

describe("KnowledgeEntityService", () => {
  let entities: InMemoryKnowledgeEntityRepository;
  let entityTypes: InMemoryEntityTypeRepository;
  let svc: KnowledgeEntityService;
  let typeSvc: EntityTypeService;

  beforeEach(async () => {
    entities = new InMemoryKnowledgeEntityRepository();
    entityTypes = new InMemoryEntityTypeRepository();
    typeSvc = new EntityTypeService({ repository: entityTypes, organizations: orgDir });
    svc = new KnowledgeEntityService({ repository: entities, entityTypes, organizations: orgDir });
    await typeSvc.create({ tenantId: TENANT, organizationId: ORG, key: "person", label: "Person" });
  });

  const make = (sourceRef: string) =>
    svc.create({
      tenantId: TENANT,
      organizationId: ORG,
      entityTypeKey: "person",
      sourceDomain: "person",
      sourceRef,
    });

  it("rejects a node whose entity type is not registered", async () => {
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: ORG,
        entityTypeKey: "ghost",
        sourceDomain: "person",
        sourceRef: "x",
      }),
    ).rejects.toThrow(UnknownEntityTypeError);
  });

  it("rejects a node whose entity type is deprecated (not usable)", async () => {
    const t = await typeSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "course",
      label: "Course",
    });
    await typeSvc.deprecate(TENANT, t.id);
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: ORG,
        entityTypeKey: "course",
        sourceDomain: "course",
        sourceRef: "c1",
      }),
    ).rejects.toThrow(UnknownEntityTypeError);
  });

  it("enforces one node per (tenant, source domain, source ref)", async () => {
    await make("person-1");
    await expect(make("person-1")).rejects.toThrow(DuplicateKnowledgeEntityError);
  });

  it("merges a node into an existing active twin", async () => {
    const a = await make("person-1");
    const b = await make("person-2");
    const merged = await svc.merge(TENANT, a.id, b.id);
    expect(merged.status).toBe("merged");
    expect(merged.mergedIntoId).toBe(b.id);
  });

  it("refuses to merge into a missing target", async () => {
    const a = await make("person-1");
    await expect(svc.merge(TENANT, a.id, "ghost" as Uuid)).rejects.toThrow(
      MergeTargetNotFoundError,
    );
  });

  it("refuses to merge into an already-merged (non-active) target", async () => {
    const a = await make("person-1");
    const b = await make("person-2");
    const c = await make("person-3");
    await svc.merge(TENANT, b.id, c.id); // b now merged
    await expect(svc.merge(TENANT, a.id, b.id)).rejects.toThrow(MergeTargetNotFoundError);
  });
});
