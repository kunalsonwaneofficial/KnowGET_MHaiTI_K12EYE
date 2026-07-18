# Engineering Delivery Report — P2-D01-M04

**Membership** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M04 — Membership                                                                                                            |
| **Status**     | ✅ Complete — CI green (verify incl. Prisma build/migration/tests, audit, E2E); merged to `main`. RLS verified on live PostgreSQL. |
| **Depends on** | P2-D01-M01 (Organization), M02 (Person), M03 (Enterprise Identity), P1-M04 (Authorization/RBAC), Phase 1 baseline (`v0.1.0`)       |
| **Date**       | 18 July 2026                                                                                                                       |
| **Next**       | P2-D01-M05 — Authorization                                                                                                         |

---

## 1. Mission recap

Deliver **Membership** — the join that binds the Identity & Organization
sub-domain together: a **person's affiliation with an organization node**,
carrying the **role names** they play there, a status and an effective period.
Membership is what lets the platform answer "who belongs where, as what", and it
supplies the second half of the **TD-16** burn-down begun in M03: a **persisted,
tenant-scoped `PrincipalResolver`** that turns an authenticated identity into the
roles its person actually holds.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**      | `@knowget/membership` — `Membership` aggregate (Person → Organization, role-name set, status, effective period), lifecycle state machine, role normalization, domain events, repository port + in-memory impl, `MembershipService`; person/org existence enter through injected directory ports |
| **Persistence** | `Membership` table in `schema.prisma` (tenant-scoped; `person_id` + `organization_id`; **`roles` text[]**; status; start/end **DATE**; soft delete) + `add_membership` migration with **FORCE RLS**                                                                                             |
| **Adapter**     | `PrismaMembershipRepository` — implements the port over Prisma (RLS via `withTenant`), including the `findActiveByPersonAndOrg` uniqueness probe                                                                                                                                                |
| **API**         | `MembershipModule` + `MembershipController` (grant / get / list / by-person / by-organization / change-roles / suspend / reinstate / end / delete), zod DTOs, `membership:read`/`:write`, tenant from the principal                                                                             |
| **Resolver**    | `tenantPrincipalResolver` — a **persisted, tenant-scoped `PrincipalResolver`**: identity account → its person → the union of role names from that person's **active** memberships → a `Principal` (permissions expanded later by the `AuthorizationEngine`)                                     |

## 3. Domain capabilities & invariants

- **Referential integrity** — a membership can only be granted for a `Person` and
  an `Organization` that both exist in the tenant (injected `PersonDirectory` /
  `OrganizationDirectory`).
- **One active membership per (person, organization)** — re-granting an active
  pair is rejected; role changes go through `change-roles`. A fresh membership is
  allowed once the previous one has ended.
- **Roles** — a normalized, de-duplicated, non-empty set of **opaque** role names
  (their permissions are resolved by the authorization engine; the tenant-scoped
  role catalogue is P2-D01-M05).
- **Lifecycle** — `active ↔ suspended`, `→ ended` (terminal, records an end date);
  illegal transitions rejected.
- **Principal resolution** — a person's effective roles are the **union of role
  names across their active memberships**; suspended/ended memberships contribute
  nothing. The resolver supplies role _names_ only; the `AuthorizationEngine`
  expands them into permissions at check time.
- **Tenant isolation** — layered: explicit tenant argument in the port + RLS in
  the adapter + principal tenant at the edge + tenant-bound resolver.
- **Event per change** — granted / roles-changed / suspended / reinstated / ended,
  each with the tenant in metadata.

## 4. Verification

- **In-sandbox (green):** `@knowget/membership` builds, type-checks and lints clean
  with **16 tests** (role normalization, creation, lifecycle, transitions; service
  use-cases incl. person/org existence, dedup, tenant isolation, role-union).
  API layer: **53 tests** total, incl. **3 membership controller tests** (in-memory
  repository) and **3 principal-resolver tests**; Prisma-free API code type-checks
  in isolation; format clean.
- **Principal resolver (green, in-sandbox):** resolves a `Principal` from a
  persisted account → person → active memberships → role names; **excludes roles
  from suspended memberships**; returns null for an unknown account and **does not
  resolve across tenants**.
- **Live PostgreSQL (psql):** applied `add_membership` as the non-superuser app
  role and verified — RLS **enabled + forced**; tenant A sees only its rows, tenant
  B only its own; **no-tenant reads return 0 (fail-closed)**; cross-tenant insert
  **blocked by `WITH CHECK`**; the `roles` text[] persists and reads back intact.
- **CI-verified:** the Prisma client build, `prisma migrate deploy`, the
  `PrismaMembershipRepository`, and the full `nest build` (TD-12).

## 5. Decisions

Follows **ADR-0010** (domain architecture) and the tenant-qualified resolver
approach of **ADR-0011** — no new ADR. Notable choices: membership links the
**`Person`** (the human's role in an org), not a login account, so a person's
roles are shared across their accounts; role names are **opaque strings** here
(the tenant-scoped role catalogue and role→permission mapping are M05); and the
persisted `PrincipalResolver` is **tenant-bound** (constructed after the tenant is
known), mirroring the M03 auth bridge. As in M03, the live security **bootstrap
wiring is left unchanged** for stability — the persisted resolver is delivered and
proven behind the `PrincipalResolver` interface, ready for the live swap.

## 6. Technical debt

- **TD-16 — principal→role now persisted & tenant-scoped.** The assignment store is
  no longer in-memory: `tenantPrincipalResolver` resolves a principal's roles from
  persisted memberships, proven end to end. Still open under TD-16: **session /
  revocation** persistence and flipping the **live security bootstrap** (identity
  store + resolver) to the persisted implementations — remaining Identity &
  Organization / certification work.
- The **tenant-scoped role catalogue** and **role→permission** mapping (so role
  names are validated and expanded per tenant) are **P2-D01-M05 (Authorization)**.
- No new blocking debt; `DataProbe` (TD-14) remains the data-platform fixture.

## 7. Recommendation — proceed to P2-D01-M05

On green CI, merge to `main` and begin **P2-D01-M05 — Authorization**: a
tenant-scoped role catalogue and role→permission model (persisting the RBAC store
behind `RoleStore`), validating membership role names, and completing the
principal-resolution path so authorization is fully data-driven per tenant.
