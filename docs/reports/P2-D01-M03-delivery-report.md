# Engineering Delivery Report — P2-D01-M03

**Enterprise Identity Platform** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M03 — Enterprise Identity Platform                                                                                          |
| **Status**     | ✅ Complete — CI green (verify incl. Prisma build/migration/tests, audit, E2E); merged to `main`. RLS verified on live PostgreSQL. |
| **Depends on** | P2-D01-M02 (Person), P1-M04 (Security & Authentication), Phase 1 baseline (`v0.1.0`)                                               |
| **Date**       | 18 July 2026                                                                                                                       |
| **Next**       | P2-D01-M04 — Membership                                                                                                            |

---

## 1. Mission recap

Deliver the **Enterprise Identity Platform** — the tenant-scoped, persisted
system of record for **login accounts**, connecting the persona-agnostic
`Person` (P2-D01-M02) to the identifiers and credential a human authenticates
with, and to the **authentication engine** from P1-M04. This is the milestone
that begins resolving **TD-16** (identity/session/principal stores that were
in-memory and not tenant-scoped). A person may have zero, one, or several login
accounts; an account always belongs to exactly one person and one tenant.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**      | `@knowget/enterprise-identity` — `IdentityAccount` aggregate (person link, login identifiers, credential hash, status, lockout counters), login-identifier value objects with **normalized keys**, lifecycle state machine, domain events, repository port + in-memory impl, `IdentityAccountService`; crypto and person-existence enter through injected ports |
| **Persistence** | `IdentityAccount` table in `schema.prisma` (tenant-scoped; `person_id`; **JSONB identifiers**; normalized **`identifier_keys`**; credential/status/lockout; soft delete) + `add_identity_account` migration with **FORCE RLS** and a **GIN** index over `identifier_keys`                                                                                       |
| **Adapter**     | `PrismaIdentityAccountRepository` — implements the port over Prisma (RLS via `withTenant`), maps identifiers↔JSONB, resolves identifiers via the GIN-indexed `identifier_keys`                                                                                                                                                                                  |
| **API**         | `IdentityModule` + `IdentityController` (provision / get / list / by-person / add- & remove-identifier / set-credential / activate / suspend / disable / archive / lock / unlock / delete), zod DTOs, `identity:read`/`:write`, tenant from the principal; **credential hashes are never returned**                                                             |
| **Bridge**      | `tenantIdentityRepository` — exposes the persisted, tenant-scoped accounts through the **frozen P1-M04 `IdentityRepository` port**, so the `AuthenticationEngine` authenticates real accounts (tenant-qualified login) with lockout counters persisted back                                                                                                     |

## 3. Domain capabilities & invariants

- **Person link** — an account can only be provisioned for a `Person` that
  exists in the tenant (enforced via an injected `PersonDirectory`); the link is
  immutable `personId`.
- **Identifier uniqueness** — identifiers are unique **within a tenant**, compared
  on a normalized key (email/username case-insensitive; mobile reduced to digits
  with an optional leading `+`). Provisioning and add-identifier reject an
  in-use identifier; an account keeps at least one identifier.
- **Lifecycle** — `pending → active`, `active ↔ suspended`, `→ disabled` (and back),
  `→ archived` (terminal); `locked` is entered only by lockout and cleared to
  `active`; illegal transitions rejected.
- **Credentials** — hashed at the application edge via `@knowget/security` (scrypt)
  behind a `CredentialHasher` port; the domain and the API never handle or expose
  the hash (the REST view reports only `hasCredential`).
- **Lockout** — failed-attempt counters and lock windows live on the account; the
  authentication engine's writes persist back through the bridge.
- **Tenant isolation** — layered: explicit tenant argument in the port + RLS in the
  adapter + principal tenant at the edge + **tenant-qualified** identifier lookup.
- **Event per change** — provisioned / activated / status-changed / identifier-added
  / identifier-removed / credential-changed / locked, each with the tenant in metadata.

## 4. Verification

- **In-sandbox (green):** `@knowget/enterprise-identity` builds, type-checks and
  lints clean with **25 tests** (identifier normalization, provisioning & dedup,
  lifecycle, identifier management, credential & lockout; service use-cases incl.
  person-link and tenant isolation). API layer: **47 tests** total, incl. **3 new
  identity controller tests** (in-memory repository) and **3 bridge tests**;
  Prisma-free API code type-checks in isolation; format clean.
- **Auth-engine bridge (green, in-sandbox):** a provisioned + activated **persisted**
  account authenticates end to end through the **frozen `AuthenticationEngine`**
  (access + refresh tokens, session); a wrong password **increments the persisted
  failed-attempt counter** (write-back through the bridge); a different tenant
  cannot resolve the identifier (tenant-qualified login).
- **Live PostgreSQL (psql):** applied `add_identity_account` as the non-superuser
  app role and verified — RLS **enabled + forced**; tenant A sees only its rows,
  tenant B sees only its own; **no-tenant reads return 0 (fail-closed)**;
  cross-tenant insert **blocked by `WITH CHECK`**; the **GIN** identifier lookup
  resolves within the tenant.
- **CI-verified:** the Prisma client build, `prisma migrate deploy`, the
  `PrismaIdentityAccountRepository`, and the full `nest build` (TD-12).

## 5. Decisions

Recorded in **ADR-0011**. In brief: the enterprise identity domain is a **new
Phase-2 domain** (composition over modifying the frozen `@knowget/identity`
primitive); credential hashing and person existence enter through **injected
ports**, keeping the domain pure per ADR-0010; **login is tenant-qualified** (the
tenant is resolved before the identifier lookup, so `findByIdentifier` is
tenant-scoped and every query stays RLS-clean), and a **composition-root bridge**
lets the frozen `AuthenticationEngine` run against persisted accounts. The
certified security **bootstrap is left unchanged** (stability): the persisted
store is available behind the port and proven via the bridge; flipping the live
global wiring is a later increment. `identifier_keys` is a **GIN index created in
the migration only** (like RLS, not expressible in the Prisma schema).

## 6. Technical debt

- **TD-16 — partially resolved.** The identity store now has a **persisted,
  tenant-scoped implementation** (`PrismaIdentityAccountRepository`) behind the
  `IdentityRepository` port, **proven to drive the authentication engine** via the
  bridge. Still open under TD-16: **session / revocation / principal→role**
  persistence, and flipping the **live security bootstrap** to the persisted store
  with tenant-qualified login bootstrap — deferred to later Identity & Organization
  milestones (Membership / Authorization).
- **TD-18** (refresh-token rotation/replay) untouched — a later identity increment.
- No new blocking debt; `DataProbe` (TD-14) remains the data-platform fixture.

## 7. Recommendation — proceed to P2-D01-M04

On green CI, merge to `main` and begin **P2-D01-M04 — Membership**, attaching
people/accounts to organizations with roles, and continuing the TD-16 burn-down
(persisted principal→role assignment behind the `PrincipalResolver`).
