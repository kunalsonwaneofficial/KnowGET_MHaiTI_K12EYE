import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySensorCodeError, InvalidSensorTransitionError } from "./errors";
import type { SensorMetric, SensorStatus } from "./facilities-value";

/**
 * A sensor — a smart-environment device installed in a space, reading a single physical metric
 * (temperature, humidity, CO₂, occupancy, energy or water). It carries a code (unique within the tenant),
 * the metric it reads and an optional unit. It runs `active ↔ inactive → retired`. Only one active sensor
 * is allowed per (space, metric) — service-enforced. The building and organization are derived from the
 * space. Its readings feed the pure comfort engine.
 */
export interface Sensor {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId: Uuid;
  readonly code: string;
  readonly metric: SensorMetric;
  readonly unit: string | null;
  readonly status: SensorStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface InstallSensorParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId: Uuid;
  readonly code: string;
  readonly metric: SensorMetric;
  readonly unit?: string | null;
}

/** Install a sensor (status `active`). Code required. */
export function installSensor(params: InstallSensorParams): Sensor {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptySensorCodeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    spaceId: params.spaceId,
    code,
    metric: params.metric,
    unit: params.unit?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (sensor: Sensor, patch: Partial<Sensor>): Sensor => ({
  ...sensor,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the sensor's unit. */
export const setSensorUnit = (sensor: Sensor, unit: string | null): Sensor =>
  touch(sensor, { unit: unit?.trim() || null });

/** Deactivate an active sensor (→ `inactive`). */
export function deactivateSensor(sensor: Sensor): Sensor {
  if (sensor.status !== "active") {
    throw new InvalidSensorTransitionError(sensor.status, "inactive");
  }
  return touch(sensor, { status: "inactive" });
}

/** Reactivate an inactive sensor (→ `active`). */
export function reactivateSensor(sensor: Sensor): Sensor {
  if (sensor.status !== "inactive") {
    throw new InvalidSensorTransitionError(sensor.status, "active");
  }
  return touch(sensor, { status: "active" });
}

/** Retire a sensor permanently (→ `retired`, terminal). */
export function retireSensor(sensor: Sensor): Sensor {
  if (sensor.status === "retired") {
    throw new InvalidSensorTransitionError(sensor.status, "retired");
  }
  return touch(sensor, { status: "retired" });
}

/** Whether the sensor is active (reporting readings). */
export const isSensorActive = (sensor: Sensor): boolean => sensor.status === "active";
