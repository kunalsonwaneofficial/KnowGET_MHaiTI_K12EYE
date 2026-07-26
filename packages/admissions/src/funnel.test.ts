import { describe, expect, it } from "vitest";
import { computeAdmissionFunnel, summarizeApplicationStages } from "./funnel";

describe("computeAdmissionFunnel", () => {
  it("values stage counts and the conversion rate between each pair", () => {
    const funnel = computeAdmissionFunnel({
      leadCount: 200,
      applicationCount: 100,
      offerCount: 60,
      enrollmentCount: 45,
    });
    expect(funnel.leadToApplicationPercent).toBe(50); // 100/200
    expect(funnel.applicationToOfferPercent).toBe(60); // 60/100
    expect(funnel.offerToEnrollmentPercent).toBe(75); // 45/60
    expect(funnel.overallConversionPercent).toBe(23); // round(45/200*100)
  });

  it("is empty-safe (a zero prior stage reads 0%) and caps each rate at 100", () => {
    expect(
      computeAdmissionFunnel({
        leadCount: 0,
        applicationCount: 0,
        offerCount: 0,
        enrollmentCount: 0,
      }),
    ).toMatchObject({
      leadToApplicationPercent: 0,
      overallConversionPercent: 0,
    });
    // more applications than leads (direct walk-ins) caps at 100, never over
    const funnel = computeAdmissionFunnel({
      leadCount: 10,
      applicationCount: 15,
      offerCount: 0,
      enrollmentCount: 0,
    });
    expect(funnel.leadToApplicationPercent).toBe(100);
  });

  it("clamps negative inputs to zero", () => {
    const funnel = computeAdmissionFunnel({
      leadCount: -5,
      applicationCount: -3,
      offerCount: -1,
      enrollmentCount: -2,
    });
    expect(funnel).toMatchObject({
      leadCount: 0,
      applicationCount: 0,
      offerCount: 0,
      enrollmentCount: 0,
      overallConversionPercent: 0,
    });
  });
});

describe("summarizeApplicationStages", () => {
  it("tallies applications per status", () => {
    const summary = summarizeApplicationStages([
      { status: "submitted" },
      { status: "under_review" },
      { status: "under_review" },
      { status: "offered" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.stages.find((s) => s.status === "under_review")?.count).toBe(2);
    expect(summary.stages.find((s) => s.status === "submitted")?.count).toBe(1);
  });

  it("is empty-safe (no applications ⇒ zero total, no stages)", () => {
    expect(summarizeApplicationStages([])).toEqual({ total: 0, stages: [] });
  });
});
