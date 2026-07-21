import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const communicationChannel = z.enum(["email", "sms", "phone", "app", "postal"]);
const householdRole = z.enum(["head", "parent", "guardian", "child", "dependent", "other"]);
const legalAuthority = z.enum([
  "biological_parent",
  "adoptive_parent",
  "legal_guardian",
  "foster_parent",
  "grandparent",
  "sibling_guardian",
  "court_appointed",
  "institutional",
  "none",
]);
const relationshipType = z.enum([
  "biological_parent",
  "adoptive_parent",
  "legal_guardian",
  "foster_parent",
  "grandparent",
  "sibling",
  "court_appointed_guardian",
  "institutional_guardian",
  "emergency_contact",
  "other",
]);
const consentType = z.enum([
  "academic",
  "medical",
  "media",
  "excursion",
  "technology",
  "data_privacy",
]);
const emergencyOutcome = z.enum(["reached", "no_answer", "left_message", "unreachable"]);
const notificationLevel = z.enum(["high", "normal", "low", "muted"]);
const dayOfWeek = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

// --- Family -----------------------------------------------------------------------
const householdMember = z.object({ personId: uuid, role: householdRole });
const familyAddress = z.object({
  label: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  region: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string(),
  isPrimary: z.boolean(),
});

export const registerFamilySchema = z.object({
  organizationId: uuid,
  familyNumber: z.string().min(1),
  name: z.string().min(1),
  members: z.array(householdMember).optional(),
  preferredLanguage: z.string().optional(),
  preferredChannel: communicationChannel.optional(),
});
export const addMemberSchema = householdMember;
export const setMemberRoleSchema = z.object({ role: householdRole });
export const setPrimaryContactSchema = z.object({ personId: uuid });
export const putAddressSchema = familyAddress;
export const setPreferredCommunicationSchema = z.object({
  preferredLanguage: z.string().nullable().optional(),
  preferredChannel: communicationChannel.nullable().optional(),
});
export const renameFamilySchema = z.object({ name: z.string().min(1) });
export const mergeFamilySchema = z.object({ targetId: uuid });
export const splitFamilySchema = z.object({
  newFamilyNumber: z.string().min(1),
  name: z.string().min(1),
  memberPersonIds: z.array(uuid),
});

// --- Guardian ---------------------------------------------------------------------
const guardianContact = z.object({
  channel: communicationChannel,
  value: z.string().min(1),
  isPrimary: z.boolean(),
});

export const registerGuardianSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  legalAuthority: legalAuthority.optional(),
  contacts: z.array(guardianContact).optional(),
  availabilityNote: z.string().optional(),
});
export const verifyGuardianSchema = z.object({ verifiedOn: isoDate.optional() });
export const updateLegalAuthoritySchema = z.object({ legalAuthority });
export const putGuardianContactSchema = guardianContact;
export const setGuardianAvailabilitySchema = z.object({ note: z.string().nullable() });

// --- Student–Guardian relationship ------------------------------------------------
const responsibilities = z.object({
  legal: z.boolean().optional(),
  educational: z.boolean().optional(),
  financial: z.boolean().optional(),
  pickupAuthorized: z.boolean().optional(),
  medicalAuthorized: z.boolean().optional(),
});

export const linkGuardianSchema = z.object({
  studentId: uuid,
  guardianId: uuid,
  relationshipType,
  responsibilities: responsibilities.optional(),
  emergencyPriority: z.number().int().positive().nullable().optional(),
  effectiveFrom: isoDate.optional(),
});
export const setRelationshipTypeSchema = z.object({ relationshipType });
export const updateResponsibilitiesSchema = responsibilities;
export const setAuthorizationSchema = z.object({ authorized: z.boolean() });
export const setEmergencyPrioritySchema = z.object({
  priority: z.number().int().positive().nullable(),
});
export const endRelationshipSchema = z.object({ effectiveTo: isoDate.optional() });

// --- Consent ----------------------------------------------------------------------
export const grantConsentSchema = z.object({
  studentId: uuid,
  guardianId: uuid,
  consentType,
  policyId: uuid.nullable().optional(),
  note: z.string().optional(),
  effectiveOn: isoDate.optional(),
  expiresOn: isoDate.optional(),
});
export const withdrawConsentSchema = z.object({
  studentId: uuid,
  guardianId: uuid,
  consentType,
  note: z.string().optional(),
  effectiveOn: isoDate.optional(),
});

// --- Emergency contact ------------------------------------------------------------
const emergencyAuthorizations = z.object({
  pickup: z.boolean().optional(),
  medical: z.boolean().optional(),
});

export const registerEmergencyContactSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  personId: uuid,
  priority: z.number().int().positive(),
  relationshipLabel: z.string().min(1),
  phone: z.string().nullable().optional(),
  availabilityNote: z.string().nullable().optional(),
  authorizations: emergencyAuthorizations.optional(),
});
export const setEmergencyPrioritySimpleSchema = z.object({ priority: z.number().int().positive() });
export const setEmergencyAuthorizationsSchema = emergencyAuthorizations;
export const setRelationshipLabelSchema = z.object({ label: z.string().min(1) });
export const setPhoneSchema = z.object({ phone: z.string().nullable() });
export const setEmergencyAvailabilitySchema = z.object({ note: z.string().nullable() });
export const recordAttemptSchema = z.object({
  outcome: emergencyOutcome,
  note: z.string().nullable().optional(),
});

// --- Communication profile --------------------------------------------------------
export const createCommunicationProfileSchema = z.object({
  familyId: uuid,
  preferredLanguage: z.string().optional(),
  preferredChannels: z.array(communicationChannel).optional(),
});
export const setPreferredLanguageSchema = z.object({ language: z.string().nullable() });
export const setPreferredChannelsSchema = z.object({ channels: z.array(communicationChannel) });
export const putScheduleSchema = z.object({
  label: z.string().min(1),
  days: z.array(dayOfWeek),
  fromTime: z.string(),
  toTime: z.string(),
});
export const setNotificationPreferenceSchema = z.object({
  category: z.string().min(1),
  level: notificationLevel,
});
export const setAccessibilitySchema = z.object({ requirements: z.array(z.string()) });

// --- Family intelligence profile --------------------------------------------------
export const createIntelligenceProfileSchema = z.object({ familyId: uuid });
export const updateIndicatorsSchema = z.object({
  engagementLevel: z.enum(["high", "moderate", "low", "disengaged"]).nullable().optional(),
  communicationResponsiveness: z.enum(["responsive", "slow", "unresponsive"]).nullable().optional(),
  participationRate: z.number().min(0).max(1).nullable().optional(),
  consentCompliance: z.enum(["compliant", "partial", "non_compliant"]).nullable().optional(),
});
export const recordInteractionSchema = z.object({
  kind: z.enum([
    "meeting",
    "message",
    "call",
    "event_attendance",
    "form_submission",
    "visit",
    "other",
  ]),
  summary: z.string().min(1),
});
