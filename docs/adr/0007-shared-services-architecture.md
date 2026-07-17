# 7. Shared-services (ESSP) architecture

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M05

## Context

P1-M05 must provide the horizontal services every Phase-2 domain needs — cache,
jobs/scheduling, files, search, localization, notifications, document generation,
media, workflow, and reliable event delivery — so domains consume them rather
than reinventing infrastructure, without pulling in domain concepts and without
committing prematurely to specific production backends.

## Decision

- **One package per capability, port + default.** Each service is its own
  `@knowget/*` package exposing a stable interface and a working default
  implementation (in-memory or node-stdlib). Concrete production backends (Redis,
  S3/GCS, PostgreSQL FTS / OpenSearch, SES/Twilio/FCM, a distributed job runner,
  a PostgreSQL outbox store) replace the defaults behind the same contract.

- **Prisma-free.** Shared-service packages depend only on `@knowget/shared` /
  `@knowget/types` / `@knowget/exceptions`, never on the data platform. This keeps
  them fully verifiable in-sandbox and reusable outside a database context; the
  only CI-gated piece is the API `ServicesModule`.

- **Deterministic time.** The cache, job queue and scheduler accept an injectable
  clock. The job queue and scheduler are **pull-based** — work runs on an explicit
  `process()` / `tick()` (a real worker/timer in production, a test clock in
  unit tests) — so retries, backoff and recurrence are reproducible.

- **Reliable events via a transactional outbox.** Events are recorded to an
  `OutboxStore` (written in the same transaction as the business change) and an
  `OutboxRelay` drains them to the `EventBus` **at-least-once**; consumers are
  idempotent on `metadata.eventId`. This is the Phase-1 step toward the P3-D02
  streaming backbone, behind the existing `EventBus` contract.

- **Safe defaults.** The node-fs blob store confines keys to its root (rejecting
  path traversal); the HTML document renderer escapes content; notification
  dispatch fails loudly when a channel has no registered transport.

- **API integration seam.** A `ServicesModule` (`@Global`) provides the service
  singletons via DI and exposes read-only `/services` catalog and self-test
  routes. Phase-2 domain modules inject the services by token.

## Consequences

- Domains build on a consistent, tested services layer; swapping a backend is a
  provider change, not a domain change.
- Deterministic, in-sandbox-verifiable services (no hidden timers or network),
  with a live in-process integration test of the assembled module.
- **Deferred (interface-protected):** in-memory implementations across the board
  (→ production backends), the in-process outbox/relay (→ PostgreSQL outbox +
  streaming backbone, TD-01/P3-D02), and passthrough media processing (→ real
  transcoding). The API assembly is CI-verified (Prisma, TD-12).
