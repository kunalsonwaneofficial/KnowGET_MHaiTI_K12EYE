# Platform State Register

Authoritative record of what has been engineered, certified, and is reusable.
Updated at the close of every engineering contract.

> **Phase 1 — Platform Core is CERTIFIED and frozen at `v0.1.0` (2026-07-17).**
> All 7 contracts merged and CI-green on `main`; Phase-2 domains build on this
> baseline. See `docs/certification/P1-Phase1-Certification-Report.md`.

## Phase 1 — Platform Core Engineering

| Contract                                             | Status      | Notes                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-M01 Repository & Workspace Foundation             | ✅ Complete | Monorepo, 11 packages, 4 apps, CI, Docker, hooks. Live on `main`.                                                                                                                                 |
| P1-M02 Platform Runtime Kernel                       | ✅ Complete | Kernel/context/config/health/exceptions + NestJS wiring. Live on `main`.                                                                                                                          |
| P1-M03 Enterprise Data Platform                      | ✅ Complete | Prisma platform, persistence, RLS multi-tenancy. CI-verified incl. integration tests. Live on `main`.                                                                                             |
| P1-M04 Security Foundation                           | ✅ Complete | Crypto/keys, tokens, identity, RBAC/ABAC, sessions, auth engine, hash-chained audit, and the NestJS guard stack. CI green (verify incl. Prisma build, audit, E2E). Live on `main`.                |
| P1-M05 Enterprise Shared Services Platform           | ✅ Complete | Cache, jobs/scheduler, files, search, i18n, notifications, documents, media, workflow, events outbox + API ServicesModule. CI green (verify incl. Prisma build, audit, E2E). Live on `main`.      |
| P1-M06 Observability & DevOps Platform               | ✅ Complete | Metrics (+Prometheus), tracing spans, reliability, alerting, diagnostics + API ObservabilityModule (/metrics, /diagnostics, request interceptor). Resolves TD-10/TD-15. CI green. Live on `main`. |
| P1-M07 Platform Certification & Production Readiness | ✅ Complete | Phase-1 certified; performance baseline captured; baseline frozen and tagged `v0.1.0`. See `docs/certification/P1-Phase1-Certification-Report.md`.                                                |

## Phase 2 — Enterprise Domain Engineering

Domains build on the certified `v0.1.0` core following the domain architecture
pattern (ADR-0010). Program A — Identity & Organization:

| Contract                           | Status         | Notes                                                                                                                                                                                                                                                                           |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D01-M01 Organization Foundation | ✅ Complete    | Organization domain (hierarchy, lifecycle, events) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                                        |
| P2-D01-M02 Person Platform         | ✅ Complete    | Person domain (names, demographics, contacts, dedup/merge, lifecycle) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                     |
| P2-D01-M03 Enterprise Identity     | ✅ Complete    | Enterprise identity domain (tenant-scoped login accounts, identifiers, credential, lifecycle, lockout) linked to Person + RLS table (GIN identifier lookup) + REST module + auth-engine bridge. CI green; RLS verified on live PostgreSQL. Live on `main`.                      |
| P2-D01-M04 Membership              | ✅ Complete    | Membership domain (Person→Organization role assignment, lifecycle, effective period) + RLS table + REST module + persisted tenant-scoped PrincipalResolver. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                          |
| P2-D01-M05 Authorization           | ✅ Complete    | Tenant-scoped role catalogue (name→permissions, lifecycle, system-role protection) + RLS table + REST module; authorization made data-driven via a permission-resolution decorator; membership role-name validation. CI green; RLS verified on live PostgreSQL. Live on `main`. |
| P2-D01-M06 Relationship            | ⬜ Not started | Next milestone.                                                                                                                                                                                                                                                                 |
| P2-D01-M07 Domain certification    | ⬜ Not started | Identity & Organization sub-domain certification.                                                                                                                                                                                                                               |

## Reusable capabilities available now

| Package                        | Capability                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowget/config`              | Shared ESLint / Prettier presets                                                                                                                                                      |
| `@knowget/types`               | Branded ids, `DomainEvent`, pagination, guards                                                                                                                                        |
| `@knowget/shared`              | `Result`, id/date/text utilities, assertions, boundary branding                                                                                                                       |
| `@knowget/logging`             | Structured, level-filtered, redacting logger                                                                                                                                          |
| `@knowget/events`              | Typed error-isolating event bus + transactional outbox & relay (at-least-once)                                                                                                        |
| `@knowget/cache`               | TTL/LRU in-memory cache, single-flight `getOrSet`, namespacing                                                                                                                        |
| `@knowget/jobs`                | Retrying/backing-off job queue + recurring/one-shot scheduler (injectable clock)                                                                                                      |
| `@knowget/files`               | `BlobStore` (in-memory + node-fs), checksums, prefix listing, traversal-safe keys                                                                                                     |
| `@knowget/search`              | Inverted-index full-text search, TF-IDF ranking, field filters, paging                                                                                                                |
| `@knowget/i18n`                | Message catalogs, locale fallback, interpolation, `Intl` pluralization                                                                                                                |
| `@knowget/notifications`       | Channels (email/SMS/push/in-app), templates, dispatcher, in-app inbox                                                                                                                 |
| `@knowget/documents`           | Structured document model + HTML/Markdown/text renderers                                                                                                                              |
| `@knowget/media`               | Media asset descriptors + rendition specs behind a `MediaProcessor` port                                                                                                              |
| `@knowget/workflow`            | Guarded state-machine definitions + deterministic engine                                                                                                                              |
| `@knowget/metrics`             | Counter/gauge/histogram instruments + registry + Prometheus exposition                                                                                                                |
| `@knowget/tracing`             | Spans, tracer, in-memory exporter; correlation-id → trace-id bridge                                                                                                                   |
| `@knowget/reliability`         | Retry (backoff), timeout, circuit breaker (injectable clock)                                                                                                                          |
| `@knowget/alerting`            | Threshold rules over metric readings + firing/resolved manager                                                                                                                        |
| `@knowget/diagnostics`         | Runtime snapshot + contributor sections (health/metrics/alerts)                                                                                                                       |
| `@knowget/testing`             | Deterministic clock, promise flushing                                                                                                                                                 |
| `@knowget/ui`                  | Tailwind `cn`, foundational `Button`                                                                                                                                                  |
| `@knowget/auth`                | Principal / permission contracts                                                                                                                                                      |
| `@knowget/security`            | scrypt/AES-256-GCM/HMAC crypto, versioned KeyRing, policy config, hash-chained audit, rate limiter, headers                                                                           |
| `@knowget/tokens`              | HS256 JWT, hashed refresh tokens, revocation registry                                                                                                                                 |
| `@knowget/identity`            | Digital identity, credentials, status/lockout lifecycle, identity repository                                                                                                          |
| `@knowget/authorization`       | Deterministic RBAC + ABAC engine, roles, policies                                                                                                                                     |
| `@knowget/authentication`      | Session management + authentication engine (verify, lockout, tokens, audit)                                                                                                           |
| `@knowget/sdk`                 | Typed API client foundation                                                                                                                                                           |
| `@knowget/exceptions`          | Standardized error model (+ `RateLimitError` 429) + safe client responses                                                                                                             |
| `@knowget/context`             | Runtime context + AsyncLocalStorage propagation                                                                                                                                       |
| `@knowget/configuration`       | Typed schema-validated config, secrets, feature flags                                                                                                                                 |
| `@knowget/health`              | Health indicator registry (liveness/readiness/startup)                                                                                                                                |
| `@knowget/kernel`              | Clock/Id services, lifecycle, runtime events, kernel assembly                                                                                                                         |
| `@knowget/persistence`         | Repository, query/pagination, specification, unit-of-work, audit, validation                                                                                                          |
| `@knowget/database`            | Prisma platform, generic repository, transactions, RLS multi-tenancy, auditing, DB health                                                                                             |
| `@knowget/organization`        | Organization aggregate, hierarchy ops, lifecycle state machine, events, repository port (P2-D01-M01)                                                                                  |
| `@knowget/person`              | Person aggregate (name/demographics/contacts), dedup match key, merge, lifecycle, events, port (P2-D01-M02)                                                                           |
| `@knowget/enterprise-identity` | IdentityAccount aggregate — Person-linked, tenant-scoped login accounts: identifiers (normalized keys), credential, lifecycle, lockout, events, port; auth-engine bridge (P2-D01-M03) |
| `@knowget/membership`          | Membership aggregate — Person→Organization role assignment: role-name set, lifecycle, effective period, events, port; persisted PrincipalResolver (P2-D01-M04)                        |
| `@knowget/roles`               | Role catalogue aggregate — tenant-scoped RBAC roles (name→permissions), lifecycle, system-role protection, events, port; role existence + permission-union resolution (P2-D01-M05)    |

## Data platform (P1-M03)

PostgreSQL + Prisma (infrastructure only). The reusable `@knowget/persistence`
abstractions are what domains depend on. Multi-tenancy is application-context +
PostgreSQL **Row-Level Security** (`FORCE` RLS on tenant-owned tables, session
scoped via `set_config('app.current_tenant', …)`). RLS isolation, transaction
rollback, soft delete and auditing are verified against a live PostgreSQL. The
API registers a database health indicator into the kernel's readiness probe.

## Security foundation (P1-M04)

Cryptography is `node:crypto` only (scrypt, AES-256-GCM, HMAC-SHA256, CSPRNG).
Authentication (the signed JWT `sub`) is separated from authorization: roles and
permissions are resolved **server-side per request** by a `PrincipalResolver`, so
role changes apply immediately. The `AuthorizationEngine` is deny-first (explicit
deny → RBAC → allow policy → default-deny). The `SecurityAuditLogger` hash-chains
events so tampering is detectable. The API installs a global, ordered guard stack
— **rate limit → JWT authentication → permissions** — with `@Public`,
`@RequirePermissions`, `@RateLimit` and `@CurrentPrincipal`; `/secure` reference
routes exercise it end to end. Session and revocation
stores are in-memory behind interfaces, to be replaced by persistence-backed
implementations in Phase 2; the **identity** store (`@knowget/enterprise-identity`,
P2-D01-M03), the **principal→role** store (`@knowget/membership`, P2-D01-M04) and
the **role→permission** catalogue (`@knowget/roles`, P2-D01-M05) now have
persisted, tenant-scoped implementations behind their ports, making authorization
**data-driven per tenant** (resolved onto the principal, then unioned by the
frozen engine — TD-16 progressively resolved). Bootstrap secrets are required in production
(fail-closed). The full API build is CI-verified (Prisma, TD-12); the security
layer is additionally verified in-sandbox by an isolated type-check and an
in-process `SecurityModule` integration spec.

## Shared services (P1-M05)

Twelve horizontal capabilities every Phase-2 domain consumes rather than
rebuilds: logging (P1-M01), events (+ transactional outbox), cache, jobs &
scheduling, files, search, i18n, notifications, documents, media, and workflow.
Each is a stable port with a working in-memory (or node-stdlib) default;
production/distributed backends slot in behind the same contract. Time-sensitive
services (cache, jobs, scheduler) take an injectable clock and the job/scheduler
run pull-based, so behaviour is deterministic. Every package is Prisma-free and
fully verified in-sandbox; the API `ServicesModule` provides them via DI and
exposes `/services` catalog + self-test routes, validated by an in-process
integration spec.

## Observability & DevOps (P1-M06)

Metrics (counter/gauge/histogram with Prometheus text exposition), distributed
tracing (spans with a correlation-id → trace-id bridge, resolving the
correlation-only limitation), reliability primitives (retry, timeout, circuit
breaker), threshold alerting, and runtime diagnostics — each a backend-agnostic
port with an in-memory default (OTLP/Prometheus-remote/APM exporters slot in
behind the same seams). The API `ObservabilityModule` provides them via DI,
installs a single global interceptor that records a labelled request counter, a
latency histogram and a per-request span, and exposes `/metrics` (Prometheus
scrape) and `/diagnostics` (JSON snapshot). The Prisma client now also targets
`linux-musl-openssl-3.0.x` for Alpine images. Container slimming, backup/recovery
and dashboard visualization remain operations-phase concerns.
