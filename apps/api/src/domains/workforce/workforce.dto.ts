import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableUuid = uuid.nullable();
const nullableText = z.string().nullable();

// --- Shared enums (mirror the @knowget/workforce value objects) ------------------
const employmentType = z.enum([
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "visiting",
  "intern",
]);
const leaveType = z.enum([
  "annual",
  "sick",
  "casual",
  "maternity",
  "paternity",
  "bereavement",
  "sabbatical",
  "unpaid",
]);

// --- Department ------------------------------------------------------------------
export const createDepartmentSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  parentDepartmentId: nullableUuid.optional(),
  costCenter: nullableText.optional(),
  description: nullableText.optional(),
});
export const renameDepartmentSchema = z.object({ name: nonEmpty });
export const setCostCenterSchema = z.object({ costCenter: nullableText });
export const setDescriptionSchema = z.object({ description: nullableText });
export const assignHeadSchema = z.object({ headEmployeeId: nullableUuid });
export const reparentSchema = z.object({ parentDepartmentId: nullableUuid });

// --- Position --------------------------------------------------------------------
export const createPositionSchema = z.object({
  departmentId: uuid,
  code: nonEmpty,
  title: nonEmpty,
  employmentType,
  headcount: z.number().int().positive().optional(),
  grade: nullableText.optional(),
  description: nullableText.optional(),
});
export const retitleSchema = z.object({ title: nonEmpty });
export const setHeadcountSchema = z.object({ headcount: z.number().int().positive() });
export const setGradeSchema = z.object({ grade: nullableText });

// --- Employee --------------------------------------------------------------------
export const onboardEmployeeSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  employeeNumber: nonEmpty,
  employmentType,
  departmentId: nullableUuid.optional(),
  positionId: nullableUuid.optional(),
  hireDate: nullableText.optional(),
});
export const assignDepartmentSchema = z.object({ departmentId: nullableUuid });
export const assignPositionSchema = z.object({ positionId: nullableUuid });
export const setEmploymentTypeSchema = z.object({ employmentType });
export const exitSchema = z.object({ exitDate: nullableText.optional() });

// --- Employment contract ---------------------------------------------------------
export const issueContractSchema = z.object({
  employeeId: uuid,
  employmentType,
  startDate: nonEmpty,
  grade: nullableText.optional(),
  endDate: nullableText.optional(),
  terms: nullableText.optional(),
});
export const setEndDateSchema = z.object({ endDate: nullableText });
export const setTermsSchema = z.object({ terms: nullableText });

// --- Leave -----------------------------------------------------------------------
export const grantEntitlementSchema = z.object({
  employeeId: uuid,
  leaveType,
  period: nonEmpty,
  entitledDays: z.number().nonnegative(),
});
export const reviseEntitlementSchema = z.object({ entitledDays: z.number().nonnegative() });
export const requestLeaveSchema = z.object({
  employeeId: uuid,
  leaveType,
  days: z.number().positive(),
  startDate: nonEmpty,
  period: z.string().min(1).optional(),
  endDate: nullableText.optional(),
  reason: nullableText.optional(),
});
export const decideLeaveSchema = z.object({ decidedBy: nullableUuid.optional() });

// --- Performance review ----------------------------------------------------------
const rating = z.number().min(1).max(5);
export const draftReviewSchema = z.object({
  employeeId: uuid,
  period: nonEmpty,
  reviewerId: nullableUuid.optional(),
  overallRating: rating.nullable().optional(),
  summary: nullableText.optional(),
  strengths: nullableText.optional(),
  improvements: nullableText.optional(),
});
export const setRatingSchema = z.object({ overallRating: rating.nullable() });
export const setNarrativeSchema = z.object({
  summary: nullableText.optional(),
  strengths: nullableText.optional(),
  improvements: nullableText.optional(),
});

// --- Workforce profile -----------------------------------------------------------
export const refreshProfileSchema = z.object({
  asOf: nonEmpty,
  period: z.string().min(1).optional(),
});
