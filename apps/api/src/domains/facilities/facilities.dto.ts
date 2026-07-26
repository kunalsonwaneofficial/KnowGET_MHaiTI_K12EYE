import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();
const finite = z.number().finite();

const buildingType = z.enum([
  "academic",
  "administrative",
  "laboratory",
  "sports",
  "library",
  "utility",
  "multipurpose",
]);
const spaceType = z.enum([
  "classroom",
  "laboratory",
  "office",
  "hall",
  "storage",
  "restroom",
  "common",
]);
const systemType = z.enum([
  "hvac",
  "electrical",
  "plumbing",
  "elevator",
  "fire_safety",
  "network",
  "water",
]);
const sensorMetric = z.enum(["temperature", "humidity", "co2", "occupancy", "energy", "water"]);
const maintenanceCategory = z.enum(["repair", "inspection", "cleaning", "upgrade", "safety"]);
const maintenancePriority = z.enum(["low", "medium", "high", "urgent"]);

const comfortThreshold = z.object({ metric: sensorMetric, min: finite, max: finite });
const thresholds = z.array(comfortThreshold);

// --- Building (facilities:*) ------------------------------------------------------
export const registerBuildingSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  type: buildingType,
  floors: count.optional(),
});
export const renameBuildingSchema = z.object({ name: nonEmpty });
export const setFloorsSchema = z.object({ floors: count });

// --- Space (facilities:*) ---------------------------------------------------------
export const createSpaceSchema = z.object({
  buildingId: uuid,
  code: nonEmpty,
  type: spaceType,
  floor: count,
  capacity: count.optional(),
});
export const setSpaceTypeSchema = z.object({ type: spaceType });
export const setSpaceCapacitySchema = z.object({ capacity: count });
export const setSpaceFloorSchema = z.object({ floor: count });

// --- Facility system (facilities:*) -----------------------------------------------
export const commissionSystemSchema = z.object({
  buildingId: uuid,
  code: nonEmpty,
  type: systemType,
  commissionedOn: nonEmpty,
  serviceIntervalDays: positiveInt,
  lastServicedOn: nullableText.optional(),
});
export const recordServiceSchema = z.object({ servicedOn: nonEmpty });
export const setIntervalSchema = z.object({ days: positiveInt });

// --- Maintenance order (facilities:*) ---------------------------------------------
export const reportMaintenanceSchema = z.object({
  buildingId: uuid,
  spaceId: uuid.nullable().optional(),
  systemId: uuid.nullable().optional(),
  code: nonEmpty,
  summary: nonEmpty,
  category: maintenanceCategory,
  priority: maintenancePriority,
  reportedOn: nonEmpty,
});
export const assignMaintenanceSchema = z.object({ assigneeId: uuid, assignedOn: nonEmpty });
export const reassignMaintenanceSchema = z.object({ assigneeId: uuid });
export const setMaintenancePrioritySchema = z.object({ priority: maintenancePriority });
export const completeMaintenanceSchema = z.object({ completedOn: nonEmpty });

// --- Facility profile (facilities:*) ----------------------------------------------
export const refreshProfileSchema = z.object({ buildingId: uuid, refreshedAt: nonEmpty });

// --- Sensor (environment:*) -------------------------------------------------------
export const installSensorSchema = z.object({
  spaceId: uuid,
  code: nonEmpty,
  metric: sensorMetric,
  unit: nullableText.optional(),
});
export const setSensorUnitSchema = z.object({ unit: nullableText });

// --- Environment reading (environment:*) ------------------------------------------
export const recordReadingSchema = z.object({
  sensorId: uuid,
  value: finite,
  unit: nullableText.optional(),
  recordedAt: nonEmpty,
});

// --- Comfort policy (environment:*) -----------------------------------------------
export const draftPolicySchema = z.object({
  organizationId: uuid,
  name: nonEmpty,
  version: positiveInt.optional(),
  thresholds: thresholds.optional(),
});
export const setThresholdsSchema = z.object({ thresholds });
export const renamePolicySchema = z.object({ name: nonEmpty });
