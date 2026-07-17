# 10. Domain architecture pattern (Phase 2)

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P2-D01-M01 (establishes the pattern for all Phase-2 domains)

## Context

Phase 2 builds 30+ enterprise domains on the certified Phase-1 core. They must be
consistent, testable, tenant-isolated, and buildable without modifying
foundational infrastructure. The first domain (Organization) sets the template.

## Decision

A domain is delivered in four layers with a strict dependency direction
(domain ← adapter ← composition root; the domain depends on nothing downstream):

1. **Pure domain package** `@knowget/<domain>` — the aggregate(s) and value
   objects, pure state transitions, invariants, domain events, and a
   **repository port** with an in-memory implementation. Depends only on
   `@knowget/shared`/`types`/`exceptions`/`events`. **Prisma-free**, so it is
   fully unit-tested and type-checked in-sandbox. This is where the business
   rules live.

2. **Persistence** — the domain's table(s) in `schema.prisma` (tenant-scoped,
   soft-delete, per-tenant unique keys) plus a migration that enables **FORCE
   Row-Level Security** with the fail-closed tenant policy. Verified against live
   PostgreSQL (psql) and in CI.

3. **Adapter** — a `Prisma<Domain>Repository` implementing the domain's port over
   Prisma, every operation wrapped in `withTenant` so RLS scopes the session
   (defense-in-depth with the explicit tenant argument). Lives at the composition
   root (`apps/api`) for now (TD-21).

4. **Transport** — a `<Domain>Module` + permission-gated REST controller under
   `apps/api/src/domains/<domain>`, using the security guard stack, zod DTOs, and
   the tenant from the authenticated principal. The controller is a thin adapter
   over the application service; **no business logic in the controller**.

Cross-cutting rules:

- **Application service** orchestrates use cases, enforces invariants via the
  domain, persists through the port, and **publishes a domain event per state
  change** to the shared `EVENT_BUS`.
- **Tenant isolation is layered:** explicit tenant argument in the port + RLS in
  the adapter + the tenant taken from the authenticated principal at the edge.
- **Testing:** the domain package is unit-tested in-sandbox; the controller is
  verified with the in-memory repository; the Prisma adapter and full build are
  CI-verified (TD-12).

## Consequences

- Every domain looks the same, so the 30+ Phase-2 contracts are predictable and
  reviewable, and a domain can be built without touching the core (the Phase-1
  exit criterion in practice).
- Business rules are ORM- and transport-agnostic and fully testable without a
  database.
- **Deferred (TD-21):** adapters at the composition root may move to per-domain
  persistence packages as the app grows — a mechanical change behind the port.
