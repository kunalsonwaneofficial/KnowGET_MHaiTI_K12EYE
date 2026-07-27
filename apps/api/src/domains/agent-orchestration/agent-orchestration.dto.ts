import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const confidence = z.number().int().min(0).max(100);

const autonomyLevel = z.enum(["advisory", "supervised", "bounded", "autonomous"]);
const toolEffect = z.enum(["read", "write"]);
const riskLevel = z.enum(["low", "medium", "high", "critical"]);
const reversibility = z.enum(["reversible", "compensatable", "irreversible"]);
const traceKind = z.enum(["retrieval", "observation", "inference", "decision"]);

// --- Agent registry (agent:*) ------------------------------------------------------
export const registerAgentSchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  name: nonEmpty,
  autonomyLevel,
  purpose: nullableText.optional(),
});
export const describeAgentSchema = z.object({
  name: nonEmpty.optional(),
  purpose: nullableText.optional(),
});
export const setAutonomySchema = z.object({ autonomyLevel });
export const capabilityKeySchema = z.object({ capabilityKey: nonEmpty });

// --- Capability catalog (agent:*) --------------------------------------------------
export const registerCapabilitySchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  name: nonEmpty,
  capabilityDomain: nonEmpty,
  effect: toolEffect,
  riskLevel,
  reversibility,
  compensationKey: nullableText.optional(),
  requiresApproval: z.boolean().optional(),
  description: nullableText.optional(),
});
export const describeCapabilitySchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
});
export const reclassifyCapabilitySchema = z.object({
  effect: toolEffect.optional(),
  riskLevel: riskLevel.optional(),
  reversibility: reversibility.optional(),
  compensationKey: nullableText.optional(),
  requiresApproval: z.boolean().optional(),
});

// --- Execution plans (ai:*) --------------------------------------------------------
export const draftPlanSchema = z.object({
  organizationId: uuid,
  agentId: uuid,
  goal: nonEmpty,
  reasoningSessionId: uuid.nullable().optional(),
});
export const restateGoalSchema = z.object({ goal: nonEmpty });
export const addPlanStepSchema = z.object({
  capabilityKey: nonEmpty,
  intent: nullableText.optional(),
  dependsOn: z.array(nonEmpty).optional(),
});
export const submitPlanSchema = z.object({ expiresAt: nullableText.optional() });
export const decisionSchema = z.object({ note: nullableText.optional() });
export const stepOutcomeSchema = z.object({ invocationId: uuid });
export const stepFailureSchema = z.object({ invocationId: uuid.nullable().optional() });

// --- Human approval (ai:approve) ---------------------------------------------------
/** Defaulted so a bodyless `POST expire-due` — the common case, meaning "as of now" — parses like any other. */
export const expireDueSchema = z.object({ at: nonEmpty.optional() }).default({});

// --- Tool invocation (ai:*) --------------------------------------------------------
export const authorizeInvocationSchema = z.object({
  organizationId: uuid,
  agentId: uuid,
  capabilityKey: nonEmpty,
  planId: uuid.nullable().optional(),
  stepId: uuid.nullable().optional(),
  ordinal: z.number().int().positive().optional(),
  approvalRequestId: uuid.nullable().optional(),
});
export const requestInvocationApprovalSchema = z.object({
  organizationId: uuid,
  agentId: uuid,
  capabilityKey: nonEmpty,
  stepId: uuid.nullable().optional(),
  expiresAt: nullableText.optional(),
});
export const invocationFailureSchema = z.object({ failureCode: nullableText.optional() });
export const compensateInvocationSchema = z.object({ compensatingInvocationId: uuid });

// --- Reasoning sessions (ai:*) -----------------------------------------------------
export const openSessionSchema = z.object({
  organizationId: uuid,
  agentId: uuid,
  purpose: nonEmpty,
});
export const recordTraceSchema = z.object({
  kind: traceKind,
  statement: nonEmpty,
  knowledgeRefs: z.array(nonEmpty).optional(),
  dependsOn: z.array(nonEmpty).optional(),
  confidence: confidence.optional(),
});
export const retrieveSchema = z.object({
  statement: nonEmpty,
  knowledgeRefs: z.array(nonEmpty),
  confidence: confidence.optional(),
});
export const observeSchema = z.object({
  statement: nonEmpty,
  confidence: confidence.optional(),
});
export const groundedTraceSchema = z.object({
  statement: nonEmpty,
  dependsOn: z.array(nonEmpty),
  confidence: confidence.optional(),
});
export const attachPlanSchema = z.object({ executionPlanId: uuid });
export const concludeSessionSchema = z.object({ conclusion: nonEmpty });
