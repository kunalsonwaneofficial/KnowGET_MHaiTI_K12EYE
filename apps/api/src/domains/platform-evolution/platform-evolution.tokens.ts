/** Dependency-injection tokens for Platform Evolution, Institutional Learning & Continuous Improvement (P2-D30). */

// Repositories (Prisma/RLS adapters over the platform-evolution ports).
export const PE_SIGNAL_REPOSITORY = Symbol("PE_SIGNAL_REPOSITORY");
export const PE_INITIATIVE_REPOSITORY = Symbol("PE_INITIATIVE_REPOSITORY");
export const PE_DECISION_REPOSITORY = Symbol("PE_DECISION_REPOSITORY");
export const PE_LESSON_REPOSITORY = Symbol("PE_LESSON_REPOSITORY");
export const PE_CYCLE_REPOSITORY = Symbol("PE_CYCLE_REPOSITORY");
export const PE_ASSESSMENT_REPOSITORY = Symbol("PE_ASSESSMENT_REPOSITORY");
export const PE_ADOPTION_REVIEW_REPOSITORY = Symbol("PE_ADOPTION_REVIEW_REPOSITORY");

// Cross-domain read ports. Organization and person are the usual node checks (P2-D01-M01, P2-D01-M02); the
// evidence directory resolves a citation through whichever store its kind names; and the memory directory is the
// one the contract's first clause turns on, answering from the institutional knowledge graph (P2-D25) whether a
// lesson's memory commitment has resolved — the single fact that lets a lesson become `retained`.
export const PE_ORGANIZATION_DIRECTORY = Symbol("PE_ORGANIZATION_DIRECTORY");
export const PE_PERSON_DIRECTORY = Symbol("PE_PERSON_DIRECTORY");
export const PE_EVIDENCE_DIRECTORY = Symbol("PE_EVIDENCE_DIRECTORY");
export const PE_MEMORY_DIRECTORY = Symbol("PE_MEMORY_DIRECTORY");

// Application services.
export const PE_SIGNAL_SERVICE = Symbol("PE_SIGNAL_SERVICE");
export const PE_INITIATIVE_SERVICE = Symbol("PE_INITIATIVE_SERVICE");
export const PE_DECISION_SERVICE = Symbol("PE_DECISION_SERVICE");
export const PE_LESSON_SERVICE = Symbol("PE_LESSON_SERVICE");
export const PE_CYCLE_SERVICE = Symbol("PE_CYCLE_SERVICE");
export const PE_ASSESSMENT_SERVICE = Symbol("PE_ASSESSMENT_SERVICE");
export const PE_ADOPTION_REVIEW_SERVICE = Symbol("PE_ADOPTION_REVIEW_SERVICE");
