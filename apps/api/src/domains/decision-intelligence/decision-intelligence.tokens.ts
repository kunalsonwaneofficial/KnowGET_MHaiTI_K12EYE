/** Dependency-injection tokens for Institutional Decision Intelligence (P2-D27). */

// Repositories (Prisma/RLS adapters over the decision-intelligence ports).
export const DI_RECOMMENDATION_REPOSITORY = Symbol("DI_RECOMMENDATION_REPOSITORY");
export const DI_DECISION_REPOSITORY = Symbol("DI_DECISION_REPOSITORY");
export const DI_WORKFLOW_REPOSITORY = Symbol("DI_WORKFLOW_REPOSITORY");
export const DI_INSTANCE_REPOSITORY = Symbol("DI_INSTANCE_REPOSITORY");
export const DI_RULE_REPOSITORY = Symbol("DI_RULE_REPOSITORY");
export const DI_RUN_REPOSITORY = Symbol("DI_RUN_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, the AI catalog and runtime P2-D26,
// and the knowledge graph P2-D25).
export const DI_ORGANIZATION_DIRECTORY = Symbol("DI_ORGANIZATION_DIRECTORY");
export const DI_CAPABILITY_DIRECTORY = Symbol("DI_CAPABILITY_DIRECTORY");
export const DI_EVIDENCE_SOURCE_DIRECTORY = Symbol("DI_EVIDENCE_SOURCE_DIRECTORY");

// Application services.
export const DI_RECOMMENDATION_SERVICE = Symbol("DI_RECOMMENDATION_SERVICE");
export const DI_DECISION_SERVICE = Symbol("DI_DECISION_SERVICE");
export const DI_WORKFLOW_SERVICE = Symbol("DI_WORKFLOW_SERVICE");
export const DI_WORKFLOW_RUN_SERVICE = Symbol("DI_WORKFLOW_RUN_SERVICE");
export const DI_AUTOMATION_SERVICE = Symbol("DI_AUTOMATION_SERVICE");
export const DI_AUTOMATION_RUN_SERVICE = Symbol("DI_AUTOMATION_RUN_SERVICE");
export const DI_OPERATIONS_SERVICE = Symbol("DI_OPERATIONS_SERVICE");
