import type { ComfortBand } from "./facilities-value";
import type { ComfortAssessment, ComfortThreshold, MetricReadingView } from "./facilities-view";

/**
 * The pure comfort engine — assesses a space's latest environment readings against the acceptable per-metric
 * ranges (from the comfort policy): a reading below `min` or above `max` breaches that metric. The band is
 * `comfortable` (no breaches), `marginal` (one) or `poor` (two or more); metrics with no configured
 * threshold are never a breach. Pure and deterministic. Built and tested before any aggregate depends on
 * it.
 */
export function computeComfortIndex(
  readings: readonly MetricReadingView[],
  thresholds: readonly ComfortThreshold[],
): ComfortAssessment {
  const byMetric = new Map<string, ComfortThreshold>();
  for (const threshold of thresholds) {
    byMetric.set(threshold.metric, threshold);
  }
  const breaching = new Set<string>();
  for (const reading of readings) {
    const threshold = byMetric.get(reading.metric);
    if (threshold && (reading.value < threshold.min || reading.value > threshold.max)) {
      breaching.add(reading.metric);
    }
  }
  const breachingMetrics = [...breaching];
  const breachCount = breachingMetrics.length;
  const band: ComfortBand =
    breachCount === 0 ? "comfortable" : breachCount === 1 ? "marginal" : "poor";
  return { band, breachingMetrics, readingCount: readings.length, breachCount };
}
