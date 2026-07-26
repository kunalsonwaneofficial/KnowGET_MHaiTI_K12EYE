import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const intField = z.number().int();

const hostelType = z.enum(["boys", "girls", "mixed"]);
const wardenRole = z.enum(["chief_warden", "warden", "assistant_warden"]);
const roomType = z.enum(["single", "double", "triple", "dormitory"]);
const outpassType = z.enum(["day", "overnight", "weekend", "home", "emergency"]);
const presenceMark = z.enum(["present", "late", "on_leave", "absent"]);
const inspectionType = z.enum(["fire_safety", "hygiene", "electrical", "structural", "security"]);
const inspectionOutcome = z.enum(["compliant", "action_required", "non_compliant"]);

// --- Hostel ----------------------------------------------------------------------
export const createHostelSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  type: hostelType,
});
export const renameHostelSchema = z.object({ name: nonEmpty });
export const assignWardenSchema = z.object({ wardenId: uuid });

// --- Warden ----------------------------------------------------------------------
export const registerWardenSchema = z.object({ employeeId: uuid, role: wardenRole });
export const setWardenRoleSchema = z.object({ role: wardenRole });

// --- Room ------------------------------------------------------------------------
const bedInput = z.object({ key: nonEmpty, label: nonEmpty });
export const createRoomSchema = z.object({
  hostelId: uuid,
  roomNumber: nonEmpty,
  type: roomType,
  floor: intField.nullable().optional(),
  beds: z.array(bedInput).optional(),
});
export const addBedSchema = bedInput;
export const setFloorSchema = z.object({ floor: intField.nullable() });

// --- Bed allocation --------------------------------------------------------------
export const createAllocationSchema = z.object({
  roomId: uuid,
  bedKey: nonEmpty,
  studentId: uuid,
  effectiveFrom: nonEmpty,
});
export const endAllocationSchema = z.object({ effectiveTo: nullableText.optional() });

// --- Outpass ---------------------------------------------------------------------
export const requestOutpassSchema = z.object({
  studentId: uuid,
  type: outpassType,
  expectedOutAt: nonEmpty,
  expectedInAt: nonEmpty,
  reason: nullableText.optional(),
});
export const approveOutpassSchema = z.object({ approvedBy: uuid });
export const checkOutOutpassSchema = z.object({ actualOutAt: nonEmpty.optional() });
export const returnOutpassSchema = z.object({ actualInAt: nonEmpty.optional() });

// --- Roll call -------------------------------------------------------------------
export const scheduleRollCallSchema = z.object({ hostelId: uuid, scheduledFor: nonEmpty });
export const markRollCallSchema = z.object({
  residentId: uuid,
  mark: presenceMark,
  notedAt: nonEmpty,
});

// --- Hostel inspection -----------------------------------------------------------
export const recordInspectionSchema = z.object({
  hostelId: uuid,
  type: inspectionType,
  conductedOn: nonEmpty,
  outcome: inspectionOutcome,
  nextDueOn: nonEmpty,
  inspector: nullableText.optional(),
  notes: nullableText.optional(),
});
export const reinspectSchema = z.object({
  conductedOn: nonEmpty,
  outcome: inspectionOutcome,
  nextDueOn: nonEmpty,
  inspector: nullableText.optional(),
});
export const setInspectionNotesSchema = z.object({ notes: nullableText });

// --- Hostel occupancy profile ----------------------------------------------------
export const refreshOccupancySchema = z.object({ hostelId: uuid });
