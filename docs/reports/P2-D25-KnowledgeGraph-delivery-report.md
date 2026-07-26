# Engineering Delivery Report — P2-D25

**Institutional Knowledge Graph, Semantic Intelligence & Digital Memory** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D25 — Institutional Knowledge Graph, Semantic Intelligence & Digital Memory                                                                                                                                                                                                                                                                                                                                                    |
| **Status**     | 🟡 In progress — awaiting CI green + merge to `main`. In-sandbox: `@knowget/knowledge-graph` typecheck/lint/format/build clean, **81 tests** (14 files); `apps/api` typecheck/lint/build clean + knowledge-graph DI-graph spec (2 tests) in the **218-test** api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**265** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M01 (Organization — the ontology / graph-record owner), the full operational base **D01–D24** whose records the graph references by id, P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). Opens **Program E** (D25–D30), a strict dependency chain.                                                                                                                                                                                   |
| **Date**       | 26 December 2026                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Next**       | P2-D26 — Enterprise AI Operating System, Agent Orchestration & Reasoning (second Program E contract)                                                                                                                                                                                                                                                                                                                              |

---

## 1. Mission recap

Deliver the **Institutional Knowledge Graph** — the institution's **semantic layer and digital memory**, and
the **first contract of Program E (the intelligence core)**: the extensible ontology (the entity and
relationship types), the knowledge entities that carry global ids and reference domain records, the directed,
**versioned and time-aware** semantic relationships between them, the **evidence chain** behind every
assertion, and the re-derivable per-entity digital memory. It is the layer every later intelligence domain
builds on (a strict dependency chain: P2-D26 retrieves knowledge from here, D27–D29 reason over it). Two
boundaries define it, and both are held structurally. **First, LLMs, agents, vector embeddings and RAG are
deferred _out_ of this contract** into the later intelligence domains (P2-D26+): D25 is the structural,
semantic and provenance layer, not a model runtime — nothing in the package imports or implements any of them.
**Second, the graph never re-models the operational domains**: an entity references a domain record by
`sourceDomain` + `sourceRef`, opaquely; the domains own their records. The defining rule of the contract —
**every assertion carries an evidence chain and is explainable** — is enforced at both the aggregate and the
provenance engine.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Four pure, deterministic, clock-free engines built and tested first: **temporal** (`isValidAt` / `resolveAsOf` / `liveRelationships` / `latestVersion` — as-of resolution over versioned, time-windowed edges, end-exclusive, fail-safe on bad stamps), **traversal** (`neighborhood` / `degreeOf` / `connectedEntityIds` / `reachableWithin` — neighbourhood, degree, bounded/terminating reachability), **provenance** (`explain` / `isExplainable` / `evidenceChain` / `aggregateConfidence` / `effectiveConfidence` — the derivation tree, the explainability invariant, cycle- and retraction-safe, weakest-link confidence), and **metrics** (`summarizeGraph` / `entityMemory` — descriptive counts, per-type tallies, per-entity digital-memory view) |
| **Domain**      | `@knowget/knowledge-graph` — six aggregates: `EntityType` + `RelationshipType` (the extensible ontology, with the source/target grammar), `KnowledgeEntity` (a node with a global id, `active → merged \| archived` identity resolution), `SemanticRelationship` (a directed, versioned, time-aware edge, `asserted → superseded \| retracted`), `Assertion` (an **immutable** claim carrying method + confidence + evidence + antecedents), and `EntityMemory` (the re-derivable digital-memory read model); each an aggregate + factory + guarded transitions with an application service, plus the `KnowledgeMemoryService` refresh spine. **No LLM/vector/RAG; PII- and content-free events**                                                             |
| **Persistence** | Six models in `schema.prisma` + one migration (`20261226000000_add_knowledge_graph`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; version + confidence + every degree/count **INTEGER**, `derived_from` **UUID[]**, dates/keys/values **TEXT**; the **absolute uniques DB-backed** (type key per tenant; one node per (tenant, source domain, source ref); one memory per (tenant, entity))                                                                                                                                                                                                                                                                                 |
| **API**         | Six Prisma/RLS repositories + six permission-gated controllers under `apps/api/src/domains/knowledge-graph`, split `ontology:*` (entity + relationship types) / `knowledge:*` (entities, relationships, assertions incl. an `/explain` provenance endpoint, and the memory spine: refresh / live / neighbourhood / graph-summary); module wires 6 repos + 1 directory + 6 services; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                            |

## 3. The evidence chain (the defining rule)

Every assertion is a claim (`predicate = value`) about an entity or a relationship, by a **method**. A
_grounded_ assertion (`observed` / `declared`) names where it came from; a _derived_ / `inferred` one cites the
assertions it was concluded from. The rule — **carry evidence, be explainable** — is enforced twice: the
**aggregate** refuses a grounded assertion with no evidence source and a derived one with no antecedents; the
**service** additionally requires every cited antecedent to be a _standing_ assertion, so the chain never
dangles. The **provenance engine** builds the derivation tree back to grounded facts, cuts cycles, marks
missing/retracted antecedents as withdrawn, and caps a conclusion's confidence at its **weakest evidence** —
so retracting a fact breaks the explainability, and zeroes the confidence, of everything derived from it. The
API exposes this at `GET /knowledge/assertions/:id/explain`.

## 4. Quality gates

`@knowget/knowledge-graph`: typecheck / lint / format / build clean, **81 tests** across 14 files (28 engine,
14 ontology, 12 entity/identity, 11 relationship, 13 assertion/provenance, 4 spine, + regressions). `apps/api`:
typecheck / lint / build clean, knowledge-graph DI-graph spec (2 tests) in the **218-test** api suite. Full
monorepo typecheck / lint / tests green (**265** prisma-independent turbo tasks; the Prisma build/`@knowget/database`
integration test are TD-12 in-sandbox). RLS verified on live PostgreSQL 16: all six tables FORCE-RLS
tenant-isolated, unset-tenant sees 0 rows, cross-tenant INSERT rejected (`42501`), business uniques reject
`23505`, and INTEGER + UUID[] round-trip exactly.

## 5. Independent audits

Two independent adversarial audits — a **correctness** audit (the four engines + six aggregates + services) and
a **boundary/evidence-chain** audit (the seven contract mandates) — were clean of functional defects. Both
confirmed: explainability is structurally enforced (no path creates or mislabels an unexplainable assertion);
no LLM/vector/RAG leakage; domain decoupling held (no domain→domain imports); tenancy/RLS held on all six
tables; the ontology grammar is non-bypassable (endpoint types are immutable, so supersede cannot violate it);
metrics are descriptive counts only; no money. Three low/medium notes were polished before merge: the assertion
event payload no longer carries the free-text `predicate` (events stay strictly ids/keys/statuses/counts);
`summarizeGraph` counts only _standing_ assertions (consistent with `entityMemory`); and `supersede`
re-validates active endpoints + a usable type before re-minting a live edge. The remaining deferrals are
recorded as **TD-45**.

## 6. Boundaries & debt

- **LLMs / agents / vector embeddings / RAG are out of contract** — deferred to P2-D26+. Enforced by absence:
  nothing in the package imports or implements them.
- **The graph references, never re-models** — entities point at domain records by `sourceDomain` + `sourceRef`;
  the operational domains (D01–D24) own the records. No domain→domain package import (ADR-0010); only the
  organization owner enters, through a directory port.
- **TD-45 (new).** Relationship-type **cardinality is advisory** (stored, not enforced on `assert` — mirrors the
  advisory-capacity family TD-41/43/44); **merge identity-resolution is single-hop** (`canonicalIdOf` does not
  chase transitive merge chains — a later refinement); the **supersede versioning** and the ontology/entity
  **uniqueness** are service-guarded check-then-act (the absolute uniques are DB-backed; a compare-and-set /
  partial-unique backstop is a later refinement). None weakens an absolute invariant.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via
  the offline path; the six-table migration was verified on live PostgreSQL directly.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the `knowledge.*` events ride the same bus.

## 7. Outcome — pending CI green + merge to `main`, Program E opened

The Institutional Knowledge Graph is complete behind its gates: the semantic layer is a pure, deterministic
core (four engines, six aggregates, 81 tests), every assertion carries an evidence chain and is explainable by
construction, the graph is time-aware and versioned (a memory that keeps its history), and all six tables are
FORCE-RLS tenant-isolated (verified live, INTEGER + UUID[] round-tripping exactly, cross-tenant insert
rejected, absolute uniques rejecting duplicates `23505`); both independent audits were clean of functional
defects (three low/medium notes polished before merge). The branch is pushed and **awaiting CI green**; on
green it merges to `main` as the **first contract of Program E (the intelligence core)** — the semantic layer
the rest of the program builds on — and next is **P2-D26 — Enterprise AI Operating System, Agent Orchestration
& Reasoning**. **Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet
been rotated across the P2-D18…D25 boundaries.
