import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { EntityTypeService } from "./entity-type-service";
import { KnowledgeEntityService } from "./knowledge-entity-service";
import { RelationshipTypeService } from "./relationship-type-service";
import { SemanticRelationshipService } from "./semantic-relationship-service";
import {
  EndpointTypeMismatchError,
  UnknownRelationshipEndpointError,
  UnknownRelationshipTypeError,
} from "./errors";
import {
  InMemoryEntityTypeRepository,
  InMemoryKnowledgeEntityRepository,
  InMemoryRelationshipTypeRepository,
  InMemorySemanticRelationshipRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_t, id) {
    return id === ORG;
  },
};

describe("SemanticRelationshipService — ontology grammar", () => {
  let rels: InMemorySemanticRelationshipRepository;
  let entities: InMemoryKnowledgeEntityRepository;
  let entityTypes: InMemoryEntityTypeRepository;
  let relTypes: InMemoryRelationshipTypeRepository;
  let svc: SemanticRelationshipService;
  let entitySvc: KnowledgeEntityService;
  let studentId: Uuid;
  let courseId: Uuid;

  beforeEach(async () => {
    rels = new InMemorySemanticRelationshipRepository();
    entities = new InMemoryKnowledgeEntityRepository();
    entityTypes = new InMemoryEntityTypeRepository();
    relTypes = new InMemoryRelationshipTypeRepository();
    const entityTypeSvc = new EntityTypeService({ repository: entityTypes, organizations: orgDir });
    const relTypeSvc = new RelationshipTypeService({
      repository: relTypes,
      entityTypes,
      organizations: orgDir,
    });
    entitySvc = new KnowledgeEntityService({
      repository: entities,
      entityTypes,
      organizations: orgDir,
    });
    svc = new SemanticRelationshipService({
      repository: rels,
      entities,
      relationshipTypes: relTypes,
    });
    await entityTypeSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "student",
      label: "Student",
    });
    await entityTypeSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "course",
      label: "Course",
    });
    await relTypeSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      key: "enrolled_in",
      label: "enrolled in",
      sourceEntityTypeKey: "student",
      targetEntityTypeKey: "course",
      cardinality: "many_to_many",
    });
    studentId = (
      await entitySvc.create({
        tenantId: TENANT,
        organizationId: ORG,
        entityTypeKey: "student",
        sourceDomain: "student",
        sourceRef: "s1",
      })
    ).id;
    courseId = (
      await entitySvc.create({
        tenantId: TENANT,
        organizationId: ORG,
        entityTypeKey: "course",
        sourceDomain: "course",
        sourceRef: "c1",
      })
    ).id;
  });

  const assertEnrollment = (source: Uuid, target: Uuid) =>
    svc.assert({
      tenantId: TENANT,
      organizationId: ORG,
      relationshipTypeKey: "enrolled_in",
      sourceEntityId: source,
      targetEntityId: target,
    });

  it("asserts an edge whose endpoints match the relationship-type grammar", async () => {
    const r = await assertEnrollment(studentId, courseId);
    expect(r.status).toBe("asserted");
    expect(r.version).toBe(1);
  });

  it("rejects an unregistered relationship type", async () => {
    await expect(
      svc.assert({
        tenantId: TENANT,
        organizationId: ORG,
        relationshipTypeKey: "teaches",
        sourceEntityId: studentId,
        targetEntityId: courseId,
      }),
    ).rejects.toThrow(UnknownRelationshipTypeError);
  });

  it("rejects an endpoint whose entity type violates the grammar (course → student)", async () => {
    await expect(assertEnrollment(courseId, studentId)).rejects.toThrow(EndpointTypeMismatchError);
  });

  it("rejects a missing / inactive endpoint", async () => {
    await expect(assertEnrollment(studentId, "ghost" as Uuid)).rejects.toThrow(
      UnknownRelationshipEndpointError,
    );
  });

  it("supersedes an edge, keeping the prior version and asserting the next", async () => {
    const v1 = await assertEnrollment(studentId, courseId);
    const v2 = await svc.supersede(TENANT, v1.id, { validFrom: "2026-03-01T00:00:00.000Z" });
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    const prior = await svc.getById(TENANT, v1.id);
    expect(prior.status).toBe("superseded"); // kept, not deleted
    const all = await svc.listForEntity(TENANT, studentId);
    expect(all).toHaveLength(2); // digital memory: both versions retained
  });

  it("refuses to supersede an edge onto an endpoint that is no longer active", async () => {
    const v1 = await assertEnrollment(studentId, courseId);
    await entitySvc.archive(TENANT, courseId); // target retired after the edge was asserted
    await expect(svc.supersede(TENANT, v1.id)).rejects.toThrow(UnknownRelationshipEndpointError);
  });
});
