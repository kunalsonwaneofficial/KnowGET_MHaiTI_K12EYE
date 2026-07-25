import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const intNonNeg = z.number().int().nonnegative();
const intPositive = z.number().int().positive();
const minuteOfDay = z.number().int().min(0).max(1439);

const direction = z.enum(["pickup", "drop", "both"]);
const vehicleType = z.enum(["bus", "minibus", "van", "car"]);
const ownership = z.enum(["owned", "contracted"]);
const documentType = z.enum(["insurance", "fitness", "permit", "pollution", "road_tax"]);
const tripEventType = z.enum(["boarded", "alighted"]);

// --- Vehicle ---------------------------------------------------------------------
export const createVehicleSchema = z.object({
  organizationId: uuid,
  registrationNumber: nonEmpty,
  type: vehicleType,
  seatingCapacity: intPositive,
  ownership,
  make: nullableText.optional(),
  model: nullableText.optional(),
});
export const setCapacitySchema = z.object({ seatingCapacity: intPositive });
export const setMakeModelSchema = z.object({ make: nullableText, model: nullableText });

// --- Driver ----------------------------------------------------------------------
export const registerDriverSchema = z.object({
  employeeId: uuid,
  licenseNumber: nonEmpty,
  licenseExpiry: nonEmpty,
  licenseClass: nullableText.optional(),
});
export const renewLicenseSchema = z.object({
  licenseExpiry: nonEmpty,
  licenseNumber: nonEmpty.optional(),
});
export const setLicenseClassSchema = z.object({ licenseClass: nullableText });

// --- Route -----------------------------------------------------------------------
const routeStopInput = z.object({
  key: nonEmpty,
  name: nonEmpty,
  offsetMinutes: intNonNeg,
  landmark: nullableText.optional(),
});
export const draftRouteSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  direction,
  departureMinutes: minuteOfDay,
  stops: z.array(routeStopInput).optional(),
});
export const renameRouteSchema = z.object({ name: nonEmpty });
export const setDepartureSchema = z.object({ departureMinutes: minuteOfDay });
export const addRouteStopSchema = routeStopInput;

// --- Vehicle assignment ----------------------------------------------------------
export const createAssignmentSchema = z.object({
  routeId: uuid,
  vehicleId: uuid,
  driverId: uuid,
  effectiveFrom: nonEmpty,
});
export const endAssignmentSchema = z.object({ effectiveTo: nullableText.optional() });

// --- Transport subscription ------------------------------------------------------
export const requestSubscriptionSchema = z.object({
  studentId: uuid,
  routeId: uuid,
  pickupStopKey: nonEmpty,
  dropStopKey: nonEmpty,
  direction,
  effectiveFrom: nonEmpty,
});
export const endSubscriptionSchema = z.object({ effectiveTo: nullableText.optional() });

// --- Trip ------------------------------------------------------------------------
export const scheduleTripSchema = z.object({
  routeId: uuid,
  vehicleId: uuid,
  driverId: uuid,
  serviceDate: nonEmpty,
  direction,
});
export const recordBoardingSchema = z.object({
  studentId: uuid,
  stopKey: nonEmpty,
  type: tripEventType,
  occurredAt: nonEmpty,
});

// --- Vehicle document ------------------------------------------------------------
export const recordDocumentSchema = z.object({
  vehicleId: uuid,
  type: documentType,
  documentNumber: nonEmpty,
  issuedOn: nonEmpty,
  expiresOn: nonEmpty,
  notes: nullableText.optional(),
});
export const renewDocumentSchema = z.object({
  documentNumber: nonEmpty,
  issuedOn: nonEmpty,
  expiresOn: nonEmpty,
});
export const setDocumentNotesSchema = z.object({ notes: nullableText });
