/** Dependency-injection tokens for the Institutional Knowledge Graph (P2-D25). */

// Repositories (Prisma/RLS adapters over the knowledge-graph ports).
export const KG_ENTITY_TYPE_REPOSITORY = Symbol("KG_ENTITY_TYPE_REPOSITORY");
export const KG_RELATIONSHIP_TYPE_REPOSITORY = Symbol("KG_RELATIONSHIP_TYPE_REPOSITORY");
export const KG_ENTITY_REPOSITORY = Symbol("KG_ENTITY_REPOSITORY");
export const KG_RELATIONSHIP_REPOSITORY = Symbol("KG_RELATIONSHIP_REPOSITORY");
export const KG_ASSERTION_REPOSITORY = Symbol("KG_ASSERTION_REPOSITORY");
export const KG_MEMORY_REPOSITORY = Symbol("KG_MEMORY_REPOSITORY");

// Cross-domain read port (directory over Organization P2-D01-M01).
export const KG_ORGANIZATION_DIRECTORY = Symbol("KG_ORGANIZATION_DIRECTORY");

// Application services.
export const KG_ENTITY_TYPE_SERVICE = Symbol("KG_ENTITY_TYPE_SERVICE");
export const KG_RELATIONSHIP_TYPE_SERVICE = Symbol("KG_RELATIONSHIP_TYPE_SERVICE");
export const KG_ENTITY_SERVICE = Symbol("KG_ENTITY_SERVICE");
export const KG_RELATIONSHIP_SERVICE = Symbol("KG_RELATIONSHIP_SERVICE");
export const KG_ASSERTION_SERVICE = Symbol("KG_ASSERTION_SERVICE");
export const KG_MEMORY_SERVICE = Symbol("KG_MEMORY_SERVICE");
