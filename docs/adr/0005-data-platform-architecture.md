# 5. Data platform architecture

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M03

## Context

P1-M03 requires a production-grade data platform on the mandated stack
(PostgreSQL + Prisma) with a reusable data-access layer, transactions,
multi-tenancy (application-context + PostgreSQL RLS), auditing, soft delete,
validation, and migrations — with no domain schema and no ORM leakage into
domains.

## Decision

- **Two layers.** `@knowget/persistence` holds ORM-agnostic abstractions
  (`Repository`, query/pagination, `Specification`, `UnitOfWork`, audit stamping,
  Zod validation). `@knowget/database` holds the Prisma infrastructure (client,
  generic `PrismaRepository`, `TransactionManager`, tenancy, `AuditWriter`,
  health). Domains depend on `@knowget/persistence`, never on Prisma.
- **Prisma is infrastructure.** Only platform tables exist (`audit_log`, and a
  `data_probe` verification fixture). A single documented cast adapts a Prisma
  delegate to the generic repository.
- **Multi-tenancy = application-context + RLS.** Tenant-scoped work runs inside a
  transaction that sets `app.current_tenant` via `set_config`; `FORCE` RLS on
  tenant-owned tables enforces isolation even for the table owner. The policy
  uses `NULLIF(current_setting(...), '')::uuid` so an unset tenant fails closed
  (zero rows) rather than erroring. **The application must connect as a
  non-superuser** — superusers bypass RLS.
- **Migrations** are Prisma migrations (`init`, `enable_rls`) applied by
  `prisma migrate deploy`.

## Consequences

- Domains get a clean, testable persistence contract; the ORM can evolve behind
  it.
- Tenant isolation is enforced at the database, not only in application code.
- **Build environment:** Prisma's engine CDN is unreachable in the current build
  sandbox, so `prisma generate` (and thus the `@knowget/database` / `@knowget/api`
  TypeScript build and the Prisma-based integration tests) run in CI, which
  provisions PostgreSQL and a non-superuser role. The data model and RLS
  behaviour were verified directly against a live PostgreSQL via `psql`. This is
  an environmental constraint (TD-12), not a code limitation — Prisma builds
  normally wherever its engine CDN is reachable.
