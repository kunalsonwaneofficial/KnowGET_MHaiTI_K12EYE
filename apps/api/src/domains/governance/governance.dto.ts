import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const uuid = z.string().uuid();

// --- Governance body --------------------------------------------------------------
const bodyType = z.enum([
  "board_of_trustees",
  "governing_council",
  "school_management_committee",
  "academic_council",
  "finance_committee",
  "executive_committee",
  "other",
]);

export const establishBodySchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  type: bodyType,
  parentBodyId: uuid.optional(),
  termsOfReference: z.string().optional(),
  establishedOn: isoDate.optional(),
});
export const renameBodySchema = z.object({ name: z.string().min(1) });
export const reviseTermsSchema = z.object({ termsOfReference: z.string().nullable() });
export const dissolveBodySchema = z.object({ dissolvedOn: isoDate.optional() });

// --- Committee --------------------------------------------------------------------
const committeeRole = z.enum(["chair", "secretary", "member"]);

export const formCommitteeSchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  governanceBodyId: uuid.optional(),
  purpose: z.string().optional(),
  termsOfReference: z.string().optional(),
});
export const appointMemberSchema = z.object({
  personId: uuid,
  role: committeeRole,
  appointedOn: isoDate.optional(),
});
export const changeRoleSchema = z.object({ role: committeeRole });

// --- Policy -----------------------------------------------------------------------
const policyCategory = z.enum([
  "admission",
  "attendance",
  "examination",
  "hr",
  "procurement",
  "financial",
  "child_protection",
  "it_security",
  "other",
]);

export const authorPolicySchema = z.object({
  organizationId: uuid,
  category: policyCategory,
  title: z.string().min(1),
  ownerId: uuid,
  body: z.string().optional(),
});
export const updateDraftSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});
export const approvePolicySchema = z.object({ approvedOn: isoDate.optional() });
export const publishPolicySchema = z.object({
  effectiveOn: isoDate.optional(),
  publishedOn: isoDate.optional(),
});
export const retirePolicySchema = z.object({ retiredOn: isoDate.optional() });
export const acknowledgePolicySchema = z.object({ personId: uuid });

// --- Delegation -------------------------------------------------------------------
const authorityScope = z.enum([
  "financial",
  "procurement",
  "hr",
  "academic",
  "administrative",
  "admissions",
  "general",
  "other",
]);

export const grantDelegationSchema = z.object({
  organizationId: uuid,
  delegatorId: uuid,
  delegateId: uuid,
  scope: authorityScope,
  effectiveFrom: isoDate,
  description: z.string().optional(),
  monetaryLimit: z.number().int().nonnegative().optional(),
  effectiveUntil: isoDate.optional(),
});
export const revokeDelegationSchema = z.object({
  reason: z.string().optional(),
  revokedOn: isoDate.optional(),
});

// --- Resolution -------------------------------------------------------------------
const voteDecision = z.enum(["for", "against", "abstain"]);

export const draftResolutionSchema = z.object({
  organizationId: uuid,
  governanceBodyId: uuid,
  title: z.string().min(1),
  proposalText: z.string(),
  proposedById: uuid,
});
export const voteSchema = z.object({
  voterId: uuid,
  decision: voteDecision,
  castOn: isoDate.optional(),
});
export const tallyResolutionSchema = z.object({
  effectiveOn: isoDate.optional(),
  decidedOn: isoDate.optional(),
});
export const implementResolutionSchema = z.object({ implementedOn: isoDate.optional() });

// --- Governance calendar ----------------------------------------------------------
const eventType = z.enum([
  "meeting",
  "compliance_deadline",
  "board_activity",
  "regulatory_event",
  "review",
]);

export const scheduleEntrySchema = z.object({
  organizationId: uuid,
  type: eventType,
  title: z.string().min(1),
  scheduledOn: isoDate,
  governanceBodyId: uuid.optional(),
  committeeId: uuid.optional(),
  description: z.string().optional(),
});
export const rescheduleEntrySchema = z.object({ scheduledOn: isoDate });
export const completeEntrySchema = z.object({
  completedOn: isoDate.optional(),
  minutes: z.string().optional(),
  attendeeIds: z.array(uuid).optional(),
});

// --- Approval workflow ------------------------------------------------------------
const approvalKind = z.enum(["policy", "committee", "resolution", "delegation"]);

export const openApprovalSchema = z.object({
  organizationId: uuid,
  kind: approvalKind,
  subjectId: uuid,
  submittedById: uuid,
  note: z.string().optional(),
});
export const decideApprovalSchema = z.object({
  decidedById: uuid,
  note: z.string().optional(),
});
export const requestChangesSchema = z.object({ note: z.string().optional() });
