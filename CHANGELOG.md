# Changelog

All notable changes to KnowGET MHaiTI are documented here. The project follows
[Semantic Versioning](https://semver.org/); phase baselines are tagged.

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
