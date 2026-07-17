# Engineering Delivery Report — P2-D01-M02

**Person Platform** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M02 — Person Platform                                                                                           |
| **Status**     | 🟡 Engineered; in-sandbox gates green + RLS verified on live PostgreSQL. On `feat/p2-d01-m02-person` pending green CI. |
| **Depends on** | P2-D01-M01 (Organization), Phase 1 baseline (`v0.1.0`)                                                                 |
| **Date**       | 17 July 2026                                                                                                           |
| **Next**       | P2-D01-M03 — Enterprise Identity Platform                                                                              |

---

## 1. Mission recap

Deliver the **Person** — the persona-agnostic canonical record of a human in the
institution — as the second Identity & Organization domain, following the domain
architecture pattern (ADR-0010). A Person models a human's names, demographics
and ways to reach them; personas (Student/Teacher/Guardian) and login identities
layer on in later contracts. A Person may exist with no login identity at all.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Domain**      | `@knowget/person` — `Person` aggregate (name value object, demographics, embedded contact points), lifecycle state machine, deterministic dedup **match key**, **merge**, domain events, repository port + in-memory impl, `PersonService` |
| **Persistence** | `Person` table in `schema.prisma` (tenant-scoped; names/demographics; **JSONB contacts**; indexed `match_key`; soft delete) + `add_person` migration with **FORCE RLS**                                                                    |
| **Adapter**     | `PrismaPersonRepository` — implements the port over Prisma (RLS via `withTenant`), maps contacts↔JSONB and stores the computed `match_key`                                                                                                 |
| **API**         | `PersonModule` + `PersonController` (register/get/list/duplicates/rename/demographics/contacts/status/merge/delete), zod DTOs, `person:read`/`:write` permissions, tenant from the principal                                               |

## 3. Domain capabilities & invariants

- **Deduplication** — a deterministic `match key` (family|given|dob, diacritic- and
  punctuation-insensitive) detects likely duplicates; `register` blocks an active
  duplicate unless `allowDuplicate` is set, and `findPotentialDuplicates` surfaces candidates.
- **Contacts** — an embedded value-object collection: add (de-duplicated by
  type+normalized value; emails case-insensitive), remove, set-primary (one per type), verified flag.
- **Lifecycle** — `active → inactive → active`, `→ deceased`, `→ archived`; `merged`
  is set only by merge; illegal transitions rejected.
- **Merge** — the survivor absorbs the duplicate's contacts; the duplicate becomes
  a terminal `merged` record pointing to the survivor; self-merge and re-merge rejected.
- **Tenant isolation** — explicit tenant argument in the port + RLS in the adapter + principal tenant at the edge.
- **Event per change** — registered/renamed/contact-added/status-changed/merged events with the tenant in metadata.

## 4. Verification

- **In-sandbox (green):** `@knowget/person` builds, type-checks and lints clean with **15 tests** (name/contact/matching value objects, lifecycle, dedup, merge, tenant isolation, events). API layer: **41 tests** (incl. 4 person controller tests via an in-memory repository); Prisma-free API code type-checks in isolation. Lint 0 warnings, format clean.
- **Live PostgreSQL (psql):** applied the `add_person` migration as the non-superuser app role and verified — RLS **enabled + forced**; tenant A sees only its rows, tenant B sees 0; **no-tenant reads return 0 (fail-closed)**; JSONB contacts persist.
- **CI-verified:** the Prisma client build, the `PrismaPersonRepository`, and the full `nest build` (TD-12).

## 5. Decisions

Follows **ADR-0010** (domain architecture pattern) — no new ADR. Notable choice:
contact points are modelled as an **embedded value-object collection** (JSONB),
matching the DDD aggregate boundary (contacts are part of the Person aggregate,
persisted as a unit) rather than a separate table.

## 6. Technical debt

No debt resolved or blocking; no new debt. `DataProbe` (TD-14) remains the
data-platform's own fixture; the two real domain tables (organization, person)
now exist alongside it.

## 7. Recommendation — proceed to P2-D01-M03

On green CI, merge to `main` and begin **P2-D01-M03 — Enterprise Identity
Platform**, which connects `Person` records to the login identities and
authentication engine from P1-M04 (beginning to resolve TD-16 — persisted,
tenant-scoped identity stores).
