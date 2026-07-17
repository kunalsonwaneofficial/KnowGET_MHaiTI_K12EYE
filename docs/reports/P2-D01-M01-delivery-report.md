# Engineering Delivery Report — P2-D01-M01

**Organization Foundation** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M01 — Organization Foundation                                                                                               |
| **Status**     | ✅ Complete — CI green (verify incl. Prisma build/migration/tests, audit, E2E); merged to `main`. RLS verified on live PostgreSQL. |
| **Depends on** | Phase 1 baseline (`v0.1.0`) — kernel, data platform (RLS), security, shared services, observability                                |
| **Date**       | 17 July 2026                                                                                                                       |
| **Next**       | P2-D01-M02 — Person Platform                                                                                                       |

---

## 1. Mission recap

Deliver the first enterprise domain — the **Organization** (the institution's
structural hierarchy) — and in doing so **establish the domain architecture
pattern** every subsequent Phase-2 domain follows: a pure domain package behind a
repository port, a Prisma/RLS persistence adapter at the composition root, an
application service on the platform event bus, and a permission-gated REST
surface. All on the certified Phase-1 core, with no changes to foundational
infrastructure.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**      | `@knowget/organization` — `Organization` aggregate (trust/society → school → campus → department → grade → section), status state machine, hierarchy ops (tree, ancestors/descendants, cycle detection), domain events, repository port + in-memory impl, `OrganizationService` |
| **Persistence** | `Organization` table in `schema.prisma` (tenant-scoped, per-tenant unique `code`, soft delete) + `add_organization` migration with **FORCE RLS** and the fail-closed tenant policy                                                                                              |
| **Adapter**     | `PrismaOrganizationRepository` — implements the port over Prisma, every call inside `withTenant` (RLS)                                                                                                                                                                          |
| **API**         | `OrganizationModule` + `OrganizationController` (create/list/tree/get/rename/move/status/delete), zod DTOs, `organization:read`/`:write` permissions, tenant from the authenticated principal                                                                                   |
| **Platform**    | Promoted the in-process `EventBus` to a shared-services provider (`EVENT_BUS`) for domain-event publication                                                                                                                                                                     |

## 3. Domain invariants (enforced in the domain, not the transport)

- **Code uniqueness** within a tenant (domain check + DB unique index `(tenant_id, code)`).
- **Parent existence** — a parent must exist in the same tenant (cross-tenant parents are invisible under RLS).
- **Acyclic hierarchy** — a move that would make a node its own ancestor is rejected (`CircularHierarchyError`).
- **Status state machine** — `draft → active → suspended → active → archived`; `archived` is terminal; illegal transitions rejected.
- **Tenant isolation** — every repository method is tenant-scoped (explicit argument) and RLS-enforced (defense-in-depth).
- **Event per change** — created/renamed/moved/status-changed domain events published with the tenant in metadata.

## 4. Verification

- **In-sandbox (green):** `@knowget/organization` builds, type-checks and lints clean with **16 tests** (aggregate, state machine, hierarchy, service invariants, tenant isolation, event emission). API layer: **37 tests** (incl. 5 organization controller tests via an in-memory repository); the Prisma-free API code type-checks in isolation. Lint 0 warnings, format clean.
- **Live PostgreSQL (psql):** applied all migrations as the **non-superuser** app role and verified on the `organization` table — RLS **enabled + forced**; tenant A sees only its rows, tenant B only its own; the same `code` is allowed across tenants; **no-tenant reads return 0 rows (fail-closed)**; duplicate `code` within a tenant is rejected by the unique index.
- **CI-verified:** the Prisma client build, the `PrismaOrganizationRepository`, and the full `nest build` (TD-12).

## 5. Decisions (ADR)

- **ADR-0010** — Domain architecture pattern: pure domain package (aggregate +
  events + port + in-memory) → Prisma/RLS adapter at the composition root →
  application service on the event bus → permission-gated REST controller under
  `apps/api/src/domains/<domain>`. This is the template for all Phase-2 domains.

## 6. Technical debt

No debt resolved or blocking. New: **TD-21** — domain Prisma adapters currently
live at the composition root (`apps/api`); as domains multiply they may move to
per-domain persistence packages (a mechanical refactor, protected by the
repository port). `DataProbe` (TD-14) remains a platform fixture, now alongside
the first real domain table.

## 7. Recommendation — proceed to P2-D01-M02

On green CI, merge to `main` and begin **P2-D01-M02 — Person Platform** (the
persona-agnostic person record), which layers onto the organization structure
and precedes Enterprise Identity (M03) and Organization Membership (M04).
