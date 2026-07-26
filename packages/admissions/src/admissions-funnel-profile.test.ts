import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createAdmissionsFunnelProfile,
  refreshAdmissionsFunnelProfile,
} from "./admissions-funnel-profile";
import { computeAdmissionFunnel } from "./funnel";
import { summarizeIntake } from "./intake";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const cycleId = "33333333-3333-3333-3333-333333333333" as Uuid;

describe("AdmissionsFunnelProfile", () => {
  it("creates an empty profile with every count and rate zero", () => {
    const p = createAdmissionsFunnelProfile({ tenantId, organizationId, cycleId });
    expect(p.cycleId).toBe(cycleId);
    expect(p.leadCount).toBe(0);
    expect(p.applicationCount).toBe(0);
    expect(p.overallConversionPercent).toBe(0);
    expect(p.gradeCount).toBe(0);
    expect(p.fillPercent).toBe(0);
  });

  it("folds the pure-engine outputs into the snapshot, preserving identity", () => {
    const p = createAdmissionsFunnelProfile({ tenantId, organizationId, cycleId });
    const funnel = computeAdmissionFunnel({
      leadCount: 100,
      applicationCount: 40,
      offerCount: 20,
      enrollmentCount: 10,
    });
    const intake = summarizeIntake([
      { capacity: 10, confirmedCount: 6 },
      { capacity: 10, confirmedCount: 4 },
    ]);
    const refreshed = refreshAdmissionsFunnelProfile(p, { funnel, intake });

    expect(refreshed.id).toBe(p.id);
    expect(refreshed.createdAt).toBe(p.createdAt);
    expect(refreshed.leadCount).toBe(100);
    expect(refreshed.applicationCount).toBe(40);
    expect(refreshed.offerCount).toBe(20);
    expect(refreshed.enrollmentCount).toBe(10);
    expect(refreshed.leadToApplicationPercent).toBe(40);
    expect(refreshed.applicationToOfferPercent).toBe(50);
    expect(refreshed.offerToEnrollmentPercent).toBe(50);
    expect(refreshed.overallConversionPercent).toBe(10);
    expect(refreshed.gradeCount).toBe(2);
    expect(refreshed.totalCapacity).toBe(20);
    expect(refreshed.totalConfirmed).toBe(10);
    expect(refreshed.fillPercent).toBe(50);
  });
});
