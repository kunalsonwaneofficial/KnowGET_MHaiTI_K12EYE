/** Dependency-injection tokens for the Enterprise AI Operating System (P2-D26). */

// Repositories (Prisma/RLS adapters over the agent-orchestration ports).
export const AI_AGENT_REPOSITORY = Symbol("AI_AGENT_REPOSITORY");
export const AI_TOOL_REPOSITORY = Symbol("AI_TOOL_REPOSITORY");
export const AI_PLAN_REPOSITORY = Symbol("AI_PLAN_REPOSITORY");
export const AI_APPROVAL_REPOSITORY = Symbol("AI_APPROVAL_REPOSITORY");
export const AI_INVOCATION_REPOSITORY = Symbol("AI_INVOCATION_REPOSITORY");
export const AI_SESSION_REPOSITORY = Symbol("AI_SESSION_REPOSITORY");

// Cross-domain read port (directory over Organization P2-D01-M01).
export const AI_ORGANIZATION_DIRECTORY = Symbol("AI_ORGANIZATION_DIRECTORY");

// Application services.
export const AI_AGENT_SERVICE = Symbol("AI_AGENT_SERVICE");
export const AI_TOOL_SERVICE = Symbol("AI_TOOL_SERVICE");
export const AI_PLAN_SERVICE = Symbol("AI_PLAN_SERVICE");
export const AI_APPROVAL_SERVICE = Symbol("AI_APPROVAL_SERVICE");
export const AI_INVOCATION_SERVICE = Symbol("AI_INVOCATION_SERVICE");
export const AI_REASONING_SERVICE = Symbol("AI_REASONING_SERVICE");
export const AI_OPERATIONS_SERVICE = Symbol("AI_OPERATIONS_SERVICE");
