import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();

const securityLevel = z.enum(["public", "restricted", "secure", "high_security"]);
const visitorType = z.enum(["guest", "parent", "vendor", "contractor", "official", "other"]);
const holderType = z.enum(["employee", "person", "visitor"]);
const incidentCategory = z.enum([
  "theft",
  "trespass",
  "vandalism",
  "altercation",
  "hazard",
  "fire",
  "lost_found",
  "other",
]);
const incidentSeverity = z.enum(["low", "medium", "high", "critical"]);
const drillType = z.enum([
  "fire",
  "lockdown",
  "evacuation",
  "earthquake",
  "shelter_in_place",
  "other",
]);

// --- Access zone (security:*) ----------------------------------------------------
export const createZoneSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  securityLevel,
  capacity: count.optional(),
});
export const renameZoneSchema = z.object({ name: nonEmpty });
export const setSecurityLevelSchema = z.object({ securityLevel });
export const setZoneCapacitySchema = z.object({ capacity: count });

// --- Visitor (visitor:*) ---------------------------------------------------------
export const registerVisitorSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  fullName: nonEmpty,
  type: visitorType,
  phone: nullableText.optional(),
  email: nullableText.optional(),
  company: nullableText.optional(),
});
export const setVisitorTypeSchema = z.object({ type: visitorType });
export const updateVisitorContactSchema = z.object({
  phone: nullableText.optional(),
  email: nullableText.optional(),
  company: nullableText.optional(),
});

// --- Visit (visitor:*) -----------------------------------------------------------
export const requestVisitSchema = z.object({
  visitorId: uuid,
  hostPersonId: uuid,
  zoneId: uuid.nullable().optional(),
  purpose: nullableText.optional(),
  scheduledFor: nonEmpty,
});
export const setVisitZoneSchema = z.object({ zoneId: uuid.nullable() });
export const checkInVisitSchema = z.object({ checkedInAt: nonEmpty });
export const checkOutVisitSchema = z.object({ checkedOutAt: nonEmpty });

// --- Access credential (security:*) ----------------------------------------------
export const issueCredentialSchema = z.object({
  organizationId: uuid,
  credentialNumber: nonEmpty,
  holderType,
  holderId: uuid,
  grantedZoneIds: z.array(uuid).optional(),
  issuedOn: nonEmpty,
  expiresOn: nullableText.optional(),
});
export const credentialZoneSchema = z.object({ zoneId: uuid });
export const setCredentialExpirySchema = z.object({ expiresOn: nullableText });

// --- Access decision (security:*) ------------------------------------------------
export const decideAccessSchema = z.object({
  credentialId: uuid,
  zoneId: uuid,
  pointLabel: nullableText.optional(),
  occurredAt: nonEmpty,
  asOfDate: nullableText.optional(),
});

// --- Security incident (security:*) ----------------------------------------------
export const reportIncidentSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  category: incidentCategory,
  severity: incidentSeverity,
  zoneId: uuid.nullable().optional(),
  reportedByPersonId: uuid.nullable().optional(),
  summary: nonEmpty,
  reportedOn: nonEmpty,
});
export const assignIncidentSchema = z.object({ assigneeId: uuid });
export const setIncidentSeveritySchema = z.object({ severity: incidentSeverity });
export const resolveIncidentSchema = z.object({ resolvedOn: nonEmpty });

// --- Emergency drill (security:*) ------------------------------------------------
export const scheduleDrillSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  type: drillType,
  zoneId: uuid.nullable().optional(),
  conductedById: uuid.nullable().optional(),
  scheduledFor: nonEmpty,
  expectedCount: count.optional(),
});
export const setDrillExpectedSchema = z.object({ expectedCount: count });
export const startDrillSchema = z.object({ startedAt: nonEmpty });
export const recordMusterSchema = z.object({ accountedCount: count });
export const completeDrillSchema = z.object({ completedAt: nonEmpty });

// --- Safety profile (security:*) -------------------------------------------------
export const refreshProfileSchema = z.object({ zoneId: uuid, refreshedAt: nonEmpty });
