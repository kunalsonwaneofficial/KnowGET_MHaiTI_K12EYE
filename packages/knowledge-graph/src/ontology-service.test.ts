import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { EntityTypeService } from "./entity-type-service";
import { RelationshipTypeService } from "./relationship-type-service";
import {
  DuplicateEntityTypeError,
  DuplicateRelationshipTypeError,
  OrganizationNotFoundForKnowledgeError,
  UnknownEntityTypeForRelationshipError,
} from "./errors";
import {
  InMemoryEntityTypeRepository,
  InMemoryRelationshipTypeRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const orgDir: OrganizationDirectory = {
  async exists(_t, id) {
    return id === ORG;
  },
};

describe("ontology services", () => {
  let entityTypes: InMemoryEntityTypeRepository;
  let relTypes: InMemoryRelationshipTypeRepository;
  let entitySvc: EntityTypeService;
  let relSvc: RelationshipTypeService;

  beforeEach(() => {
    entityTypes = new InMemoryEntityTypeRepository();
    relTypes = new InMemoryRelationshipTypeRepository();
    entitySvc = new EntityTypeService({ repository: entityTypes, organizations: orgDir });
    relSvc = new RelationshipTypeService({
      repository: relTypes,
      entityTypes,
      organizations: orgDir,
    });
  });

  it("registers entity types and enforces one key per tenant", async () => {
    await entitySvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "person",
      label: "Person",
    });
    await expect(
      entitySvc.create({ tenantId: TENANT, organizationId: ORG, key: "Person", label: "Dup" }),
    ).rejects.toThrow(DuplicateEntityTypeError);
  });

  it("rejects an unknown organization", async () => {
    await expect(
      entitySvc.create({ tenantId: TENANT, organizationId: "ghost" as Uuid, key: "x", label: "X" }),
    ).rejects.toThrow(OrganizationNotFoundForKnowledgeError);
  });

  it("requires both endpoint entity types to be registered for a relationship type", async () => {
    await expect(
      relSvc.create({
        tenantId: TENANT,
        organizationId: ORG,
        key: "enrolled_in",
        label: "enrolled in",
        sourceEntityTypeKey: "student",
        targetEntityTypeKey: "course",
        cardinality: "many_to_many",
      }),
    ).rejects.toThrow(UnknownEntityTypeForRelationshipError);

    await entitySvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "student",
      label: "Student",
    });
    await entitySvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "course",
      label: "Course",
    });
    const rt = await relSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "enrolled_in",
      label: "enrolled in",
      sourceEntityTypeKey: "student",
      targetEntityTypeKey: "course",
      cardinality: "many_to_many",
    });
    expect(rt.key).toBe("enrolled_in");
    await expect(
      relSvc.create({
        tenantId: TENANT,
        organizationId: ORG,
        key: "enrolled_in",
        label: "dup",
        sourceEntityTypeKey: "student",
        targetEntityTypeKey: "course",
        cardinality: "many_to_many",
      }),
    ).rejects.toThrow(DuplicateRelationshipTypeError);
  });
});
