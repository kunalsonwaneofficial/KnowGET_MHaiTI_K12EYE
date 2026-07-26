import type {
  AdmissionFunnel,
  ApplicationStageSummary,
  ApplicationStageView,
  FunnelCountsView,
  StageCount,
} from "./admissions-view";

/** A conversion rate — the part over the whole, clamped and capped to 0–100; an empty whole reads 0%. */
const rate = (part: number, whole: number): number =>
  whole > 0 ? Math.round((Math.min(Math.max(0, part), whole) / whole) * 100) : 0;

/**
 * The pure funnel engine — values the admissions funnel: the stage counts (leads → applications → offers →
 * enrollments) and the conversion rate between each adjacent pair, plus the overall lead → enrollment rate.
 * Each rate is capped at 100 (a stage cannot convert more than the one before it) and empty-safe. Pure,
 * deterministic and clock-free. Built and tested before any aggregate depends on it.
 */
export function computeAdmissionFunnel(counts: FunnelCountsView): AdmissionFunnel {
  const leadCount = Math.max(0, counts.leadCount);
  const applicationCount = Math.max(0, counts.applicationCount);
  const offerCount = Math.max(0, counts.offerCount);
  const enrollmentCount = Math.max(0, counts.enrollmentCount);
  return {
    leadCount,
    applicationCount,
    offerCount,
    enrollmentCount,
    leadToApplicationPercent: rate(applicationCount, leadCount),
    applicationToOfferPercent: rate(offerCount, applicationCount),
    offerToEnrollmentPercent: rate(enrollmentCount, offerCount),
    overallConversionPercent: rate(enrollmentCount, leadCount),
  };
}

/**
 * The pure application-stage engine — tallies a set of applications into a per-status distribution and a
 * total. Pure and deterministic.
 */
export function summarizeApplicationStages(
  applications: readonly ApplicationStageView[],
): ApplicationStageSummary {
  const counts = new Map<string, number>();
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }
  const stages: StageCount[] = [...counts.entries()].map(([status, count]) => ({ status, count }));
  return { total: applications.length, stages };
}
