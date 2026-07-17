# Platform State Register

Authoritative record of what has been engineered, certified, and is reusable.
Updated at the close of every engineering contract.

## Phase 1 — Platform Core Engineering

| Contract                                             | Status         | Notes                                                                                                 |
| ---------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| P1-M01 Repository & Workspace Foundation             | ✅ Complete    | Monorepo, 11 packages, 4 apps, CI, Docker, hooks. Live on `main`.                                     |
| P1-M02 Platform Runtime Kernel                       | ✅ Complete    | Kernel/context/config/health/exceptions + NestJS wiring. Live on `main`.                              |
| P1-M03 Enterprise Data Platform                      | ✅ Complete    | Prisma platform, persistence, RLS multi-tenancy. CI-verified incl. integration tests. Live on `main`. |
| P1-M04 Security Foundation                           | ⬜ Not started | Next milestone.                                                                                       |
| P1-M05 Enterprise Shared Services Platform           | ⬜ Not started |                                                                                                       |
| P1-M06 Observability & DevOps Platform               | ⬜ Not started |                                                                                                       |
| P1-M07 Platform Certification & Production Readiness | ⬜ Not started |                                                                                                       |

## Reusable capabilities available now

| Package                  | Capability                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `@knowget/config`        | Shared ESLint / Prettier presets                                                          |
| `@knowget/types`         | Branded ids, `DomainEvent`, pagination, guards                                            |
| `@knowget/shared`        | `Result`, id/date/text utilities, assertions, boundary branding                           |
| `@knowget/logging`       | Structured, level-filtered, redacting logger                                              |
| `@knowget/events`        | Typed, error-isolating in-process event bus                                               |
| `@knowget/testing`       | Deterministic clock, promise flushing                                                     |
| `@knowget/ui`            | Tailwind `cn`, foundational `Button`                                                      |
| `@knowget/auth`          | Principal / permission contracts (P1-M04)                                                 |
| `@knowget/security`      | Password policy, constant-time compare, headers                                           |
| `@knowget/sdk`           | Typed API client foundation                                                               |
| `@knowget/exceptions`    | Standardized error model + safe client responses                                          |
| `@knowget/context`       | Runtime context + AsyncLocalStorage propagation                                           |
| `@knowget/configuration` | Typed schema-validated config, secrets, feature flags                                     |
| `@knowget/health`        | Health indicator registry (liveness/readiness/startup)                                    |
| `@knowget/kernel`        | Clock/Id services, lifecycle, runtime events, kernel assembly                             |
| `@knowget/persistence`   | Repository, query/pagination, specification, unit-of-work, audit, validation              |
| `@knowget/database`      | Prisma platform, generic repository, transactions, RLS multi-tenancy, auditing, DB health |

## Data platform (P1-M03)

PostgreSQL + Prisma (infrastructure only). The reusable `@knowget/persistence`
abstractions are what domains depend on. Multi-tenancy is application-context +
PostgreSQL **Row-Level Security** (`FORCE` RLS on tenant-owned tables, session
scoped via `set_config('app.current_tenant', …)`). RLS isolation, transaction
rollback, soft delete and auditing are verified against a live PostgreSQL. The
API registers a database health indicator into the kernel's readiness probe.
