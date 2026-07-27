# 44. Institutional Knowledge Graph: one package, six aggregates, four pure engines, an evidence chain on every assertion, no LLM/vector/RAG — and Program E opened

- **Status:** Accepted
- **Date:** 2026-12-26
- **Contract:** P2-D25 (Institutional Knowledge Graph, Semantic Intelligence & Digital Memory)

## Context

P2-D25 is **the first contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, and the full operational base **D01–D24** now complete. Program E has a
strict dependency chain: the knowledge graph is the **semantic layer every later intelligence domain builds
on** — the AI operating system (P2-D26) retrieves knowledge from here, decision intelligence (P2-D27) and
predictive intelligence (P2-D28) reason over it, executive intelligence (P2-D29) rolls it up. It is the
institution's **digital memory**: the entities the institution knows about, the versioned, time-aware
relationships between them, and — the defining rule — the **evidence chain behind every assertion**.

Two boundaries define the contract. First, and decisively, **LLMs, agents, vector embeddings and RAG are
deferred _out_ of D25** into the later intelligence domains (P2-D26+). D25 is the _structural, semantic and
provenance_ layer — a graph with an ontology, temporal edges, and an explainable evidence chain — not a model
runtime. Nothing in the package imports, references or implements embeddings, vectors, an LLM, RAG or an agent.
Second, **the graph never re-models the operational domains**: a knowledge entity _references_ a domain record
(a person, a student, a course) by `sourceDomain` + `sourceRef`, opaquely; the domains own their records, the
graph owns the semantic layer over them. As with every domain (ADR-0010), the package imports no other domain
package; the only cross-domain coupling is the organization owner, through an injected directory port.

Three further decisions shape the design. First, several quantities are **derived, not stored** — which edges
were live at a time, an entity's neighbourhood and degree, an assertion's explanation and evidence-capped
confidence, a graph's summary — so, as with every operational domain, the design **begins with the pure
engines** that compute them, not with an aggregate. Second, the contract's **defining rule is enforced
structurally**: every assertion must carry an evidence chain and be explainable, so the assertion aggregate
refuses to exist without evidence and the provenance engine is the arbiter of explainability. Third, the graph
is **time-aware and versioned** — a relationship is never overwritten; it is superseded into a new version or
retracted, and the prior is kept — because a _memory_ that forgets its own history is not a memory.

## Decision

1. **Four pure engines are the computational core, built and tested first.** The **temporal engine**
   (`isValidAt`, `resolveAsOf`, `liveRelationships`, `latestVersion`) answers "what did the graph assert at time
   T?" over versioned, time-stamped edges — clock-free, the instant supplied by the caller, end-exclusive,
   fail-safe on unparseable stamps. The **traversal engine** (`neighborhood`, `degreeOf`, `connectedEntityIds`,
   `reachableWithin`) is plain graph structure — out/in neighbourhood, degree, a bounded (terminating) reachable
   set. The **provenance engine** (`explain`, `isExplainable`, `evidenceChain`, `aggregateConfidence`,
   `effectiveConfidence`) is the enforcement of the defining rule: it builds the derivation tree back to
   grounded facts, cuts cycles and marks missing/retracted antecedents, decides explainability, and caps a
   conclusion's confidence at its **weakest evidence** (chosen because the result always points at a specific
   weakest antecedent — an explainable rule, not a black box). The **metrics engine** (`summarizeGraph`,
   `entityMemory`) is descriptive counts only — degree, per-type tallies, grounded/derived split, aggregate
   confidence over standing assertions. Nothing predictive (forecasting is P2-D28); nothing calls a model.

2. **One pure package, `@knowget/knowledge-graph`, six aggregates.** Two form the **extensible ontology** —
   `EntityType` (the node classes) and `RelationshipType` (the edge classes, with the source/target entity-type
   constraints that are the graph's structural grammar). Two form the **graph** — `KnowledgeEntity` (a node with
   a global id, referencing a domain record, with `active → merged | archived` identity resolution) and
   `SemanticRelationship` (a directed, **versioned, time-aware** edge, `asserted → superseded | retracted`). One
   is the **evidence chain** — `Assertion` (an **immutable** claim about an entity or relationship, by a method,
   with a confidence and its evidence/antecedents). One is the **digital memory** — `EntityMemory`, a
   re-derivable per-entity read model maintained by the refresh spine.

3. **Every assertion carries an evidence chain and is explainable — enforced at two layers.** The aggregate
   refuses to create a _grounded_ (observed/declared) assertion without an evidence source, and a
   _derived/inferred_ one without at least one cited antecedent. The service additionally requires every cited
   antecedent to be a **standing** assertion, so the chain never dangles. The provenance engine treats a
   retracted or absent antecedent as withdrawn, so retracting a fact breaks the explainability (and collapses
   the confidence to zero) of everything derived from it. Explainability is thus a property the store preserves,
   not a label anything can claim.

4. **The graph is time-aware and versioned — a memory keeps its history.** A relationship carries a
   `validFrom`/`validTo` window and a `version` + `supersedesId`. Superseding it marks the prior version
   `superseded` (kept, not deleted) and stores a new asserted version; the temporal engine resolves which
   versions were live at any instant. Identity resolution merges a node into a canonical twin (`mergedIntoId`),
   keeping the merged node rather than deleting it. The digital memory is re-derivable — nothing in it is
   authored.

5. **The API splits along the graph's two surfaces.** `ontology:*` gates the schema (entity types, relationship
   types — a governed, administrative surface); `knowledge:*` gates the content (entities, relationships,
   assertions with an `/explain` provenance endpoint, and the memory spine: refresh / live view / neighbourhood
   / graph-summary). Six FORCE-RLS tables, tenant-isolated; the composition-root Prisma adapters carry the RLS.

6. **Events carry structure, never content.** The `knowledge.*` events carry ids, ontology keys, statuses and
   counts only — never a label, a description, or the asserted **predicate/value**. A downstream intelligence
   domain (P2-D26+) reacts to a graph change and resolves the content within-tenant if it needs it; it never
   receives the content in the event.

## Consequences

- The later intelligence domains have a **single semantic layer to build on**: entities with global ids,
  time-aware relationships, and — the part most systems get wrong — an **evidence chain on every assertion**, so
  P2-D26's agents retrieve knowledge that is explainable by construction, and P2-D27's recommendations can ship
  the evidence the contract demands.
- Deferring LLMs/vectors/RAG keeps D25 a **stable, testable, deterministic** core: 81 pure/unit tests, no model,
  no non-determinism. When P2-D26 adds the runtime, it adds it _over_ this layer, not _into_ it.
- The advisory/soft-reference deferrals are recorded as **TD-45** (relationship-type cardinality is stored but
  not enforced on assert; merge identity-resolution is single-hop; the supersede versioning and the ontology/
  entity uniqueness are service-guarded, DB-backed for the absolute uniques). None weakens an absolute
  invariant.
- **Program D is behind us and Program E is open.** Next is P2-D26 — Enterprise AI Operating System, Agent
  Orchestration & Reasoning — which will invoke capabilities (never databases directly) and retrieve knowledge
  from here.

## Alternatives considered

- **A property graph in a graph database (Neo4j/AGE).** Rejected for now: the platform's multi-tenancy,
  auditing and RLS discipline live in PostgreSQL, and the graph's scale here is institutional (thousands of
  entities per tenant), well within a relational adjacency model. A native graph store is a later option behind
  the repository ports.
- **Storing embeddings / a vector index alongside entities.** Rejected — explicitly out of contract. Vectors and
  RAG belong to the later intelligence domains, over this layer.
- **Mutable relationships (overwrite in place).** Rejected — it destroys the digital memory. Versioning +
  time-windows keep the history the intelligence core depends on.
- **Assertions as free-form key/value with no provenance.** Rejected — it is the exact anti-pattern the contract
  forbids. The evidence chain is the point.
