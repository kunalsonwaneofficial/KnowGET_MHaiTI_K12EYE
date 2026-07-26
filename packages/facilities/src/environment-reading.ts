import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidReadingValueError } from "./errors";
import type { SensorMetric } from "./facilities-value";

/**
 * An environment reading — an immutable, append-only telemetry fact: a single numeric sample of a metric
 * (temperature, humidity, CO₂, occupancy, energy or water) captured by a sensor in a space at a moment in
 * time. It structurally satisfies the comfort engine's `MetricReadingView` (its `metric` and `value`), so
 * the latest reading per (space, metric) feeds the pure comfort assessment. It has no lifecycle — once
 * recorded, a reading never changes. The organization, building, space and metric are derived from the
 * sensor; the value is a plain number (never money).
 */
export interface EnvironmentReading {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId: Uuid;
  readonly sensorId: Uuid;
  readonly metric: SensorMetric;
  readonly value: number;
  readonly unit: string | null;
  readonly recordedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordReadingParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId: Uuid;
  readonly sensorId: Uuid;
  readonly metric: SensorMetric;
  readonly value: number;
  readonly unit?: string | null;
  readonly recordedAt: string;
}

/**
 * Record an environment reading. The value must be a finite number. Immutable: there is no update path — a
 * correction is a new reading, never an edit of an old one.
 */
export function recordReading(params: RecordReadingParams): EnvironmentReading {
  if (!Number.isFinite(params.value)) {
    throw new InvalidReadingValueError(params.value);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    spaceId: params.spaceId,
    sensorId: params.sensorId,
    metric: params.metric,
    value: params.value,
    unit: params.unit?.trim() || null,
    recordedAt: params.recordedAt,
    createdAt: now,
    updatedAt: now,
  };
}

/** The comfort-engine view a reading satisfies — its metric and value. */
export const readingView = (
  reading: EnvironmentReading,
): { readonly metric: string; readonly value: number } => ({
  metric: reading.metric,
  value: reading.value,
});
