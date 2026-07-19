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

> **Program A — Identity & Organization is CERTIFIED and baselined at `v0.2.0`
> (2026-07-18).** All 7 contracts merged and CI-green on `main`; the six domains
> compose into a proven, data-driven authorization flow. See
> `docs/certification/P2-D01-IdentityOrganization-Certification-Report.md`.

Domains build on the certified `v0.1.0` core following the domain architecture
pattern (ADR-0010). Program A — Identity & Organization:

| Contract                           | Status      | Notes                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D01-M01 Organization Foundation | ✅ Complete | Organization domain (hierarchy, lifecycle, events) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                                        |
| P2-D01-M02 Person Platform         | ✅ Complete | Person domain (names, demographics, contacts, dedup/merge, lifecycle) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                     |
| P2-D01-M03 Enterprise Identity     | ✅ Complete | Enterprise identity domain (tenant-scoped login accounts, identifiers, credential, lifecycle, lockout) linked to Person + RLS table (GIN identifier lookup) + REST module + auth-engine bridge. CI green; RLS verified on live PostgreSQL. Live on `main`.                      |
| P2-D01-M04 Membership              | ✅ Complete | Membership domain (Person→Organization role assignment, lifecycle, effective period) + RLS table + REST module + persisted tenant-scoped PrincipalResolver. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                          |
| P2-D01-M05 Authorization           | ✅ Complete | Tenant-scoped role catalogue (name→permissions, lifecycle, system-role protection) + RLS table + REST module; authorization made data-driven via a permission-resolution decorator; membership role-name validation. CI green; RLS verified on live PostgreSQL. Live on `main`. |
| P2-D01-M06 Relationship            | ✅ Complete | Relationship domain (typed person↔person associations: guardian/parent/sibling/spouse/emergency-contact, directionality + counterpart, lifecycle) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                         |
| P2-D01-M07 Domain certification    | ✅ Complete | Identity & Organization sub-domain **CERTIFIED** & baselined `v0.2.0`: cross-domain chain (login→principal→authorization) proven in-sandbox; six domains' RLS verified on live PostgreSQL; certification report + ADR-0013. CI green. Live on `main`.                           |

Program B — Institutional Governance builds on the certified `v0.2.0` Identity &
Organization baseline, following the same domain architecture pattern (ADR-0010):

| Contract                                 | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D02 Institutional Governance Platform | ✅ Complete | Governance domain — six aggregates (governance body, committee, policy registry, delegation of authority, resolution, governance calendar) + a **reusable approval workflow** on the Phase-1 engine (policy/committee/resolution/delegation) — as one `@knowget/governance` package; 8 FORCE-RLS tables; 8 domain events; 7 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0021. CI green (PR #20); **live on `main`**. |

Program: Student Lifecycle builds on the same certified `v0.2.0` baseline (and the
governance platform), following the domain architecture pattern (ADR-0010):

| Contract                                       | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D03 Student Lifecycle Intelligence Platform | ✅ Complete | Student lifecycle domain — six aggregates (prospect, applicant, student, educational journey, intelligence profile, immutable timeline) as one `@knowget/student-lifecycle` package; identity linked through Person + Membership (never duplicated); 6 FORCE-RLS tables; 9 domain events; 6 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0022. CI green; **live on `main`**. |

## Reusable capabilities available now

| Package                        | Capability                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowget/config`              | Shared ESLint / Prettier presets                                                                                                                                                                                                                                                                                      |
| `@knowget/types`               | Branded ids, `DomainEvent`, pagination, guards                                                                                                                                                                                                                                                                        |
| `@knowget/shared`              | `Result`, id/date/text utilities, assertions, boundary branding                                                                                                                                                                                                                                                       |
| `@knowget/logging`             | Structured, level-filtered, redacting logger                                                                                                                                                                                                                                                                          |
| `@knowget/events`              | Typed error-isolating event bus + transactional outbox & relay (at-least-once)                                                                                                                                                                                                                                        |
| `@knowget/cache`               | TTL/LRU in-memory cache, single-flight `getOrSet`, namespacing                                                                                                                                                                                                                                                        |
| `@knowget/jobs`                | Retrying/backing-off job queue + recurring/one-shot scheduler (injectable clock)                                                                                                                                                                                                                                      |
| `@knowget/files`               | `BlobStore` (in-memory + node-fs), checksums, prefix listing, traversal-safe keys                                                                                                                                                                                                                                     |
| `@knowget/search`              | Inverted-index full-text search, TF-IDF ranking, field filters, paging                                                                                                                                                                                                                                                |
| `@knowget/i18n`                | Message catalogs, locale fallback, interpolation, `Intl` pluralization                                                                                                                                                                                                                                                |
| `@knowget/notifications`       | Channels (email/SMS/push/in-app), templates, dispatcher, in-app inbox                                                                                                                                                                                                                                                 |
| `@knowget/documents`           | Structured document model + HTML/Markdown/text renderers                                                                                                                                                                                                                                                              |
| `@knowget/media`               | Media asset descriptors + rendition specs behind a `MediaProcessor` port                                                                                                                                                                                                                                              |
| `@knowget/workflow`            | Guarded state-machine definitions + deterministic engine                                                                                                                                                                                                                                                              |
| `@knowget/metrics`             | Counter/gauge/histogram instruments + registry + Prometheus exposition                                                                                                                                                                                                                                                |
| `@knowget/tracing`             | Spans, tracer, in-memory exporter; correlation-id → trace-id bridge                                                                                                                                                                                                                                                   |
| `@knowget/reliability`         | Retry (backoff), timeout, circuit breaker (injectable clock)                                                                                                                                                                                                                                                          |
| `@knowget/alerting`            | Threshold rules over metric readings + firing/resolved manager                                                                                                                                                                                                                                                        |
| `@knowget/diagnostics`         | Runtime snapshot + contributor sections (health/metrics/alerts)                                                                                                                                                                                                                                                       |
| `@knowget/testing`             | Deterministic clock, promise flushing                                                                                                                                                                                                                                                                                 |
| `@knowget/ui`                  | Tailwind `cn`, foundational `Button`                                                                                                                                                                                                                                                                                  |
| `@knowget/auth`                | Principal / permission contracts                                                                                                                                                                                                                                                                                      |
| `@knowget/security`            | scrypt/AES-256-GCM/HMAC crypto, versioned KeyRing, policy config, hash-chained audit, rate limiter, headers                                                                                                                                                                                                           |
| `@knowget/tokens`              | HS256 JWT, hashed refresh tokens, revocation registry                                                                                                                                                                                                                                                                 |
| `@knowget/identity`            | Digital identity, credentials, status/lockout lifecycle, identity repository                                                                                                                                                                                                                                          |
| `@knowget/authorization`       | Deterministic RBAC + ABAC engine, roles, policies                                                                                                                                                                                                                                                                     |
| `@knowget/authentication`      | Session management + authentication engine (verify, lockout, tokens, audit)                                                                                                                                                                                                                                           |
| `@knowget/sdk`                 | Typed API client foundation                                                                                                                                                                                                                                                                                           |
| `@knowget/exceptions`          | Standardized error model (+ `RateLimitError` 429) + safe client responses                                                                                                                                                                                                                                             |
| `@knowget/context`             | Runtime context + AsyncLocalStorage propagation                                                                                                                                                                                                                                                                       |
| `@knowget/configuration`       | Typed schema-validated config, secrets, feature flags                                                                                                                                                                                                                                                                 |
| `@knowget/health`              | Health indicator registry (liveness/readiness/startup)                                                                                                                                                                                                                                                                |
| `@knowget/kernel`              | Clock/Id services, lifecycle, runtime events, kernel assembly                                                                                                                                                                                                                                                         |
| `@knowget/persistence`         | Repository, query/pagination, specification, unit-of-work, audit, validation                                                                                                                                                                                                                                          |
| `@knowget/database`            | Prisma platform, generic repository, transactions, RLS multi-tenancy, auditing, DB health                                                                                                                                                                                                                             |
| `@knowget/organization`        | Organization aggregate, hierarchy ops, lifecycle state machine, events, repository port (P2-D01-M01)                                                                                                                                                                                                                  |
| `@knowget/person`              | Person aggregate (name/demographics/contacts), dedup match key, merge, lifecycle, events, port (P2-D01-M02)                                                                                                                                                                                                           |
| `@knowget/enterprise-identity` | IdentityAccount aggregate — Person-linked, tenant-scoped login accounts: identifiers (normalized keys), credential, lifecycle, lockout, events, port; auth-engine bridge (P2-D01-M03)                                                                                                                                 |
| `@knowget/membership`          | Membership aggregate — Person→Organization role assignment: role-name set, lifecycle, effective period, events, port; persisted PrincipalResolver (P2-D01-M04)                                                                                                                                                        |
| `@knowget/roles`               | Role catalogue aggregate — tenant-scoped RBAC roles (name→permissions), lifecycle, system-role protection, events, port; role existence + permission-union resolution (P2-D01-M05)                                                                                                                                    |
| `@knowget/relationship`        | Relationship aggregate — typed person↔person associations (guardian/parent/sibling/spouse/emergency-contact), directionality + counterpart, lifecycle, events, port (P2-D01-M06)                                                                                                                                      |
| `@knowget/governance`          | Institutional Governance Platform — governance bodies, committees, policy registry (versioned), delegations of authority (approval matrix), resolutions (voting), governance calendar, and a reusable approval workflow (on `@knowget/workflow`); tenant-scoped aggregates, ports, `governance.*` events (P2-D02)     |
| `@knowget/student-lifecycle`   | Student Lifecycle Intelligence Platform — prospect / applicant / student (Person- + Membership-linked), enrollment lifecycle (enquiry → alumni), append-only educational journey and permanent timeline, and an AI-ready intelligence profile; tenant-scoped aggregates, directory ports, `student.*` events (P2-D03) |

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

**Live security hardening (post-P2-D01 certification, ADR-0014).** The persisted
stores are now wirable as the running app's security path behind an env flag,
`SECURITY_STORE=persisted` (default `memory`). Tenant is propagated as a **JWT
claim** — the app re-signs the access token after the frozen engine verifies
credentials — so P1-M04's token issuer and `Session` type stay untouched; the
guard passes the claim to a tenant-scoped `PrincipalResolver`. The persisted path
is an opt-in `@Global` module with an `@Optional` fallback, so the default
(memory) path never imports Prisma and stays in-sandbox testable; an idempotent
seeder provisions the bootstrap administrator on boot. The composition is
port-based and proven end to end in-sandbox (seed → tenant-qualified login →
verify → resolve → authorize) with only the Prisma DI wiring CI-only. See
`docs/reports/P2-D01-SecurityHardening-delivery-report.md`.

**Session & token-revocation persistence (post-P2-D01 certification, ADR-0015 —
closes TD-16).** Sessions and token revocation are now persisted, tenant-scoped
(FORCE RLS on `security_session` / `security_revocation`) **and enforced per
request** in persisted mode. The persisted access token carries a `jti`; the JWT
guard consults an `@Optional` `SessionEnforcer` that validates the session (through
the frozen `SessionManager` — idle/absolute timeout + revoked) and honours
token/family revocation, fail-closed; `POST /secure/logout` revokes the session and
records the token, so both take effect on the next request. The enforcer is absent
in memory mode, so the Phase-1 request path is unchanged. Proven end to end
in-sandbox and on live-PostgreSQL RLS; one session read-and-touch per request is the
sliding-expiry cost (TD-22). With this, **TD-16 is fully resolved**; refresh-token
rotation remains TD-18. See
`docs/reports/P2-D01-SessionRevocationPersistence-delivery-report.md`.

**Refresh-token rotation & replay detection (ADR-0016 — resolves TD-18).** Refresh
tokens are persisted, tenant-scoped (FORCE RLS on `security_refresh_token`),
single-use, and rotate within a **session-bound family**. `POST /secure/refresh`
consumes the presented token and issues a successor plus a fresh access token for
the same (re-validated) session; presenting an already-consumed token is a replay
that revokes the whole family and its session (the access token's `fid` claim then
makes the guard reject every token in the family). Logout revokes session + token +
family. The raw token is never stored (SHA-256 hash only); family revocation reuses
the `RevocationStore`. Persisted-only (memory mode throws) and port-based — the
rotate → replay → revoke loop is proven in-sandbox and on live-PostgreSQL RLS. One
login = one session = one refresh family, collapsed together by logout or replay.
See `docs/reports/P2-D01-RefreshTokenRotation-delivery-report.md`.

**Distributed cache, rate limiter & session read-through (ADR-0017 — resolves
TD-17/TD-22, TD-19 cache dimension).** One backend-agnostic `KeyValueStore` seam —
in-memory by default, Redis when `REDIS_URL` is set — backs three surfaces: an
**async rate limiter** whose atomic fixed-window counter is shared across replicas
(the guard is now async); a **Redis-backed `Cache`** behind the existing
`@knowget/cache` port (wired as the services `CACHE` when `REDIS_URL` is set); and a
**session read-through cache** that lets the enforcer skip the per-request
session-store validate (revocation still checked; logout/replay invalidate; a short
TTL bounds staleness). Env-gated, so the in-memory single-instance default is
unchanged; the ioredis adapter lives at the composition root and is verified live (a
`REDIS_URL`-gated integration test in CI's `redis` service and in sandbox, plus a
cross-instance shared-counter check). See
`docs/reports/P2-D01-DistributedCache-delivery-report.md`.

**Distributed shared services — jobs, notifications, search, files (ADR-0018 —
closes TD-19).** The four remaining shared services now have distributed backends
behind their existing ports, env-gated with in-memory defaults. **Redis** (via
`REDIS_URL`) backs a shared job queue (a sorted set scored by `availableAt`, with
atomic Lua claim so replicas never double-run, retry/backoff and dead-letter) and a
shared in-app inbox. **Postgres** (via `SERVICES_STORE=persisted`) backs full-text
search (a generated `tsvector` + GIN index, `plainto_tsquery`/`ts_rank` ranking,
JSONB `@>` filters) and a `bytea` blob store. The frozen ports' synchronous surfaces
(`SearchIndex`, and the concrete job queue / inbox) are bridged by async app-level
seams (the async-rate-limiter pattern); the Prisma adapters sit behind an opt-in
`PersistedServicesModule` so the default build stays Prisma-free (TD-12). The
Postgres tables are global (the ports are tenant-agnostic; tenant travels as a key
prefix / filterable field). Verified live on Redis (job + inbox integration, shared
across instances) and PostgreSQL (blob round-trip, ranked full-text search with the
GIN index confirmed). With this, **TD-19 is fully resolved**. See
`docs/reports/P2-D01-DistributedServices-delivery-report.md`.

**KMS signing-key custody & token-signer seam (ADR-0019 — resolves TD-11).** The
JWT signing key is no longer forced to live plaintext in the environment. Under
`SECURITY_KEY_CUSTODY=envelope`, a `KmsClient` (`wrap`/`unwrap`; `LocalKmsClient`
uses AES-256-GCM under a KEK) unwraps a wrapped signing key at boot to seed the
`KeyRing`, so every consumer — signer, guard, frozen engine — uses the custodied
material transparently; the `plaintext` default (`SECURITY_JWT_SECRET`) is unchanged.
Token issuance runs through an async `TokenSigner` seam: the active `HmacTokenSigner`
composes the frozen `signJwt`/`verifyJwt` over the `KeyRing`, signing with the current
key and **verifying across retained prior versions** (a rotation overlap window,
resolving the single-current-key limit). An RS256 `AsymmetricTokenSigner` over a
`KmsSigner` port (private key never leaves the device; verify is local via the public
key) is built and tested behind the seam via an in-process RSA software-key double —
a cloud-KMS/HSM adapter is the production drop-in that also moves the KEK root of
trust into hardware. Env-gated, fail-closed, no frozen change; verified in-sandbox
(envelope round-trip, multi-version verify, RS256 sign/verify, and `buildSecurityGraph`
booting in both modes). See `docs/reports/P2-D01-KeyCustody-delivery-report.md`.

**Job-queue visibility timeout & sliding-window rate limiter (ADR-0020).** Two
reliability refinements deferred by ADR-0017/0018, both at the composition root with
no frozen change. The `RedisJobQueue` now claims jobs into an **in-flight set** scored
by a visibility deadline instead of dropping them on claim; a reaper at the top of
`process()` re-queues any in-flight job past its deadline, so a **worker that crashes
mid-run no longer loses the job** (at-least-once recovery). The `KeyValueStore` gains a
clock-aligned `slidingWindow` primitive (two weighted buckets) backing a
`SlidingWindowRateLimiter` that smooths the fixed window's boundary burst; it is
env-selected (`RATE_LIMIT_STRATEGY=sliding`) with the fixed-window default unchanged.
Verified live on Redis (abandoned-job recovery; cross-instance sliding counter). See
`docs/reports/P2-D01-QueueRateLimitHardening-delivery-report.md`.

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

## Institutional Governance Platform (P2-D02, Program B · ADR-0021)

The authoritative model for institutional **authority, accountability and governance**,
delivered as one `@knowget/governance` package (a single bounded context, ADR-0021):
six aggregates — **governance body** (rooted on an organization node, nesting into a
hierarchy), **committee** (single chair/secretary, Person members), **policy registry**
(versioned author→approve→publish→retire + acknowledgment + "which policies apply"),
**delegation of authority** (scope + monetary limit, effective window, approval matrix,
`authorizes` check), **resolution** (draft→voting→tally→implement), and **governance
calendar** (meetings/deadlines/reviews with validated attendees). Each aggregate is pure
(immutable + factory + transitions) behind a repository port, with a Prisma/RLS adapter
at the composition root, an application service on the platform event bus, and a
permission-gated (`governance:read`/`:write`), tenant-scoped REST controller; organization
and person existence enter through injected directory ports (no package dependency).

The contract's **reusable workflows** capability is one `WorkflowDefinition` over the
frozen `@knowget/workflow` engine — `draft → in_review → approved | rejected` with a
`request_changes` loop — instantiated for policy, committee, resolution and delegation
approval, guarded for **segregation of duties** (a submitter cannot approve their own
subject) and persisted as a `GovernanceApproval` whose append-only history is the audit
trail. Eight `governance.*` domain events (body/committee created, policy published/retired,
delegation granted/revoked, resolution approved/implemented) publish onto the shared bus.
Eight tables carry **FORCE RLS** tenant isolation (verified on live PostgreSQL); the
policy-acknowledgment table is an intentional immutable append-only ledger. All six service
tokens are exported for **in-process cross-domain use** — future domains consume policy
applicability, the approval matrix, authority checks and the reusable approval workflow
rather than reimplementing them. Non-goals (student governance, academic execution,
financial transactions, HR, procurement) are excluded by design.

## Student Lifecycle Intelligence Platform (P2-D03, Program: Student Lifecycle · ADR-0022)

The authoritative model of a learner's institutional journey, delivered as one
`@knowget/student-lifecycle` package (a single bounded context, ADR-0022): six
aggregates — **Prospect** (the enquiry funnel), **Applicant** (admissions lifecycle with
document checklist, interview and decision), **Student** (the enrolled learner —
`enrolled → active → on_leave → transferred | withdrawn | graduated → alumni`, with a
unique student number and a single active enrollment per institution), **Educational
Journey** (append-only progression), **Intelligence Profile** (AI-ready indicators +
intervention history), and an immutable, append-only **Timeline**. Each aggregate is
pure (immutable + factory + transitions) behind a repository port, with a Prisma/RLS
adapter at the composition root, an application service on the platform event bus, and a
permission-gated (`student:read`/`:write`), tenant-scoped REST controller.

Identity is never duplicated: every learner is a **Person** and the enrolled student's
affiliation a **Membership**, both entering through injected directory ports; the
journey, intelligence and timeline derive their organization from the student. Nine
`student.*` domain events (prospect created; application submitted; applicant approved;
student enrolled / promoted / transferred / withdrawn / graduated / became alumni)
publish onto the shared bus as the foundation for the downstream academic domains. Six
tables carry **FORCE RLS** tenant isolation (verified on live PostgreSQL); the timeline
is an intentional immutable append-only ledger. All six service tokens are exported for
**in-process cross-domain use** — the point of the platform: every academic domain
(attendance, assessment, fees, …) consumes the student model rather than re-creating it.
Non-goals (attendance recording, timetable, examinations, fees, library, transport,
hostel, LMS) are excluded by design; the Intelligence Profile establishes the model and
integration points only, with prediction deferred to the Institutional Intelligence
program.
