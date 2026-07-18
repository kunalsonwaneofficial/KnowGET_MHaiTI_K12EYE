# 18. Distributed shared services: jobs, notifications, search, files

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Remaining TD-19 backends (jobs, notifications, search, files)

## Context

ADR-0017 resolved TD-19's cache dimension. The four remaining shared services —
jobs, notifications, search, files — were still in-memory/per-instance. Their ports
are heterogeneous: `BlobStore` is async (a distributed backend drops straight in),
but `SearchIndex` is **synchronous** and `InMemoryJobQueue` / `InAppInbox` are
**concrete classes** with synchronous read methods — none of which a network-backed
backend can satisfy directly. This sandbox (and CI) provide Redis and Postgres, so
those are the live-verifiable backends; S3/MinIO and OpenSearch are not available here.

## Decision

1. **Async app-level seams for the sync ports.** Just as the rate limiter got an
   async seam (ADR-0017), introduce `JobQueue`, `Inbox` and `SearchService` async
   interfaces at the composition root, each with an in-memory adapter wrapping the
   frozen implementation and a distributed adapter. `BlobStore` is already async, so
   it needs no seam. No frozen package changes.

2. **Redis for jobs and notifications.** `RedisJobQueue` is a pull-based queue over
   a shared sorted set scored by `availableAt`; `process()` **atomically claims** the
   due jobs (a Lua `ZRANGEBYSCORE`+`ZREM`) so concurrent replicas never double-run
   one, then retries with backoff and dead-letters — matching the frozen queue's
   semantics. `RedisInbox` keeps per-recipient notification lists shared across
   replicas. Both reuse the single Redis connection (`REDIS_CLIENT` from the KeyValue
   module).

3. **Postgres for search and files.** `PrismaSearchIndex` is a full-text index: a
   generated `tsvector` column (GIN-indexed) with `plainto_tsquery` + `ts_rank`
   ranking and JSONB `@>` field filters. `PrismaBlobStore` stores bytes in a `bytea`
   column. Both are **global** tables (their ports are tenant-agnostic; the tenant
   travels as a key prefix or a filterable field), so neither is RLS-scoped.

4. **Env-gated, in-memory default.** `REDIS_URL` selects Redis for jobs/notifications
   (as for cache); `SERVICES_STORE=persisted` selects Postgres for search/files. With
   neither set, the in-memory implementations run — dev/test/sandbox unchanged. The
   Prisma-backed adapters sit behind an opt-in `PersistedServicesModule` (imported by
   the root module only in persisted mode) so the default build stays Prisma-free
   (TD-12); the services module picks them up via `@Optional` injection.

5. **Verified live.** Redis integration tests (job claim/retry/dead-letter/delay and
   cross-instance sharing; inbox deliver/read cross-instance) run in CI's `redis`
   service and in sandbox; the Postgres blob round-trip and ranked full-text search
   (GIN index confirmed) are verified on live PostgreSQL.

## Consequences

- **TD-19 is fully resolved.** All shared services — cache (ADR-0017), jobs,
  notifications, search, files — have distributed backends behind their ports,
  env-gated, with in-memory defaults.
- A multi-replica deployment shares one job queue, one inbox, one search index and
  one blob store; single-instance and dev keep the zero-dependency in-memory path.
- No frozen code changed; the sync ports are bridged by async seams at the
  composition root (the same pattern as the async rate limiter).
- **Noted limitations / future refinements:** the Redis job queue has no visibility
  timeout yet, so a job whose worker crashes mid-run is not re-queued; Postgres
  `bytea` blobs suit moderate sizes (an S3/GCS object store slots behind `BlobStore`
  for large media, and OpenSearch behind `SearchService`, if needed); a sliding-window
  limiter (ADR-0017) and KMS key custody (TD-11) remain separate.
