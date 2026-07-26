import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createApplication,
  isApplicationOffered,
  offerApplication,
  rejectApplication,
  scheduleApplicationInterview,
  startApplicationReview,
  withdrawApplication,
} from "./application";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const cycleId = "44444444-4444-4444-4444-444444444444" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  createApplication({
    tenantId,
    organizationId,
    cycleId,
    applicantPersonId,
    code: "APP-1",
    gradeApplyingFor: "G1",
    submittedOn: "2026-11-01",
  });

describe("Application", () => {
  it("submits and runs submitted → under_review → interview → offered", () => {
    let a = make();
    expect(a.status).toBe("submitted");
    a = startApplicationReview(a);
    a = scheduleApplicationInterview(a);
    a = offerApplication(a, "2026-12-01");
    expect(isApplicationOffered(a)).toBe(true);
    expect(a.decidedOn).toBe("2026-12-01");
  });

  it("rejects/withdraws only from an open state and cannot offer from submitted", () => {
    expect(() => offerApplication(make(), "d")).toThrow(/cannot move/);
    const rejected = rejectApplication(startApplicationReview(make()), "2026-12-01");
    expect(rejected.status).toBe("rejected");
    expect(() => withdrawApplication(rejected, "d")).toThrow(/cannot move/);
  });

  it("rejects an empty code or grade, each blaming the right field", () => {
    expect(() =>
      createApplication({
        tenantId,
        organizationId,
        cycleId,
        applicantPersonId,
        code: " ",
        gradeApplyingFor: "G1",
        submittedOn: "d",
      }),
    ).toThrow(/non-empty code/);
    expect(() =>
      createApplication({
        tenantId,
        organizationId,
        cycleId,
        applicantPersonId,
        code: "A",
        gradeApplyingFor: " ",
        submittedOn: "d",
      }),
    ).toThrow(/non-empty grade/);
  });
});
