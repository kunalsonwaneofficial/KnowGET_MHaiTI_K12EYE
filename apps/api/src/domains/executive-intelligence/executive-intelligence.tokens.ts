/** Dependency-injection tokens for Executive Intelligence, Governance & Institutional Command (P2-D29). */

// Repositories (Prisma/RLS adapters over the executive-intelligence ports).
export const EI_KPI_DEFINITION_REPOSITORY = Symbol("EI_KPI_DEFINITION_REPOSITORY");
export const EI_KPI_READING_REPOSITORY = Symbol("EI_KPI_READING_REPOSITORY");
export const EI_INDEX_DEFINITION_REPOSITORY = Symbol("EI_INDEX_DEFINITION_REPOSITORY");
export const EI_ASSESSMENT_REPOSITORY = Symbol("EI_ASSESSMENT_REPOSITORY");
export const EI_DASHBOARD_REPOSITORY = Symbol("EI_DASHBOARD_REPOSITORY");
export const EI_BRIEFING_REPOSITORY = Symbol("EI_BRIEFING_REPOSITORY");
export const EI_ATTENTION_ITEM_REPOSITORY = Symbol("EI_ATTENTION_ITEM_REPOSITORY");

// Cross-domain read ports. The organization directory is the usual node check (P2-D01-M01); the evidence
// directory is what makes the contract's third rule real, resolving a citation through whichever store its kind
// names — Assessment & Evaluation (P2-D10), Knowledge Graph (P2-D25), Decision Intelligence (P2-D27) and
// Predictive Intelligence (P2-D28), with the graph behind everything else.
export const EI_ORGANIZATION_DIRECTORY = Symbol("EI_ORGANIZATION_DIRECTORY");
export const EI_EVIDENCE_DIRECTORY = Symbol("EI_EVIDENCE_DIRECTORY");

// Application services.
export const EI_KPI_DEFINITION_SERVICE = Symbol("EI_KPI_DEFINITION_SERVICE");
export const EI_KPI_READING_SERVICE = Symbol("EI_KPI_READING_SERVICE");
export const EI_INDEX_DEFINITION_SERVICE = Symbol("EI_INDEX_DEFINITION_SERVICE");
export const EI_ASSESSMENT_SERVICE = Symbol("EI_ASSESSMENT_SERVICE");
export const EI_DASHBOARD_SERVICE = Symbol("EI_DASHBOARD_SERVICE");
export const EI_BRIEFING_SERVICE = Symbol("EI_BRIEFING_SERVICE");
export const EI_ATTENTION_ITEM_SERVICE = Symbol("EI_ATTENTION_ITEM_SERVICE");
