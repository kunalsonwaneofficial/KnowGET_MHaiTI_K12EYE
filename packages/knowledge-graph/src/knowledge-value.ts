/**
 * Value objects for the Institutional Knowledge Graph (P2-D25). Keys, statuses, methods and tiers are the
 * vocabulary of the semantic layer; they are TEXT in the store and closed unions here. The ontology is
 * extensible at the type level (entity-type and relationship-type *keys* are open strings a tenant registers),
 * but the lifecycle statuses, the assertion methods, the relationship cardinalities and the subject kinds are
 * fixed — they are the graph's structural grammar, not its content.
 */

/** The lifecycle of an ontology type (entity type or relationship type): drafted, active, then deprecated. */
export const TYPE_STATUSES = ["draft", "active", "deprecated"] as const;
export type TypeStatus = (typeof TYPE_STATUSES)[number];

/** The relationship-type cardinality — the shape a relationship type is allowed to take between entities. */
export const CARDINALITIES = ["one_to_one", "one_to_many", "many_to_one", "many_to_many"] as const;
export type Cardinality = (typeof CARDINALITIES)[number];

/**
 * The lifecycle of a knowledge entity (a graph node): active, merged into a canonical twin (identity
 * resolution — the digital memory keeps the merge), or archived. `merged` and `archived` are terminal.
 */
export const ENTITY_STATUSES = ["active", "merged", "archived"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

/**
 * The lifecycle of a semantic relationship (a graph edge): asserted (the live version), superseded by a newer
 * version (versioned digital memory), or retracted (withdrawn). `superseded` and `retracted` are terminal.
 */
export const RELATIONSHIP_STATUSES = ["asserted", "superseded", "retracted"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/**
 * How an assertion came to be — its epistemic method. `observed` (seen in a source system) and `declared`
 * (stated by a person/authority) are *grounded*: they bottom out an evidence chain. `derived` (computed by a
 * rule from other assertions) and `inferred` (concluded, weaker) are *ungrounded*: they must cite what they
 * were derived from, or they are not explainable.
 */
export const ASSERTION_METHODS = ["observed", "declared", "derived", "inferred"] as const;
export type AssertionMethod = (typeof ASSERTION_METHODS)[number];

/** The grounded methods — an assertion made this way needs no antecedents to be explainable. */
export const GROUNDED_METHODS: readonly AssertionMethod[] = ["observed", "declared"];

/** Whether a method is grounded (bottoms out an evidence chain on its own). */
export const isGroundedMethod = (method: AssertionMethod): boolean =>
  GROUNDED_METHODS.includes(method);

/** The lifecycle of an assertion: asserted (standing) or retracted (withdrawn). Content is immutable. */
export const ASSERTION_STATUSES = ["asserted", "retracted"] as const;
export type AssertionStatus = (typeof ASSERTION_STATUSES)[number];

/** What an assertion is about — a graph node or a graph edge. */
export const SUBJECT_KINDS = ["entity", "relationship"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/** The confidence bounds — an integer 0–100 index, never a probability float. */
export const MIN_CONFIDENCE = 0;
export const MAX_CONFIDENCE = 100;

/** Clamp a confidence to the 0–100 integer band. */
export const clampConfidence = (value: number): number =>
  Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.floor(value)));
