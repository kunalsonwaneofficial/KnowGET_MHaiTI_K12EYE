import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AssertionService } from "./assertion-service";
import { UnknownAssertionSubjectError, UnknownDerivedFromError } from "./errors";
import {
  InMemoryAssertionRepository,
  InMemoryKnowledgeEntityRepository,
  InMemorySemanticRelationshipRepository,
  type OrganizationDirectory,
} from "./ports";
import { createKnowledgeEntity } from "./knowledge-entity";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_t, id) {
    return id === ORG;
  },
};

describe("AssertionService — evidence chain enforcement", () => {
  let assertions: InMemoryAssertionRepository;
  let entities: InMemoryKnowledgeEntityRepository;
  let relationships: InMemorySemanticRelationshipRepository;
  let svc: AssertionService;
  let subjectId: Uuid;

  beforeEach(async () => {
    assertions = new InMemoryAssertionRepository();
    entities = new InMemoryKnowledgeEntityRepository();
    relationships = new InMemorySemanticRelationshipRepository();
    svc = new AssertionService({
      repository: assertions,
      entities,
      relationships,
      organizations: orgDir,
    });
    const e = createKnowledgeEntity({
      tenantId: TENANT,
      organizationId: ORG,
      entityTypeKey: "student",
      sourceDomain: "student",
      sourceRef: "s1",
    });
    await entities.save(e);
    subjectId = e.id;
  });

  const observe = (predicate: string, value: string, confidence = 90) =>
    svc.make({
      tenantId: TENANT,
      organizationId: ORG,
      subjectKind: "entity",
      subjectId,
      predicate,
      value,
      method: "observed",
      confidence,
      evidenceSource: "sis:1",
    });

  it("rejects an assertion about a subject that does not exist", async () => {
    await expect(
      svc.make({
        tenantId: TENANT,
        organizationId: ORG,
        subjectKind: "entity",
        subjectId: "ghost" as Uuid,
        predicate: "gpa",
        value: "3.9",
        method: "observed",
        confidence: 90,
        evidenceSource: "sis:1",
      }),
    ).rejects.toThrow(UnknownAssertionSubjectError);
  });

  it("rejects a derived assertion citing an antecedent that is not standing", async () => {
    await expect(
      svc.make({
        tenantId: TENANT,
        organizationId: ORG,
        subjectKind: "entity",
        subjectId,
        predicate: "at_risk",
        value: "true",
        method: "derived",
        confidence: 80,
        derivedFrom: ["ghost" as Uuid],
      }),
    ).rejects.toThrow(UnknownDerivedFromError);
  });

  it("builds and explains a real evidence chain", async () => {
    const gpa = await observe("gpa", "2.1", 90);
    const attendance = await observe("attendance", "72", 80);
    const atRisk = await svc.make({
      tenantId: TENANT,
      organizationId: ORG,
      subjectKind: "entity",
      subjectId,
      predicate: "at_risk",
      value: "true",
      method: "derived",
      confidence: 100,
      derivedFrom: [gpa.id, attendance.id],
    });
    const report = await svc.explainAssertion(TENANT, atRisk.id);
    expect(report.explainable).toBe(true);
    expect([...report.evidenceChain].sort()).toEqual([attendance.id, gpa.id].sort());
    expect(report.effectiveConfidence).toBe(80); // capped at the weakest evidence (attendance=80)
  });

  it("retracting an antecedent breaks the derived conclusion's explainability", async () => {
    const gpa = await observe("gpa", "2.1", 90);
    const atRisk = await svc.make({
      tenantId: TENANT,
      organizationId: ORG,
      subjectKind: "entity",
      subjectId,
      predicate: "at_risk",
      value: "true",
      method: "derived",
      confidence: 100,
      derivedFrom: [gpa.id],
    });
    expect((await svc.explainAssertion(TENANT, atRisk.id)).explainable).toBe(true);
    await svc.retract(TENANT, gpa.id);
    const after = await svc.explainAssertion(TENANT, atRisk.id);
    expect(after.explainable).toBe(false); // its only evidence was withdrawn
    expect(after.effectiveConfidence).toBe(0);
  });
});
