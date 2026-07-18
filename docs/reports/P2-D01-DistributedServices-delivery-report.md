# Engineering Delivery Report — Distributed Shared Services: Jobs, Notifications, Search, Files (closes TD-19)

**Live security/services wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Contract**   | Remaining TD-19 backends — jobs, notifications, search, files                                          |
| **Status**     | ✅ Complete — merged to `main` (CI green). Verified in-sandbox + live Redis & Postgres.                |
| **Depends on** | P1-M05 (service ports), ADR-0017 (KeyValue/Redis backend)                                              |
| **Scope**      | All four remaining shared services distributed, **env-gated (in-memory default)**. Fully closes TD-19. |
| **Date**       | 18 July 2026                                                                                           |

---

## 1. Mission recap

ADR-0017 closed TD-19's cache dimension. This milestone distributes the four
remaining shared services — jobs, notifications, search, files — behind their
existing ports, env-gated with in-memory defaults, so a multi-replica deployment
shares one queue, inbox, search index and blob store. Redis and Postgres are the
backends (both live-verifiable here); the frozen ports' sync surfaces are bridged by
async app-level seams (the async-rate-limiter pattern).

## 2. What was engineered

| Service (backend)         | Delivered                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jobs (Redis)**          | An async `JobQueue` seam; `RedisJobQueue` — a shared sorted set scored by `availableAt`, **atomic claim** via Lua so replicas never double-run, retry/backoff + dead-letter   |
| **Notifications (Redis)** | An async `Inbox` seam; `RedisInbox` — per-recipient notification lists shared across replicas, delivered via the dispatcher's `in_app` channel                                |
| **Search (Postgres)**     | An async `SearchService` seam; `PrismaSearchIndex` — a generated `tsvector` (GIN) with `plainto_tsquery` + `ts_rank` ranking and JSONB `@>` field filters                     |
| **Files (Postgres)**      | `PrismaBlobStore` (the `BlobStore` port is already async) — bytes in a `bytea` column, keyed globally, checksummed                                                            |
| **Wiring**                | `REDIS_URL` selects Redis (jobs, notifications); `SERVICES_STORE=persisted` selects Postgres (search, files) behind an opt-in `PersistedServicesModule` (Prisma-free default) |

## 3. How it works

- **Redis backends** reuse the single connection from the KeyValue module. The job
  queue claims due jobs atomically (Lua), executes with the local handler, retries
  with backoff and dead-letters; the inbox keeps shared per-recipient lists.
- **Postgres backends** are global (their ports are tenant-agnostic; the tenant is a
  key prefix or a filterable field), so neither table is RLS-scoped. The Prisma
  adapters sit behind a conditionally-imported module so the default build never
  pulls Prisma in (TD-12).
- **Sync-port bridges:** the frozen `SearchIndex` is synchronous and the queue/inbox
  are concrete classes, so each gets an async interface with an in-memory adapter
  (wrapping the frozen impl) and a distributed adapter — no frozen change.

## 4. Verification

- **In-sandbox (green): 120 API tests** (114 prior, **6 new**) — the async job queue,
  inbox and search-service in-memory adapters. The `ServicesModule` integration spec
  passes with the new wiring (and passes again against real Redis).
- **Live Redis (green):** gated integration tests — the job queue (atomic claim,
  retry → dead-letter, delayed-not-early, **shared across instances**) and the inbox
  (deliver → list → mark-read → count, **cross-instance**) — run against a real Redis
  in CI (`redis` service) and in sandbox.
- **Live PostgreSQL (green):** the blob round-trip (`bytea` + prefix list) and the
  full-text search — ranked `plainto_tsquery`/`ts_rank`, JSONB `@>` filtering,
  window-count totals, and the **GIN tsvector index confirmed in use** (Bitmap Index
  Scan) — verified on a real PostgreSQL 16.
- **Full typecheck** of the new/changed surface — this time including the Prisma
  adapters, compiled against the generated client (produced offline via Prisma's WASM
  schema parser, `engine=none`, to sidestep TD-12). That surfaced one real defect the
  earlier Prisma-free pass could not: a Node `Buffer` (`Buffer<ArrayBufferLike>` under
  Node 22 `@types/node`) is not assignable to Prisma 6's `Bytes` input
  (`Uint8Array<ArrayBuffer>`), fixed by copying into an `ArrayBuffer`-backed view in the
  blob store's write path. ESLint 0 warnings; Prettier clean.

## 5. Decisions

Recorded in **ADR-0018**. In brief: async app-level seams bridge the frozen sync
ports (`JobQueue`/`Inbox`/`SearchService`); Redis backs jobs (atomic-claim pull
queue) and notifications; Postgres backs search (tsvector FTS) and files (bytea);
env-gated (`REDIS_URL` + `SERVICES_STORE=persisted`) with in-memory defaults; the
Prisma adapters sit behind an opt-in module so the default build stays Prisma-free.

## 6. Technical debt

- **TD-19 — resolved.** Every shared service — cache (ADR-0017), jobs, notifications,
  search, files — now has a distributed backend behind its port, env-gated.
- **Noted:** the Redis job queue lacks a visibility timeout (a crashed worker's
  claimed job is not re-queued) — a future refinement; Postgres `bytea` suits moderate
  blob sizes (an S3/GCS object store or OpenSearch slots behind the same ports for
  scale); the sliding-window limiter and KMS custody (TD-11) remain separate.
- **TD-12 narrowed (not closed).** The Prisma client's TypeScript surface can be
  generated offline (`engine=none`, WASM schema parser), so Prisma adapters are now
  locally typecheckable — the blob-store defect above would have been caught pre-CI.
  Live query execution still needs a real database, so DB integration remains
  CI-verified.

## 7. Recommendation

Set `REDIS_URL` and `SERVICES_STORE=persisted` in multi-replica environments to
share all services; leave them unset for single-instance/local. Add a job-queue
visibility timeout and an object-store `BlobStore` adapter when workloads warrant.
