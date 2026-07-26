import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  closeRelationship,
  createSemanticRelationship,
  markSuperseded,
  retractRelationship,
  supersedeRelationship,
} from "./semantic-relationship";
import {
  InvalidRelationshipWindowError,
  InvalidSemanticRelationshipTransitionError,
  SelfRelationshipError,
} from "./errors";

const base = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  relationshipTypeKey: "Enrolled_In",
  sourceEntityId: "e-student" as Uuid,
  targetEntityId: "e-course" as Uuid,
  validFrom: "2026-01-01T00:00:00.000Z",
};

describe("SemanticRelationship aggregate", () => {
  it("creates an asserted version-1 edge with a normalized type and open window", () => {
    const r = createSemanticRelationship(base);
    expect(r.status).toBe("asserted");
    expect(r.version).toBe(1);
    expect(r.supersedesId).toBeNull();
    expect(r.relationshipTypeKey).toBe("enrolled_in");
    expect(r.validTo).toBeNull();
  });

  it("rejects a self-edge and an inverted window", () => {
    expect(() =>
      createSemanticRelationship({ ...base, targetEntityId: base.sourceEntityId }),
    ).toThrow(SelfRelationshipError);
    expect(() =>
      createSemanticRelationship({ ...base, validTo: "2025-01-01T00:00:00.000Z" }),
    ).toThrow(InvalidRelationshipWindowError);
  });

  it("closes the window while staying asserted", () => {
    const r = closeRelationship(createSemanticRelationship(base), "2026-06-01T00:00:00.000Z");
    expect(r.status).toBe("asserted");
    expect(r.validTo).toBe("2026-06-01T00:00:00.000Z");
  });

  it("retracts an asserted edge (terminal)", () => {
    const r = retractRelationship(createSemanticRelationship(base));
    expect(r.status).toBe("retracted");
    expect(() => retractRelationship(r)).toThrow(InvalidSemanticRelationshipTransitionError);
  });

  it("supersedes into a next version pointing at the prior", () => {
    const v1 = createSemanticRelationship(base);
    const v2 = supersedeRelationship(v1, { validFrom: "2026-02-01T00:00:00.000Z" });
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.status).toBe("asserted");
    expect(v2.sourceEntityId).toBe(v1.sourceEntityId);
    // the prior is marked superseded separately (the service does both)
    expect(markSuperseded(v1).status).toBe("superseded");
  });

  it("cannot supersede or close a non-asserted edge", () => {
    const retracted = retractRelationship(createSemanticRelationship(base));
    expect(() => supersedeRelationship(retracted)).toThrow(
      InvalidSemanticRelationshipTransitionError,
    );
    expect(() => closeRelationship(retracted, "2026-06-01")).toThrow(
      InvalidSemanticRelationshipTransitionError,
    );
  });
});
