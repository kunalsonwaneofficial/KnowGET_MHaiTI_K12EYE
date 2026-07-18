# Phase 2 · Program A Certification Report — Identity & Organization

- **Sub-domain:** P2-D01 — Identity & Organization (Program A)
- **Contract:** P2-D01-M07 — Domain certification
- **Baseline:** `v0.2.0` (2026-07-18)
- **Built on:** Phase-1 Platform Core, certified & frozen at `v0.1.0`

---

## 1. Purpose

This report certifies the **Identity & Organization** sub-domain — the first
Phase-2 domain program — as complete, verified, and ready to be built upon by
later Phase-2 programs. It records what was engineered across the six milestones
(M01–M06), the evidence that each is correct and tenant-isolated, the proof that
they compose into a working whole, and the security posture including the one
deliberately-deferred operational step.

## 2. Scope certified

Six domains, each engineered on the domain architecture pattern (ADR-0010) and
merged to `main` CI-green:

| Milestone  | Domain                | Delivers                                                                               |
| ---------- | --------------------- | -------------------------------------------------------------------------------------- |
| P2-D01-M01 | Organization          | The institution hierarchy (trust→school→…→section), lifecycle, events                  |
| P2-D01-M02 | Person                | The persona-agnostic human record: names, demographics, contacts, dedup/merge          |
| P2-D01-M03 | Enterprise Identity   | Tenant-scoped login accounts linking a Person to identifiers/credential/lockout        |
| P2-D01-M04 | Membership            | A person's roles within an organization node + the persisted principal resolver        |
| P2-D01-M05 | Authorization (Roles) | The tenant-scoped role catalogue (name→permissions); data-driven permission resolution |
| P2-D01-M06 | Relationship          | Typed associations between people (guardian/parent/sibling/spouse/emergency contact)   |

Reusable packages: `@knowget/organization`, `@knowget/person`,
`@knowget/enterprise-identity`, `@knowget/membership`, `@knowget/roles`,
`@knowget/relationship`.

## 3. Certification by dimension

- **Domain model** — each domain is a pure package (aggregate, value objects,
  invariants, events, repository port + in-memory impl) depending only on
  `shared`/`types`/`exceptions`/`events`, fully unit-tested in-sandbox.
- **Persistence & tenant isolation** — each tenant-owned table enables **FORCE
  Row-Level Security** with the fail-closed policy. Every table was verified
  against **live PostgreSQL** as the non-superuser app role: RLS enabled+forced,
  cross-tenant reads return the caller's rows only, **no-tenant reads return 0
  (fail-closed)**, and cross-tenant writes are **blocked by `WITH CHECK`**.
- **Adapters** — each domain has a Prisma adapter implementing its port via
  `withTenant` (RLS-scoped); CI-verified (the Prisma client cannot build in the
  sandbox — TD-12).
- **Transport** — each domain exposes a permission-gated REST module using the
  Phase-1 guard stack, zod DTOs, and the tenant taken from the authenticated
  principal; controllers are thin adapters over the services (no business logic).
- **Cross-domain composition** — certified by an end-to-end suite (§6).

## 4. Quality gate evidence (in-sandbox)

- **Domain package tests (green):** organization, person (15), enterprise-identity
  (25), membership (18), roles (12), relationship (13) — all type-check, lint and
  build clean.
- **API layer (green):** **66 tests** including per-domain controller specs
  (in-memory repositories), the identity↔authentication bridge, the membership
  principal resolver, the role permission-resolution decorator, and the
  cross-domain certification suite (§6). Prisma-free API code type-checks in
  isolation; ESLint 0 warnings; Prettier clean repo-wide.
- **Live PostgreSQL:** all six domain tables' RLS behaviour verified via psql.
- **CI (per branch, pre-merge):** the Prisma client build, `prisma migrate
deploy`, every adapter, the full `nest build`, dependency audit, and E2E.

## 5. Architecture integrity

All six domains are structurally identical (ADR-0010): pure domain package →
Prisma/RLS adapter at the composition root → application service on the shared
event bus → permission-gated controller. This uniformity is the Phase-1 exit
criterion in practice — a domain is added without touching the core — and it held
for all six. Cross-cutting concerns entered through **injected ports**, never
direct coupling: credential hashing (`CredentialHasher`), person/organization/role
existence (`PersonDirectory`/`OrganizationDirectory`/`RoleDirectory`), and
role→permission expansion. Two composition-root seams connect the domains to the
frozen P1-M04 security engine without modifying it: the **identity bridge**
(ADR-0011) and the **permission-resolution decorator** (ADR-0012).

## 6. Cross-domain integration (certified chain)

The suite `identity-organization.cert.spec.ts` composes all six domains with the
real authentication and authorization engines and certifies the complete flow:

> organization + person + role + identity account + membership + relationship →
> **login** (AuthenticationEngine via the identity bridge) → **resolve Principal**
> (membership resolver + role-permission decorator) → **authorize**
> (AuthorizationEngine).

Certified behaviours:

- A provisioned, activated account **authenticates** through the persisted-identity
  bridge into the frozen engine.
- The resolved **Principal's roles come from membership** and its **permissions
  from the role catalogue**; a granted action is allowed and every other action
  **default-denies**.
- Authorization is **live and data-driven**: **suspending the membership** drops
  the principal's roles and permissions immediately, and **changing a role's
  permissions** is reflected on the next resolution.
- **Relationships** resolve with correct directionality (a student's guardian edge
  yields `guardian`; the reverse yields `dependent`).
- **Principal resolution is tenant-isolated** (a resolver bound to another tenant
  yields nothing).

## 7. Security posture & the deferred live-bootstrap swap

The RBAC substance of **TD-16** is resolved: the identity store
(`PrismaIdentityAccountRepository`), the principal→role store (membership-backed
`tenantPrincipalResolver`) and the role→permission catalogue (`@knowget/roles`)
are all **persisted, tenant-scoped, and certified** against the engine (§6).

**One operational step is deliberately deferred:** flipping the running app's
global security bootstrap from the in-memory stores to these persisted stores.
This is not a wiring detail — it requires **tenant propagation** through the auth
token or session, because the global `PrincipalResolver.resolve(sub)` and the
engine's identifier lookup are tenant-agnostic while the persisted stores are
tenant-scoped (RLS). The token issuer and `Session` type are **frozen P1-M04**, so
the swap needs a designed change (a tenant claim / tenant-qualified session, or a
system-context account→tenant resolver) plus a DB-seeded bootstrap admin. Making
that change during certification — a large, security-critical, mostly-CI-only
rewrite of the certified guard stack — would work against "repo always
releasable". It is therefore scoped to the **operations/hardening phase** (see
ADR-0013 and TD-16), while the persisted composition it will use is already
assembled and proven here. The live default remains the in-memory bootstrap,
which keeps the API bootable and the security layer testable in-sandbox.

## 8. Cross-domain lifecycle review

- **Person merge (M02)** absorbs the duplicate's contacts and marks it `merged`
  pointing at the survivor, but does **not** rewrite memberships, relationships or
  identity accounts that reference the merged id. Current behaviour is **safe**
  (no privilege escalation: the merged person's data is unchanged), but "follow
  the survivor" re-pointing is a future cross-domain enhancement, best delivered
  as an event-driven reaction to `person.merged`.
- **Person archive / status changes** do not cascade to memberships/relationships;
  authority is governed by **membership** status (suspended/ended immediately
  removes roles — certified in §6), which is the correct control point.
- **Role archive/delete** removes the role's permissions from resolution
  (fail-safe: unknown/archived roles grant nothing), and membership grants are
  validated against the **active** catalogue.

These are documented as sub-domain policy; no unsafe behaviour was found.

## 9. Technical-debt review

- **TD-16** — RBAC substance resolved (persisted, tenant-scoped, certified);
  remaining sliver = the live-bootstrap swap (tenant propagation) + session /
  revocation persistence, scoped to hardening.
- **TD-14** (`DataProbe`) remains a data-platform fixture alongside the now-six
  real domain tables.
- **TD-21** (domain adapters live at the composition root) unchanged — a
  mechanical refactor behind the ports if/when needed.
- No `TODO`/`FIXME` markers exist in the codebase; no new blocking debt.

## 10. Sub-domain exit criterion — assessment

The Identity & Organization sub-domain can model an institution's structure, its
people, their login accounts, their roles and permissions, and the relationships
between them — all tenant-isolated at the database and composing into a working,
data-driven authorization flow, proven end to end. New Phase-2 programs can build
on these packages without modifying them. **Criterion met.**

## 11. Certification statement

The **Identity & Organization** sub-domain (P2-D01, M01–M06) is hereby **CERTIFIED**
and baselined at **`v0.2.0`** on 2026-07-18, built on the frozen Phase-1 core
(`v0.1.0`). All six domains are merged to `main`, CI-green, with tenant isolation
verified on live PostgreSQL and cross-domain composition proven in-sandbox. The
single deferred item (the live security-bootstrap swap) is documented, scoped and
non-blocking.
