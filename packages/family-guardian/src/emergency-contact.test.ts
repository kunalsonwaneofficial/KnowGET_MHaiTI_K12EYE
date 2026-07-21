import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  archiveEmergencyContact,
  recordContactAttempt,
  registerEmergencyContact,
  setAuthorizations,
  setPriority,
  setRelationshipLabel,
} from "./emergency-contact";
import {
  EmergencyContactArchivedError,
  EmptyEmergencyRelationshipError,
  InvalidEmergencyPriorityError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const PERSON = "44444444-4444-4444-4444-444444444444" as Uuid;

const base = () =>
  registerEmergencyContact({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    personId: PERSON,
    priority: 1,
    relationshipLabel: "Aunt",
  });

describe("EmergencyContact aggregate", () => {
  it("registers an active, prioritized contact with no authorizations by default", () => {
    const c = base();
    expect(c.status).toBe("active");
    expect(c.priority).toBe(1);
    expect(c.relationshipLabel).toBe("Aunt");
    expect(c.authorizations).toEqual({ pickup: false, medical: false });
    expect(c.contactHistory).toEqual([]);
  });

  it("rejects an empty relationship label or a non-positive priority", () => {
    expect(() =>
      registerEmergencyContact({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        personId: PERSON,
        priority: 1,
        relationshipLabel: "  ",
      }),
    ).toThrow(EmptyEmergencyRelationshipError);
    expect(() =>
      registerEmergencyContact({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        personId: PERSON,
        priority: 0,
        relationshipLabel: "Aunt",
      }),
    ).toThrow(InvalidEmergencyPriorityError);
  });

  it("updates priority, label and authorizations", () => {
    let c = setPriority(base(), 2);
    expect(c.priority).toBe(2);
    expect(() => setPriority(c, 0)).toThrow(InvalidEmergencyPriorityError);
    c = setRelationshipLabel(c, "Uncle");
    expect(c.relationshipLabel).toBe("Uncle");
    expect(() => setRelationshipLabel(c, "  ")).toThrow(EmptyEmergencyRelationshipError);
    c = setAuthorizations(c, { pickup: true });
    expect(c.authorizations).toEqual({ pickup: true, medical: false });
  });

  it("appends contact attempts to an immutable history", () => {
    let c = recordContactAttempt(base(), { outcome: "no_answer" });
    c = recordContactAttempt(c, { outcome: "reached", note: "  spoke to aunt  " });
    expect(c.contactHistory).toHaveLength(2);
    expect(c.contactHistory[0]?.outcome).toBe("no_answer");
    expect(c.contactHistory[1]?.note).toBe("spoke to aunt");
  });

  it("archives and blocks further modification", () => {
    const archived = archiveEmergencyContact(base());
    expect(archived.status).toBe("archived");
    expect(() => setPriority(archived, 3)).toThrow(EmergencyContactArchivedError);
    expect(() => archiveEmergencyContact(archived)).toThrow(EmergencyContactArchivedError);
  });
});
