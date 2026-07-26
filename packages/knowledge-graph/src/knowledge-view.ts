import type { AssertionMethod } from "./knowledge-value";

/**
 * Narrow read views the pure engines operate over. Each is the minimal shape an engine needs — never the full
 * aggregate — so the engines (temporal resolution, traversal, provenance, metrics) are built and tested before
 * any aggregate or store depends on them, exactly as the platform's pure-engine-first discipline requires.
 */

// --- Temporal + traversal --------------------------------------------------------

/**
 * A relationship as the temporal and traversal engines see it: a directed, versioned, time-aware edge. `validTo`
 * null means "still open" (no end). `status` gates whether it is a live assertion.
 */
export interface RelationshipView {
  readonly id: string;
  readonly relationshipTypeKey: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly version: number;
  readonly status: string;
}

/** One end of an entity's neighbourhood — the entity reached, over which relationship type, in which direction. */
export interface NeighborEdge {
  readonly entityId: string;
  readonly relationshipTypeKey: string;
  readonly direction: "out" | "in";
  readonly relationshipId: string;
}

/** An entity's immediate neighbourhood: its out-edges, its in-edges and its degree. */
export interface Neighborhood {
  readonly entityId: string;
  readonly out: readonly NeighborEdge[];
  readonly in: readonly NeighborEdge[];
  readonly degree: number;
}

/** An entity's degree split: out-degree, in-degree, total. */
export interface EntityDegree {
  readonly entityId: string;
  readonly outDegree: number;
  readonly inDegree: number;
  readonly degree: number;
}

// --- Provenance (evidence + explainability) --------------------------------------

/**
 * An assertion as the provenance engine sees it: how it was made, how confident it is, what it was derived from
 * (antecedent assertion ids) and whether it still stands. This is the unit of the evidence chain.
 */
export interface AssertionView {
  readonly id: string;
  readonly method: AssertionMethod;
  readonly confidence: number;
  readonly derivedFrom: readonly string[];
  readonly status: string;
}

/** A node in an explanation tree — an assertion and the (recursively explained) assertions it rests on. */
export interface Explanation {
  readonly id: string;
  readonly method: AssertionMethod;
  readonly confidence: number;
  readonly grounded: boolean;
  readonly derivedFrom: readonly Explanation[];
  /** Set when the walk cut a cycle or hit a missing antecedent — the branch could not be fully explained. */
  readonly unresolved?: "cycle" | "missing";
}

// --- Metrics ---------------------------------------------------------------------

/** A key→count roll-up (entities by type, relationships by type, …). */
export interface KeyCount {
  readonly key: string;
  readonly count: number;
}

/** A descriptive picture of a graph (or a tenant's slice of it) — counts and simple structural indicators. */
export interface GraphSummary {
  readonly entityCount: number;
  readonly relationshipCount: number;
  readonly assertionCount: number;
  readonly entitiesByType: readonly KeyCount[];
  readonly relationshipsByType: readonly KeyCount[];
  readonly groundedAssertions: number;
  readonly derivedAssertions: number;
  readonly averageDegree: number;
}

/**
 * The per-entity "digital memory" the refresh spine persists: how connected the entity is, how much is asserted
 * about it, and how confident that body of assertion is on aggregate. Derived, re-derivable — never authored.
 */
export interface EntityMemoryView {
  readonly outDegree: number;
  readonly inDegree: number;
  readonly degree: number;
  readonly assertionCount: number;
  readonly groundedAssertionCount: number;
  readonly aggregateConfidence: number;
}
