# Engineering Delivery Report — P2-D02

**Institutional Governance Platform (IGP)** · Phase 2 (Enterprise Domain Engineering) · Program B (Institutional Governance)

|                |                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D02 — Institutional Governance Platform                                                                                                  |
| **Status**     | ✅ Complete — gates green (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. CI green (PR #20); merged to `main`. |
| **Depends on** | P2-D01 (Identity & Organization, `v0.2.0`), Phase 1 baseline (`v0.1.0`)                                                                     |
| **Date**       | 18 July 2026                                                                                                                                |
| **Next**       | P2-D03 — Student Lifecycle Intelligence Platform (SLIP)                                                                                     |

---

## 1. Mission recap

Deliver the **Institutional Governance Platform** — the authoritative source for
institutional **authority, accountability and governance**. The platform models
governance bodies, committees, policies, delegations of authority, resolutions and
the governance calendar as one integrated domain, so the institution can answer _who
governs, who approves, who is accountable, which policy applies, what authority
exists,_ and _what decisions were made_ — across any K-12 governance model (trusts,
societies, school groups, foundations, chains) without redesign. Future domains
consume these governance services rather than reimplementing approval or policy logic.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/governance` — six aggregates (GovernanceBody, Committee, Policy, Delegation, Resolution, GovernanceCalendar), each an immutable aggregate + factory + transition functions with an application service; value objects (body type, policy category, authority scope, vote decision, event type); a shared spine (errors, ports + in-memory impls, `governance.*` events, barrel) |
| **Workflows**        | One **reusable approval workflow** over the frozen `@knowget/workflow` engine — `draft → in_review → approved \| rejected` with a `request_changes` loop — instantiated for policy/committee/resolution/delegation approval; segregation-of-duties guard; persisted `GovernanceApproval` with append-only decision history; `GovernanceApprovalService`                                   |
| **Persistence**      | Eight models in `schema.prisma` + two migrations (`add_governance`, `add_governance_approval`), each table **FORCE RLS** + `tenant_isolation`, tenant-indexed, soft-delete + audit columns (acknowledgment excepted — immutable ledger)                                                                                                                                                   |
| **API**              | Seven permission-gated, tenant-scoped REST controllers under `governance/*` (bodies, committees, policies, delegations, resolutions, calendar, approvals); zod DTOs; eight Prisma/RLS adapters + two directory adapters; `GovernanceModule` wiring all repositories, directories and services, registered in the root module                                                              |
| **Events**           | Eight domain events on the platform bus: `GovernanceBodyCreated`, `CommitteeCreated`, `PolicyPublished`, `PolicyRetired`, `DelegationGranted`, `DelegationRevoked`, `ResolutionApproved`, `ResolutionImplemented`                                                                                                                                                                         |
| **Docs & decisions** | ADR-0021 (platform architecture); this report; platform-state, technical-debt and CHANGELOG updates                                                                                                                                                                                                                                                                                       |

## 3. Domain capabilities & invariants

- **Governance structure.** Bodies (board of trustees, governing council, SMC,
  academic/finance/executive committees, other) attach to an organization node and
  nest via `parentBodyId`, forming the governance hierarchy (`children`); lifecycle is
  establish → rename/revise-terms → dissolve. The governed organization and any parent
  body must exist in the tenant.
- **Committee management.** Committees form under an organization (optionally reporting
  to a body), with members holding a single **chair** and single **secretary** (role
  conflict guarded); each member is a Person in the tenant; appoint/remove/change-role,
  revise terms, dissolve.
- **Policy registry.** Policies are **version-controlled**: author → approve → publish →
  retire, with amendment bumping the version back to draft; acknowledgments are recorded
  per `(policy, person, version)`; "which policies apply" returns published policies for
  an organization node. Owner and acknowledger are validated Persons.
- **Delegation management.** Delegated authority (scope + optional monetary limit) flows
  delegator → delegate over an effective window; **no self-delegation**, non-negative
  limit, end ≥ start; the **approval matrix** returns the currently-effective delegations
  for an organization, and `authorizes(person, scope, amount)` answers the decision-support
  question. Grant/revoke publish the audit-trail events.
- **Resolution management.** Formal decisions of a body: draft → open voting → cast votes
  (one per voter) → tally (approved when _for > against_, else rejected) → implement;
  approval and implementation publish events.
- **Governance calendar.** Meetings, compliance deadlines, board activities, regulatory
  events and reviews, optionally tied to a body/committee; completion records minutes and
  **validated attendee Persons**; `upcoming` and per-organization history queries.
- **Reusable approvals.** One workflow serves all four approval kinds; the decider cannot
  be the submitter; the append-only history is the audit trail; the subject is referenced
  opaquely (`kind` + `subjectId`) to keep the workflow reusable.

Every aggregate is tenant-scoped; every cross-domain reference (organization, person)
is validated through an injected directory port, never a package dependency.

## 4. Verification

- **Build / lint / typecheck:** `@knowget/governance` builds and lints clean; `apps/api`
  type-checks against the offline-generated Prisma client and lints clean; formatting
  clean across the domain.
- **Tests:** governance package **73** unit tests (aggregates, services, the approval
  workflow); `apps/api` **166** tests including seven governance controller specs and a
  `GovernanceModule` DI-compilation test that stands up the full provider graph. All green.
- **Live RLS:** all eight governance tables verified on a real PostgreSQL as a
  non-superuser role — `ENABLE` + `FORCE` confirmed, tenant A sees only its rows, a
  no-tenant session sees zero (fail-closed), and a cross-tenant insert is rejected by the
  `WITH CHECK` policy.
- **Architecture consistency pass:** one pass across all six aggregates and the approval
  workflow (RLS, schema↔adapter mapping, events, permissions, routes, module wiring,
  barrel, DTO↔domain enum alignment) — confirmed symmetric; the pass produced three
  refinements (calendar attendee validation; idempotent acknowledgment parity + dead-code
  removal; ledger/approval doc-comments), all landed and re-verified.
- **CI:** the database-package Prisma generate/build and the DB integration tests are
  CI-only in this sandbox (TD-12, environmental); the PR runs them with network access.

## 5. Decisions

- **One package for six aggregates** (ADR-0021 §1): a single bounded context with a shared
  errors/ports/events spine and per-aggregate files, rather than six micro-packages.
- **GovernanceBody as root over an Organization node** (§2), hierarchy via `parentBodyId`;
  cross-domain refs via directory ports only.
- **Reuse the Phase-1 workflow engine** (§4): one reusable approval definition for all four
  kinds, with a segregation-of-duties guard and a persisted, append-only history.
- **Acknowledgment as an immutable append-only ledger** (§3): the one table intentionally
  exempt from audit/soft-delete columns; `save` idempotent on the natural key.

## 6. Technical debt

- **No new blocking debt.** Domain Prisma adapters remain at the composition root
  (**TD-21**, unchanged platform policy). Governance events ride the same in-process
  bus/outbox as every domain (**TD-01**).
- **TD-23 (new, low):** the approval `subjectId` is referenced opaquely and **not**
  foreign-key-validated against the four aggregate tables, keeping the workflow reusable
  and decoupled. Tightening this to a validated reference later sits behind the
  `GovernanceApprovalService`.

## 7. Recommendation — proceed to P2-D03

P2-D02 meets its quality gates and definition of done: governance structures can be
modelled for any K-12 organization; policies live in a centralized versioned registry;
delegations and approval authorities are reusable; decisions are traceable and auditable;
and future domains consume governance services rather than implementing their own approval
or policy mechanisms. The platform is ready to underpin **P2-D03 — Student Lifecycle
Intelligence Platform (SLIP)**, which will consume governance policies (e.g. admission,
attendance, child-protection) and the approval workflow. Recommend opening the PR, letting
CI validate the Prisma build/migration/tests with network access, and merging on green.
