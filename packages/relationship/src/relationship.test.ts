import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidRelationshipStatusTransitionError, SelfRelationshipError } from "./errors";
import { fromRole, isSymmetricKind, toRole } from "./kind";
import {
  counterpart,
  createRelationship,
  endRelationship,
  isActiveRelationship,
  type Relationship,
} from "./relationship";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const GUARDIAN = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const OTHER = "44444444-4444-4444-4444-444444444444" as Uuid;

const guardianOf = (): Relationship =>
  createRelationship({
    tenantId: TENANT,
    fromPersonId: GUARDIAN,
    toPersonId: STUDENT,
    kind: "guardian",
  });

describe("relationship kinds", () => {
  it("knows which kinds are symmetric and the role each side plays", () => {
    expect(isSymmetricKind("sibling")).toBe(true);
    expect(isSymmetricKind("guardian")).toBe(false);
    expect(fromRole("guardian")).toBe("guardian");
    expect(toRole("guardian")).toBe("dependent");
    expect(fromRole("sibling")).toBe("sibling");
  });
});

describe("relationship — creation & lifecycle", () => {
  it("creates an active relationship", () => {
    const rel = guardianOf();
    expect(rel.status).toBe("active");
    expect(isActiveRelationship(rel)).toBe(true);
    expect(rel.fromPersonId).toBe(GUARDIAN);
    expect(rel.toPersonId).toBe(STUDENT);
  });

  it("rejects a self-relationship", () => {
    expect(() =>
      createRelationship({
        tenantId: TENANT,
        fromPersonId: GUARDIAN,
        toPersonId: GUARDIAN,
        kind: "sibling",
      }),
    ).toThrow(SelfRelationshipError);
  });

  it("ends a relationship and records the end date, rejecting a re-end", () => {
    const ended = endRelationship(guardianOf(), "2030-06-01");
    expect(ended.status).toBe("ended");
    expect(ended.endDate).toBe("2030-06-01");
    expect(() => endRelationship(ended)).toThrow(InvalidRelationshipStatusTransitionError);
  });
});

describe("relationship — counterpart", () => {
  it("resolves the other person and their role from each side", () => {
    const rel = guardianOf();
    expect(counterpart(rel, STUDENT)).toEqual({ personId: GUARDIAN, role: "guardian" });
    expect(counterpart(rel, GUARDIAN)).toEqual({ personId: STUDENT, role: "dependent" });
    expect(counterpart(rel, OTHER)).toBeNull();
  });

  it("uses the shared role for symmetric kinds", () => {
    const rel = createRelationship({
      tenantId: TENANT,
      fromPersonId: GUARDIAN,
      toPersonId: STUDENT,
      kind: "sibling",
    });
    expect(counterpart(rel, GUARDIAN)?.role).toBe("sibling");
    expect(counterpart(rel, STUDENT)?.role).toBe("sibling");
  });
});
