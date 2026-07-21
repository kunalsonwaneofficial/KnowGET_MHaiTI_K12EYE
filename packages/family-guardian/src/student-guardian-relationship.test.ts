import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidEmergencyPriorityError, RelationshipEndedError } from "./errors";
import {
  endRelationship,
  isActiveRelationship,
  linkGuardianToStudent,
  setEmergencyPriority,
  setPickupAuthorization,
  setRelationshipType,
  updateResponsibilities,
} from "./student-guardian-relationship";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const GUARDIAN = "44444444-4444-4444-4444-444444444444" as Uuid;

const base = () =>
  linkGuardianToStudent({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    guardianId: GUARDIAN,
    relationshipType: "biological_parent",
  });

describe("StudentGuardianRelationship aggregate", () => {
  it("links a guardian with no responsibilities and an open effective period", () => {
    const r = base();
    expect(r.status).toBe("active");
    expect(isActiveRelationship(r)).toBe(true);
    expect(r.responsibilities).toEqual({
      legal: false,
      educational: false,
      financial: false,
      pickupAuthorized: false,
      medicalAuthorized: false,
    });
    expect(r.emergencyPriority).toBeNull();
    expect(r.effectiveTo).toBeNull();
  });

  it("carries seeded responsibilities and a valid emergency priority", () => {
    const r = linkGuardianToStudent({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      guardianId: GUARDIAN,
      relationshipType: "legal_guardian",
      responsibilities: { legal: true, educational: true },
      emergencyPriority: 1,
    });
    expect(r.responsibilities.legal).toBe(true);
    expect(r.responsibilities.educational).toBe(true);
    expect(r.emergencyPriority).toBe(1);
  });

  it("rejects a non-positive or non-integer emergency priority", () => {
    expect(() => setEmergencyPriority(base(), 0)).toThrow(InvalidEmergencyPriorityError);
    expect(() => setEmergencyPriority(base(), 1.5)).toThrow(InvalidEmergencyPriorityError);
    expect(setEmergencyPriority(base(), null).emergencyPriority).toBeNull();
  });

  it("updates responsibilities, type and pickup authorization", () => {
    let r = updateResponsibilities(base(), { financial: true });
    expect(r.responsibilities.financial).toBe(true);
    r = setRelationshipType(r, "grandparent");
    expect(r.relationshipType).toBe("grandparent");
    r = setPickupAuthorization(r, true);
    expect(r.responsibilities.pickupAuthorized).toBe(true);
  });

  it("ends the relationship and blocks further edits", () => {
    const ended = endRelationship(base(), "2026-06-30");
    expect(ended.status).toBe("ended");
    expect(ended.effectiveTo).toBe("2026-06-30");
    expect(() => setPickupAuthorization(ended, true)).toThrow(RelationshipEndedError);
    expect(() => endRelationship(ended)).toThrow(RelationshipEndedError);
  });
});
