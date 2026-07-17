# Engineering Delivery Report — P1-M03

**Enterprise Data Platform** · Phase 1 (Platform Core Engineering)

|                |                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P1-M03 — Enterprise Data Platform                                                                                                                                           |
| **Status**     | 🟡 Implemented; DB behaviour verified against live PostgreSQL. Prisma-client build + integration tests are **CI-verified** (see §7). On branch `feat/p1-m03-data-platform`. |
| **Depends on** | P1-M02 (Platform Runtime Kernel)                                                                                                                                            |
| **Date**       | 17 July 2026                                                                                                                                                                |
| **Next**       | P1-M04 — Security Foundation                                                                                                                                                |

---

## 1. Mission recap

Engineer a secure, scalable, transaction-safe, multi-tenant, AI-ready data
platform on PostgreSQL + Prisma so that every future domain persists, queries and
manages data without building its own persistence infrastructure — with Prisma
kept as an infrastructure detail, not a domain dependency.

## 2. What was engineered

| Package                        | Delivers                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowget/persistence` (new)   | ORM-agnostic `Repository`, query/pagination, `Specification`, `UnitOfWork`, audit stamping, Zod validation                                                                        |
| `@knowget/database` (expanded) | Prisma schema + migrations, `PrismaService`, generic `PrismaRepository`, `TransactionManager`, multi-tenancy (`withTenant` + RLS), `AuditWriter`, `DatabaseHealthIndicator`, seed |

The API registers the database health indicator into the kernel's readiness
probe and disconnects the client on graceful shutdown.

## 3. Scope coverage (contract → implementation)

| Contract scope               | Implementation                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Database Foundation          | PostgreSQL via `PrismaService` (connect/disconnect/health), pooling via connection string                            |
| Prisma Platform              | `schema.prisma` (platform tables only), `prisma generate`, migrations, seed — Prisma isolated behind the package     |
| Enterprise Data Access Layer | `@knowget/persistence` (repositories, query/filter/sort/pagination, specification, CQRS-ready)                       |
| Transaction Management       | `TransactionManager` (Unit-of-Work over Prisma interactive transactions); rollback verified                          |
| Multi-Tenancy Foundation     | Application-context + PostgreSQL **RLS** (`FORCE`), `set_config('app.current_tenant', …)`, tenant-aware `withTenant` |
| Auditing Foundation          | `AuditMetadata` + `stampCreate/stampUpdate`; `AuditWriter` → `audit_log`                                             |
| Soft Delete & Archival       | `deletedAt` conventions; `softDelete` / `restore`; queries exclude deleted by default                                |
| Data Validation              | Zod `validateEntity` at the persistence boundary                                                                     |
| Migration Platform           | Prisma migrations (`init`, `enable_rls`) via `prisma migrate deploy`                                                 |
| Performance Foundation       | Indexes (`@@index`), connection pooling, pagination offsets                                                          |

No domain (Student/Finance/HR/…) schema was introduced — only platform tables
(`audit_log`; `data_probe` verification fixture).

## 4. Verification — data model & RLS against live PostgreSQL

Verified directly against a running PostgreSQL 16 via `psql`:

- **Tables & indexes** created; `data_probe` has RLS **enabled + forced**, `audit_log` does not (platform-level).
- **Tenant isolation:** tenant A sees 2 rows, tenant B sees 1, a superuser sees all 3 — RLS isolates correctly.
- **Fail-closed:** with no tenant set, queries return **0 rows** (via `NULLIF(current_setting(...), '')`), gracefully.
- **Transaction rollback:** an insert inside a failed transaction leaves **0 rows**.
- **Auditing:** platform audit entries insert into `audit_log`.

## 5. Verification — TypeScript gates

Green locally across all 16 non-Prisma workspaces: **build (18) · type-check (26)
· tests (26) · lint (0 warnings) · format**. `@knowget/persistence` unit tests
(specification, query/pagination, audit, validation) pass; `@knowget/database`
source is lint-clean.

## 6. Decisions (ADR)

- **ADR-0005** — Two-layer data platform (ORM-agnostic `@knowget/persistence` +
  Prisma `@knowget/database`); multi-tenancy via application-context + `FORCE`
  RLS with fail-closed policy; the app connects as a non-superuser so RLS is
  enforced.

## 7. Build-environment constraint (important)

Prisma's engine CDN (`binaries.prisma.sh`) is **unreachable from the current
build sandbox** (HTTP 403), so `prisma generate` cannot run here — which means
the `@knowget/database` and `@knowget/api` **TypeScript build** and the
**Prisma-based integration tests** cannot execute locally. This is an
environmental network limitation, **not a code issue**: Prisma builds normally
wherever its CDN is reachable.

Accordingly:

- The **data model and RLS behaviour are verified against a live PostgreSQL** (§4).
- The CI pipeline (`.github/workflows/ci.yml`) now provisions PostgreSQL and a
  **non-superuser** app role, applies migrations, and runs the full
  build/type-check/test — including the Prisma-client build and the DB
  integration tests. **CI is the authority for the Prisma-dependent gates.**
- Because these gates cannot be closed locally, **this milestone is not merged to
  `main`** — it is on `feat/p1-m03-data-platform` pending green CI. `main`
  remains releasable at P1-M02.

## 8. Recommendation — proceed to P1-M04

Begin **P1-M04 — Security Foundation** (identity, authentication, RBAC/ABAC,
sessions, cryptographic services, key management, tokens, security audit,
middleware) on the data + kernel foundations — persisting identities through the
`@knowget/persistence` repositories and RLS engineered here.
