# 21. Institutional Governance Platform: one package, six aggregates, and a reusable approval workflow

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** P2-D02 (Institutional Governance Platform)

## Context

Phase 2 Program A (Identity & Organization) is certified and baselined at `v0.2.0`:
the platform knows who people are, which organization nodes exist, and how people
relate. P2-D02 opens Program B — Institutional Governance — which must make the
platform the **authoritative source for institutional authority, accountability and
governance**: who governs, who approves, who is accountable, which policy applies,
what authority exists, and what decisions were made.

The contract defines a single deliverable (not a set of `M0x` milestones) with six
aggregate roots — Governance Body, Committee, Policy, Delegation of Authority,
Resolution, Governance Calendar — plus a reusable approval-workflow capability and
eight domain events. It must support many governance models (trusts, societies,
school groups, foundations, chains) without redesign, and it must follow the domain
architecture pattern (ADR-0010) on the certified core without touching frozen code.

Two structural questions had to be answered once, up front: **how to package six
tightly-related aggregates**, and **how to satisfy the "reusable workflows" capability**
without a bespoke approval engine.

## Decision

1. **One domain package, `@knowget/governance`, for all six aggregates.** The six
   aggregates form a single bounded context — they share a vocabulary (institutional
   authority), a set of cross-domain ports (Organization/Person directories), and one
   event namespace (`governance.*`). Rather than six micro-packages, the domain is one
   package with a shared spine (`errors.ts`, `ports.ts`, `governance-events.ts`,
   `index.ts`) and a per-aggregate pair of files (`<aggregate>.ts` for the immutable
   aggregate + factory + transition functions, `<aggregate>-service.ts` for the
   application service). Value objects (body type, policy category, authority scope,
   vote decision, event type) are small sibling modules. This keeps the aggregates
   cohesive and cross-referenceable (the calendar references bodies and committees; the
   resolution references a body) without publishing a package graph for one contract.

2. **Governance Body is the root aggregate, governing an Organization node.** A
   governance body attaches to an organization node (`organizationId`) and nests via
   `parentBodyId`, forming the governance hierarchy. Committees optionally report to a
   body; resolutions belong to a body; calendar entries optionally reference a body
   and/or committee. Every aggregate is **tenant-scoped**. The pure package never
   imports `@knowget/organization` or `@knowget/person`; organization- and
   person-existence enter through injected `OrganizationDirectory` / `PersonDirectory`
   ports (ADR-0010's dependency rule), adapted at the composition root over the
   respective services.

3. **Persistence per ADR-0010, with fail-closed tenant isolation on every table.**
   Eight tables (`governance_body`, `_committee`, `_policy`,
   `_policy_acknowledgment`, `_delegation`, `_resolution`, `_calendar_entry`,
   `_approval`) live in the shared `schema.prisma`; Prisma/RLS adapters sit at the
   `apps/api` composition root behind the repository ports (TD-21). Every table has
   `ENABLE` + `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy
   (`tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`, both
   `USING` and `WITH CHECK`), soft-delete and audit columns — verified on live
   PostgreSQL. The **policy-acknowledgment** table is the one intentional exception: an
   immutable, append-only compliance ledger keyed by `(tenant, policy, person, version)`,
   so it carries no audit/soft-delete columns and its `save` is idempotent on that key.

4. **A reusable approval workflow on the frozen Phase-1 engine.** The "Governance
   Workflows" capability is satisfied by **one** `WorkflowDefinition` over
   `@knowget/workflow` — `draft → in_review → approved | rejected`, with a
   `request_changes` loop back to `draft` — instantiated for all four approval kinds
   (policy, committee, resolution, delegation). The approve transition is **guarded for
   segregation of duties** (the decider cannot be the submitter). Each running approval
   is a persisted `GovernanceApproval` (its own FORCE-RLS table) whose append-only
   `history` is the decision audit trail; the `GovernanceApprovalService` is the
   durable, tenant-scoped host of the engine. The engine is reused, not reimplemented,
   and the subject reference is kept **decoupled** (an opaque `kind` + `subjectId`) so
   the same workflow serves every governance subject and, later, other domains.

5. **Eight domain events on the platform bus.** `GovernanceBodyCreated`,
   `CommitteeCreated`, `PolicyPublished`, `PolicyRetired`, `DelegationGranted`,
   `DelegationRevoked`, `ResolutionApproved`, `ResolutionImplemented` are published
   from the owning service transitions via the optional `EventBus` seam (services take
   `Pick<EventBus, "publish">`, so the pure domain stays transport-agnostic).

6. **Permission-gated, tenant-scoped REST.** Seven controllers expose the aggregates
   and the approval workflow under `governance/*`, gated by `governance:read` /
   `governance:write`, tenant-scoped through the caller's principal, with zod-validated
   request bodies mapped to `ValidationError`. Reads are 200, creates 201, other
   mutations 200. The `GovernanceModule` wires the eight repositories, two directories
   and seven services and is registered in the root module; each service token is
   exported for **in-process cross-domain consumption** (the point of the platform:
   finance/procurement will call `DelegationService.authorizes` and
   `PolicyService.listApplicable` rather than reimplement approval or policy logic).

7. **Explicit non-goals.** This platform does not implement student governance,
   academic execution, financial transactions, HR operations or procurement execution.
   It provides the governance capabilities those domains will consume.

## Consequences

- **A unified governance model.** Institutional authority, accountability and decisions
  are modelled once and reused. Future domains consume governance **services** (policy
  applicability, the approval matrix, authority checks, reusable approvals) instead of
  building their own — the contract's definition of done.
- **Reusable approval, one engine.** Four approval types share one state machine and
  one persisted representation; adding a fifth subject is a new `ApprovalKind`, not a
  new workflow. Segregation of duties is enforced centrally.
- **Isolation guaranteed.** Every governance table is FORCE-RLS tenant-isolated and
  fail-closed (no tenant context → zero rows), verified on live PostgreSQL, so a
  governance body, policy or approval never leaks across tenants.
- **Consistent shape across aggregates.** An architecture consistency pass across all
  six aggregates and the approval workflow confirmed symmetric layering, mapping,
  events, permissions, routes and wiring; the one deliberate asymmetry (the
  acknowledgment ledger) is documented at its definition.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition
  root (TD-21, unchanged policy). The approval subject is referenced by `(kind, subjectId)`
  and **not** foreign-key-validated against the four aggregate tables, keeping the
  workflow reusable and decoupled; tightening this to a validated reference later is
  TD-23, behind the `GovernanceApprovalService`.
- **One growing package.** The single-package choice means `@knowget/governance` will
  grow as governance evolves; this is acceptable for a cohesive bounded context and can
  be split later behind the same public barrel if it ever warrants it.
