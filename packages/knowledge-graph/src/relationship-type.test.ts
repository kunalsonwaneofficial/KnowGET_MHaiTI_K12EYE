import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateRelationshipType,
  createRelationshipType,
  deprecateRelationshipType,
  setRelationshipCardinality,
} from "./relationship-type";
import {
  EmptyRelationshipTypeKeyError,
  EmptyRelationshipTypeLabelError,
  InvalidRelationshipTypeTransitionError,
} from "./errors";

const base = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  key: "Guardian_Of",
  label: "guardian of",
  sourceEntityTypeKey: "Person",
  targetEntityTypeKey: "person",
  cardinality: "many_to_many" as const,
};

describe("RelationshipType aggregate", () => {
  it("normalizes its key and endpoint keys and starts draft", () => {
    const t = createRelationshipType(base);
    expect(t.key).toBe("guardian_of");
    expect(t.sourceEntityTypeKey).toBe("person");
    expect(t.targetEntityTypeKey).toBe("person");
    expect(t.status).toBe("draft");
  });

  it("rejects empty key, label or endpoint keys", () => {
    expect(() => createRelationshipType({ ...base, key: " " })).toThrow(
      EmptyRelationshipTypeKeyError,
    );
    expect(() => createRelationshipType({ ...base, label: " " })).toThrow(
      EmptyRelationshipTypeLabelError,
    );
    expect(() => createRelationshipType({ ...base, sourceEntityTypeKey: " " })).toThrow(
      EmptyRelationshipTypeKeyError,
    );
  });

  it("activates and deprecates through the lifecycle", () => {
    const active = activateRelationshipType(createRelationshipType(base));
    expect(active.status).toBe("active");
    expect(deprecateRelationshipType(active).status).toBe("deprecated");
  });

  it("can change cardinality while not deprecated, not after", () => {
    const t = setRelationshipCardinality(createRelationshipType(base), "one_to_many");
    expect(t.cardinality).toBe("one_to_many");
    const dep = deprecateRelationshipType(t);
    expect(() => setRelationshipCardinality(dep, "one_to_one")).toThrow(
      InvalidRelationshipTypeTransitionError,
    );
  });
});
