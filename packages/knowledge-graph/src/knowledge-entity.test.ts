import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveKnowledgeEntity,
  canonicalIdOf,
  createKnowledgeEntity,
  isKnowledgeEntityActive,
  mergeKnowledgeEntity,
  relabelKnowledgeEntity,
} from "./knowledge-entity";
import {
  EmptyEntitySourceError,
  InvalidKnowledgeEntityTransitionError,
  SelfMergeError,
} from "./errors";

const base = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  entityTypeKey: "Person",
  sourceDomain: "Person",
  sourceRef: "person-42",
};

describe("KnowledgeEntity aggregate", () => {
  it("creates an active node, normalizing type + source domain", () => {
    const e = createKnowledgeEntity(base);
    expect(e.status).toBe("active");
    expect(e.entityTypeKey).toBe("person");
    expect(e.sourceDomain).toBe("person");
    expect(e.mergedIntoId).toBeNull();
    expect(canonicalIdOf(e)).toBe(e.id);
  });

  it("requires type, source domain and source ref", () => {
    expect(() => createKnowledgeEntity({ ...base, sourceRef: "  " })).toThrow(
      EmptyEntitySourceError,
    );
    expect(() => createKnowledgeEntity({ ...base, entityTypeKey: " " })).toThrow(
      EmptyEntitySourceError,
    );
  });

  it("merges into a canonical twin and reports the canonical id", () => {
    const e = createKnowledgeEntity(base);
    const merged = mergeKnowledgeEntity(e, "canonical-1" as Uuid);
    expect(merged.status).toBe("merged");
    expect(merged.mergedIntoId).toBe("canonical-1");
    expect(canonicalIdOf(merged)).toBe("canonical-1");
    expect(isKnowledgeEntityActive(merged)).toBe(false);
  });

  it("refuses to merge a node into itself", () => {
    const e = createKnowledgeEntity(base);
    expect(() => mergeKnowledgeEntity(e, e.id)).toThrow(SelfMergeError);
  });

  it("cannot merge or archive a non-active node", () => {
    const merged = mergeKnowledgeEntity(createKnowledgeEntity(base), "c1" as Uuid);
    expect(() => mergeKnowledgeEntity(merged, "c2" as Uuid)).toThrow(
      InvalidKnowledgeEntityTransitionError,
    );
    expect(() => archiveKnowledgeEntity(merged)).toThrow(InvalidKnowledgeEntityTransitionError);
  });

  it("archives an active node (terminal)", () => {
    const archived = archiveKnowledgeEntity(createKnowledgeEntity(base));
    expect(archived.status).toBe("archived");
    expect(() => relabelKnowledgeEntity(archived, "x")).toThrow(
      InvalidKnowledgeEntityTransitionError,
    );
  });
});
