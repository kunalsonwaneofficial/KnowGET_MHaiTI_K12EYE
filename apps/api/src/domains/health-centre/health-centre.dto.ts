import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();

const centreType = z.enum(["infirmary", "clinic", "dental", "counselling", "wellness"]);
const clinicianRole = z.enum([
  "physician",
  "nurse",
  "dentist",
  "paramedic",
  "pharmacist",
  "psychologist",
]);
const triageAcuity = z.enum(["routine", "urgent", "emergency"]);
const encounterDisposition = z.enum(["discharged", "referred", "admitted", "follow_up"]);
const referralUrgency = z.enum(["routine", "urgent", "emergency"]);

// --- Health centre (clinic:*) ----------------------------------------------------
export const registerCentreSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  type: centreType,
  sickBayCapacity: count.optional(),
});
export const renameCentreSchema = z.object({ name: nonEmpty });
export const setCapacitySchema = z.object({ capacity: count });
export const assignLeadSchema = z.object({ clinicianId: uuid });

// --- Clinician (clinic:*) --------------------------------------------------------
export const registerClinicianSchema = z.object({
  employeeId: uuid,
  role: clinicianRole,
  registrationNumber: nullableText.optional(),
});
export const setClinicianRoleSchema = z.object({ role: clinicianRole });
export const setRegistrationSchema = z.object({ registrationNumber: nullableText });

// --- Centre profile (clinic:*) ---------------------------------------------------
export const refreshProfileSchema = z.object({ centreId: uuid, asOfDate: nonEmpty });

// --- Appointment (clinical:*) ----------------------------------------------------
export const requestAppointmentSchema = z.object({
  centreId: uuid,
  patientId: uuid,
  scheduledFor: nonEmpty,
  clinicianId: uuid.nullable().optional(),
});
export const scheduleAppointmentSchema = z.object({
  clinicianId: uuid.nullable().optional(),
});
export const rescheduleAppointmentSchema = z.object({ scheduledFor: nonEmpty });

// --- Clinical encounter (clinical:*) ---------------------------------------------
export const openEncounterSchema = z.object({
  centreId: uuid,
  patientId: uuid,
  triageAcuity,
  chiefComplaint: nullableText.optional(),
  clinicianId: uuid.nullable().optional(),
});
export const setTriageSchema = z.object({ triageAcuity });
export const setComplaintSchema = z.object({ chiefComplaint: nullableText });
export const assignEncounterClinicianSchema = z.object({ clinicianId: uuid });
export const recordAssessmentSchema = z.object({ assessment: nullableText });
export const completeEncounterSchema = z.object({ disposition: encounterDisposition });

// --- Prescription (clinical:*) ---------------------------------------------------
export const issuePrescriptionSchema = z.object({
  centreId: uuid,
  patientId: uuid,
  clinicianId: uuid,
  medication: nonEmpty,
  dosage: nullableText.optional(),
  frequencyPerDay: positiveInt,
  durationDays: positiveInt,
  startDate: nonEmpty,
});
export const recordDoseSchema = z.object({ count: positiveInt.optional() });

// --- Sick-bay admission (clinical:*) ---------------------------------------------
export const admitSchema = z.object({
  centreId: uuid,
  patientId: uuid,
  bedLabel: nonEmpty,
  admittedOn: nonEmpty,
  reason: nullableText.optional(),
});
export const dischargeSchema = z.object({ dischargedOn: nonEmpty });

// --- Referral (clinical:*) -------------------------------------------------------
export const raiseReferralSchema = z.object({
  centreId: uuid,
  patientId: uuid,
  referredTo: nonEmpty,
  urgency: referralUrgency,
  raisedOn: nonEmpty,
  reason: nullableText.optional(),
  clinicianId: uuid.nullable().optional(),
});
