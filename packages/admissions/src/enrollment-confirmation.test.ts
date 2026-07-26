import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { confirmEnrollment } from "./enrollment-confirmation";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const offerId = "33333333-3333-3333-3333-333333333333" as Uuid;
const applicationId = "44444444-4444-4444-4444-444444444444" as Uuid;
const cycleId = "55555555-5555-5555-5555-555555555555" as Uuid;
const applicantPersonId = "66666666-6666-6666-6666-666666666666" as Uuid;
const studentId = "77777777-7777-7777-7777-777777777777" as Uuid;

const base = {
  tenantId,
  organizationId,
  offerId,
  applicationId,
  cycleId,
  applicantPersonId,
  gradeConfirmed: "G1",
  confirmedOn: "2026-12-20",
};

describe("EnrollmentConfirmation", () => {
  it("confirms an enrollment carrying the offer/application/cycle references, with no student by default", () => {
    const c = confirmEnrollment(base);
    expect(c.id).toBeTruthy();
    expect(c.offerId).toBe(offerId);
    expect(c.applicationId).toBe(applicationId);
    expect(c.cycleId).toBe(cycleId);
    expect(c.applicantPersonId).toBe(applicantPersonId);
    expect(c.gradeConfirmed).toBe("G1");
    expect(c.studentId).toBeNull();
    expect(c.confirmedOn).toBe("2026-12-20");
    expect(c.createdAt).toBe(c.updatedAt);
  });

  it("records a Student Lifecycle reference when one is supplied at confirmation", () => {
    const c = confirmEnrollment({ ...base, studentId });
    expect(c.studentId).toBe(studentId);
  });
});
