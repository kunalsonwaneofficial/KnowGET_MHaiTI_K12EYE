# Changelog

All notable changes to KnowGET MHaiTI are documented here. The project follows
[Semantic Versioning](https://semver.org/); phase baselines are tagged.

## [Unreleased] — Security hardening (post-0.2.0)

Post-certification hardening of the live security path, on the frozen Phase-1 core
and the certified `v0.2.0` Identity & Organization program. All env-gated behind
`SECURITY_STORE=persisted` (memory remains the default); the memory request path is
unchanged.

### Added

- **Live security wiring (ADR-0014):** with `SECURITY_STORE=persisted` the running
  app authenticates and authorizes against the certified persisted, tenant-scoped
  identity / principal→role / role→permission stores. Tenant travels as a JWT claim
  (no frozen-code change); an opt-in `@Global` module with an `@Optional` fallback
  keeps memory mode Prisma-free; an idempotent seeder provisions the bootstrap admin.
- **Session & token-revocation persistence (ADR-0015):** `security_session` and
  `security_revocation` tables (FORCE RLS, tenant-isolated); sessions and token
  revocation persisted behind ports and **enforced per request** via an `@Optional`
  `SessionEnforcer` on the JWT guard (fail-closed). A `jti` claim on the persisted
  access token and a `POST /secure/logout` route make revocation effective and
  durable.
- **Refresh-token rotation & replay detection (ADR-0016):** `security_refresh_token`
  table (FORCE RLS); refresh tokens are persisted (SHA-256 hash only), single-use,
  and rotate within a **session-bound family**. `POST /secure/refresh` rotates the
  token and re-issues an access token for the same session; replaying a consumed
  token revokes the family and its session, and the access token's `fid` claim makes
  the guard reject every token in that family. Logout ends the whole lineage.
- **Distributed cache, rate limiter & session read-through (ADR-0017):** one
  backend-agnostic `KeyValueStore` — Redis when `REDIS_URL` is set, in-memory
  otherwise — backs an async rate limiter whose fixed-window counter is shared across
  replicas, a Redis-backed `Cache` behind the existing port, and a session
  read-through cache that skips the per-request session-store validate. Env-gated;
  a `redis` service was added to CI for the gated integration test.
- **Distributed shared services (ADR-0018):** the four remaining shared services are
  distributed behind their existing ports, env-gated with in-memory defaults —
  **Redis** (`REDIS_URL`) backs a shared job queue (atomic Lua claim, retry +
  dead-letter) and a shared in-app inbox; **Postgres** (`SERVICES_STORE=persisted`)
  backs full-text search (`tsvector`/GIN, `plainto_tsquery`/`ts_rank`) and a `bytea`
  blob store. The frozen sync ports are bridged by async seams; the Prisma adapters
  sit behind an opt-in module so the default build stays Prisma-free.
- **KMS signing-key custody & token-signer seam (ADR-0019):** under
  `SECURITY_KEY_CUSTODY=envelope` a `KmsClient` (`wrap`/`unwrap`) unwraps a
  KMS-wrapped signing key at boot to seed the `KeyRing`, so the key is never held in
  plaintext at rest; the `plaintext` default is unchanged. Token issuance runs through
  an async `TokenSigner` seam — the active `HmacTokenSigner` verifies across retained
  key versions (rotation overlap), and an RS256 `AsymmetricTokenSigner` over a
  `KmsSigner` port (private key never leaves the device) is ready behind the seam. No
  frozen change; a cloud-KMS/HSM adapter is the production drop-in.

### Notes

- **TD-16 and TD-18 are resolved:** identity, principal→role, role→permission,
  sessions, token revocation, and refresh-token rotation/replay are all persisted,
  tenant-scoped and enforced under `SECURITY_STORE=persisted`. Promoting `persisted`
  to the default is an operational toggle.
- **TD-17, TD-19 and TD-22 are resolved:** the rate limiter, cache, jobs,
  notifications, search, files and the session read-through all have distributed
  backends (Redis / Postgres) behind their ports, env-gated with the in-memory
  default unchanged.
- **TD-11 is resolved:** signing-key custody moves behind the frozen `KeyRing` — a
  KMS-wrapped key unwrapped at boot (`SECURITY_KEY_CUSTODY=envelope`), an async
  token-signer seam with multi-version verify, and an asymmetric RS256 signer ready
  behind a `KmsSigner` port; env-gated with the plaintext default unchanged.

## [0.2.0] — 2026-07-18 — Phase 2 · Program A: Identity & Organization (certified baseline)

The first Phase-2 domain program, built on the frozen Phase-1 core. Six domains
on the domain architecture pattern (ADR-0010), each tenant-isolated by FORCE
Row-Level Security and composing into a proven, data-driven authorization flow.
Certified and baselined — see
`docs/certification/P2-D01-IdentityOrganization-Certification-Report.md`.

### Added

- **Organization (P2-D01-M01):** the institution hierarchy (trust→school→…→
  section) — aggregate, hierarchy operations, lifecycle, events, RLS table, REST.
- **Person (P2-D01-M02):** the persona-agnostic human record — names,
  demographics, embedded contacts, deterministic dedup match key, merge, RLS
  table, REST.
- **Enterprise Identity (P2-D01-M03):** tenant-scoped login accounts linking a
  Person to identifiers/credential/lockout; GIN identifier lookup; the bridge that
  runs the frozen `AuthenticationEngine` against persisted accounts (ADR-0011).
- **Membership (P2-D01-M04):** a person's roles within an organization node;
  lifecycle; the persisted, tenant-scoped `PrincipalResolver`.
- **Authorization / Roles (P2-D01-M05):** the tenant-scoped role catalogue
  (name→permissions); authorization made data-driven via a permission-resolution
  decorator over the resolver (ADR-0012); membership role-name validation.
- **Relationship (P2-D01-M06):** typed person↔person associations (guardian/
  parent/sibling/spouse/emergency contact) with directionality and `counterpart`.
- **Certification (P2-D01-M07):** a cross-domain suite proving login → principal
  resolution → authorization end to end; certification report; ADR-0013.

### Notes

- The RBAC substance of TD-16 is resolved and certified (persisted, tenant-scoped
  identity / principal→role / role→permission). The live security-bootstrap swap
  (tenant propagation + DB-seeded admin) and session/revocation persistence are
  deliberately scoped to the operations/hardening phase (ADR-0013).

## [0.1.0] — 2026-07-17 — Phase 1: Platform Core (certified baseline)

The complete platform core on which every Phase-2 domain is built. Certified and
frozen (see `docs/certification/P1-Phase1-Certification-Report.md`).

### Added

- **Foundation (P1-M01):** Turborepo + pnpm monorepo, TypeScript strict, ESLint/
  Prettier/Husky/commitlint, CI (verify · security-audit · E2E), containers.
- **Runtime kernel (P1-M02):** kernel (clock/id/lifecycle/health/runtime events),
  AsyncLocalStorage runtime context, schema-validated configuration, global error
  boundary, NestJS platform module.
- **Data platform (P1-M03):** PostgreSQL + Prisma (infrastructure only),
  ORM-agnostic `@knowget/persistence`, transactions/unit-of-work, **RLS
  multi-tenancy** (FORCE, fail-closed), auditing, soft delete, migrations.
- **Security (P1-M04):** `node:crypto` crypto services, versioned key ring,
  HS256 tokens + refresh + revocation, digital identity with lockout, deny-first
  RBAC/ABAC engine, session management, tamper-evident hash-chained audit, and the
  NestJS guard stack (rate-limit → JWT auth → permissions).
- **Shared services (P1-M05):** cache, jobs & scheduling, files/blob storage,
  full-text search, i18n, notifications, document generation, media, workflow, and
  a transactional event outbox — each a port with an in-memory default — plus the
  API `ServicesModule`.
- **Observability & DevOps (P1-M06):** metrics (+ Prometheus `/metrics`), tracing
  spans (correlation→trace bridge), reliability primitives (retry/timeout/circuit
  breaker), threshold alerting, diagnostics (`/diagnostics`), a request
  instrumentation interceptor, and the Prisma musl target for Alpine images.
- **Certification (P1-M07):** Phase-1 certification report, performance baseline
  harness (`pnpm bench`), one-command `pnpm certify`, and this baseline.

### Resolved technical debt

- TD-02 persistence · TD-03 authentication · TD-04 security foundation ·
  TD-10 distributed-tracing spans · TD-15 Prisma Alpine (musl) target.

### Notes

- 30+ workspace packages; 195 package tests + 32 API tests; CI green on `main`.
- Deferred items are interface-protected and tracked in
  `docs/technical-debt-register.md`; no `TODO`/`FIXME` markers exist in the code.
