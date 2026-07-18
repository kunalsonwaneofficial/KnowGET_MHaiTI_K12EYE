# Engineering Delivery Report — P2-D01-M06

**Relationship** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M06 — Relationship                                                                                                          |
| **Status**     | 🔄 Implemented; verification green in-sandbox + on live PostgreSQL. CI pending on `feat/p2-d01-m06-relationship` (pre-merge gate). |
| **Depends on** | P2-D01-M02 (Person), Phase 1 baseline (`v0.1.0`)                                                                                   |
| **Date**       | 18 July 2026                                                                                                                       |
| **Next**       | P2-D01-M07 — Domain certification                                                                                                  |

---

## 1. Mission recap

Deliver **Relationship** — typed associations **between people** (guardian↔student,
parent↔child, sibling, spouse, emergency contact). This completes the people graph
of the Identity & Organization sub-domain: with Person (M02), Identity (M03),
Membership (M04) and Roles (M05) in place, Relationship connects people to each
other, so the platform can answer questions like "who are this student's
guardians" and "who is this person's emergency contact". It is the last feature
milestone before the sub-domain certification (M07).

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**      | `@knowget/relationship` — `Relationship` aggregate (a directed edge `from → to` with a curated `kind`, status and effective period), directionality metadata per kind, a `counterpart` helper, domain events, repository port + in-memory impl, `RelationshipService` |
| **Persistence** | `Relationship` table in `schema.prisma` (tenant-scoped; `from_person_id` + `to_person_id`; `kind`; status; start/end **DATE**; soft delete) + `add_relationship` migration with **FORCE RLS**, indexed on both person endpoints                                       |
| **Adapter**     | `PrismaRelationshipRepository` — implements the port over Prisma (RLS via `withTenant`); `findByPerson` and `findBetween` are `OR`-queries over the two endpoints                                                                                                     |
| **API**         | `RelationshipModule` + `RelationshipController` (relate / get / list / by-person / end / delete), zod DTOs, `relationship:read`/`:write`, tenant from the principal                                                                                                   |

## 3. Domain capabilities & invariants

- **Directed edge, typed by kind** — a relationship is `from → to` with a curated
  `kind`: `guardian` (from=guardian, to=dependent), `parent` (from=parent,
  to=child), `sibling` and `spouse` (symmetric), `emergency_contact`, `other`.
  Each kind knows whether it is symmetric and what role each side plays.
- **Counterpart resolution** — `counterpart(relationship, personId)` returns the
  other person and what they are relative to `personId` (e.g. for a guardian edge,
  the dependent's counterpart is the `guardian`).
- **Referential integrity** — both endpoints must be real people in the tenant
  (injected `PersonDirectory`); a person cannot be related to themselves.
- **No equivalent active duplicate** — for directed kinds only the same direction
  clashes; for **symmetric** kinds the pair is unordered (A↔B == B↔A). Ended
  relationships free an equivalent new one.
- **Lifecycle** — `active → ended` (terminal, records an end date).
- **Tenant isolation** — layered: explicit tenant argument in the port, RLS in the
  adapter, and the principal's tenant at the edge.
- **Event per change** — created / ended, each with the tenant in metadata.

## 4. Verification

- **In-sandbox (green):** `@knowget/relationship` builds, type-checks and lints
  clean with **13 tests** (kind metadata; creation; self-relationship and end
  guards; counterpart from both sides incl. symmetric; service: person existence,
  directed vs symmetric dedup, per-person listing, tenant isolation). API layer:
  **61 tests** total, incl. **3 relationship controller tests**; Prisma-free API
  code type-checks in isolation; format clean.
- **Live PostgreSQL (psql):** applied `add_relationship` as the non-superuser app
  role and verified — RLS **enabled + forced**; tenant A sees only its rows, tenant
  B only its own; the `from|to` person `OR`-query resolves within the tenant;
  **no-tenant reads return 0 (fail-closed)**; cross-tenant insert **blocked by
  `WITH CHECK`**.
- **CI-verified:** the Prisma client build, `prisma migrate deploy`, the
  `PrismaRelationshipRepository`, and the full `nest build` (TD-12).

## 5. Decisions

Follows **ADR-0010** (domain architecture) — no new ADR. Notable choices: a
relationship is stored as a **single directed edge** (rather than a symmetric
pair of rows), with symmetry handled in the domain (dedup and `counterpart`),
which avoids duplication and keeps the two sides consistent. Relationship `kind`
is a **curated taxonomy with directionality metadata** rather than an opaque
string, so the role each side plays is self-documenting and correct; a
tenant-configurable relationship-type catalogue (parallel to the role catalogue)
is a possible future extension if institutions need custom kinds.

## 6. Technical debt

- No new blocking debt; `DataProbe` (TD-14) remains the data-platform fixture.
- **Certification note (for M07):** cross-domain referential lifecycle — e.g. how
  relationships (and memberships/accounts) react when a Person is **merged** (M02)
  or archived — is a sub-domain-wide concern best addressed at certification, along
  with the deferred live security-bootstrap flip (TD-16 remainder).

## 7. Recommendation — proceed to P2-D01-M07

On green CI, merge to `main` and begin **P2-D01-M07 — Domain certification**: the
Identity & Organization sub-domain is now feature-complete (Organization, Person,
Identity, Membership, Roles, Relationship). M07 certifies it end to end — including
the live security-bootstrap swap onto the persisted identity/principal→role/role
stores (the TD-16 remainder) and cross-domain lifecycle review — and freezes the
sub-domain baseline.
