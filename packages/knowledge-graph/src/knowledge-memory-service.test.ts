import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AssertionService } from "./assertion-service";
import { EntityTypeService } from "./entity-type-service";
import { KnowledgeEntityService } from "./knowledge-entity-service";
import { KnowledgeMemoryService } from "./knowledge-memory-service";
import { RelationshipTypeService } from "./relationship-type-service";
import { SemanticRelationshipService } from "./semantic-relationship-service";
import { EntityMemoryNotFoundError } from "./errors";
import {
  InMemoryAssertionRepository,
  InMemoryEntityMemoryRepository,
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

describe("KnowledgeMemoryService — refresh spine", () => {
  let entities: InMemoryKnowledgeEntityRepository;
  let entityTypes: InMemoryEntityTypeRepository;
  let relTypes: InMemoryRelationshipTypeRepository;
  let rels: InMemorySemanticRelationshipRepository;
  let assertions: InMemoryAssertionRepository;
  let memories: InMemoryEntityMemoryRepository;
  let entitySvc: KnowledgeEntityService;
  let relSvc: SemanticRelationshipService;
  let assertSvc: AssertionService;
  let memorySvc: KnowledgeMemoryService;
  let studentId: Uuid;
  let courseId: Uuid;

  beforeEach(async () => {
    entities = new InMemoryKnowledgeEntityRepository();
    entityTypes = new InMemoryEntityTypeRepository();
    relTypes = new InMemoryRelationshipTypeRepository();
    rels = new InMemorySemanticRelationshipRepository();
    assertions = new InMemoryAssertionRepository();
    memories = new InMemoryEntityMemoryRepository();
    const et = new EntityTypeService({ repository: entityTypes, organizations: orgDir });
    const rt = new RelationshipTypeService({
      repository: relTypes,
      entityTypes,
      organizations: orgDir,
    });
    entitySvc = new KnowledgeEntityService({
      repository: entities,
      entityTypes,
      organizations: orgDir,
    });
    relSvc = new SemanticRelationshipService({
      repository: rels,
      entities,
      relationshipTypes: relTypes,
    });
    assertSvc = new AssertionService({
      repository: assertions,
      entities,
      relationships: rels,
      organizations: orgDir,
    });
    memorySvc = new KnowledgeMemoryService({ memories, entities, relationships: rels, assertions });

    await et.create({ tenantId: TENANT, organizationId: ORG, key: "student", label: "Student" });
    await et.create({ tenantId: TENANT, organizationId: ORG, key: "course", label: "Course" });
    await rt.create({
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
    await relSvc.assert({
      tenantId: TENANT,
      organizationId: ORG,
      relationshipTypeKey: "enrolled_in",
      sourceEntityId: studentId,
      targetEntityId: courseId,
    });
    await assertSvc.make({
      tenantId: TENANT,
      organizationId: ORG,
      subjectKind: "entity",
      subjectId: studentId,
      predicate: "gpa",
      value: "3.5",
      method: "observed",
      confidence: 88,
      evidenceSource: "sis:1",
    });
  });

  it("refreshes and persists a digital memory derived from the graph", async () => {
    const mem = await memorySvc.refreshForEntity(TENANT, studentId);
    expect(mem.outDegree).toBe(1); // student → course
    expect(mem.inDegree).toBe(0);
    expect(mem.degree).toBe(1);
    expect(mem.assertionCount).toBe(1);
    expect(mem.groundedAssertionCount).toBe(1);
    expect(mem.aggregateConfidence).toBe(88);
    // persisted + re-derivable (a second refresh keeps identity)
    const again = await memorySvc.refreshForEntity(TENANT, studentId);
    expect(again.id).toBe(mem.id);
  });

  it("serves a live neighbourhood without persisting", async () => {
    const n = await memorySvc.neighborhoodForEntity(TENANT, studentId);
    expect(n.out.map((e) => e.entityId)).toEqual([courseId]);
    expect(n.degree).toBe(1);
    await expect(memorySvc.getForEntity(TENANT, studentId)).rejects.toThrow(
      EntityMemoryNotFoundError,
    );
  });

  it("summarizes the tenant graph", async () => {
    const s = await memorySvc.graphSummary(TENANT);
    expect(s.entityCount).toBe(2);
    expect(s.relationshipCount).toBe(1);
    expect(s.assertionCount).toBe(1);
    expect(s.relationshipsByType).toEqual([{ key: "enrolled_in", count: 1 }]);
  });

  it("reflects a retracted edge in the refreshed memory", async () => {
    const before = await memorySvc.refreshForEntity(TENANT, studentId);
    expect(before.outDegree).toBe(1);
    const edge = (await relSvc.listForEntity(TENANT, studentId))[0];
    await relSvc.retract(TENANT, edge!.id);
    const after = await memorySvc.refreshForEntity(TENANT, studentId);
    expect(after.outDegree).toBe(0); // retracted edge no longer counts
    expect(after.degree).toBe(0);
  });
});
