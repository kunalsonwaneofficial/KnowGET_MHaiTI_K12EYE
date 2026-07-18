# 20. Job-queue visibility timeout and sliding-window rate limiter

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Reliability refinements noted in ADR-0017 (limiter) and ADR-0018 (queue)

## Context

Two limitations were explicitly deferred by earlier milestones:

- **ADR-0018** — the Redis job queue claimed a job by removing it from the ready set,
  so a worker that crashed mid-run **lost the job** (no visibility timeout).
- **ADR-0017** — the distributed rate limiter was a **fixed window**, which lets up
  to 2×`max` requests through across a window boundary.

Both are composition-root code (`apps/api/src/platform`), no frozen package involved.

## Decision

1. **Job-queue visibility timeout.** `process()` now claims due jobs into an
   **in-flight sorted set** scored by a visibility deadline (`now +
visibilityTimeoutMs`, default 30s) rather than dropping them on claim. On success,
   retry or dead-letter the job leaves the in-flight set. Before claiming, `process()`
   **reaps** in-flight jobs whose deadline has passed, moving them back to the ready
   set — so a crashed worker's claim is retried by another worker. This is
   **at-least-once**: a job whose worker dies after a side effect but before
   completion may run again (the standard visibility-timeout trade-off). The Lua
   claim/reap keep replicas from double-running a live claim.

2. **Sliding-window rate limiter.** A new `slidingWindow` primitive on the
   `KeyValueStore` keeps two **clock-aligned** buckets and returns the current
   bucket's count plus the previous bucket weighted by its remaining overlap
   (a sliding-window counter — smooth, and O(1) memory versus a per-request log).
   `SlidingWindowRateLimiter` uses it. Selected by `RATE_LIMIT_STRATEGY=sliding`;
   the default stays `fixed`, so existing behavior is unchanged. Both strategies are
   shared across replicas over Redis and per-instance over the in-memory store.

## Consequences

- A crashed worker no longer loses its job; it is recovered after the visibility
  timeout. The happy path is unchanged (claim → run → complete removes it from
  in-flight); `pending()` now counts ready + in-flight.
- Operators can opt into smoother rate limiting (`RATE_LIMIT_STRATEGY=sliding`)
  without a boundary burst; the fixed-window default and the guard are untouched.
- Verified live: the Redis job queue recovers an abandoned in-flight job, and the
  Redis sliding-window counter is shared across instances (both in CI's `redis`
  service and in sandbox); the sliding-window weighting is unit-tested deterministically.
- **Noted:** a crash does not consume a `maxAttempts` budget (attempts persist only
  on retry), so a job that repeatedly crashes its worker relies on external
  monitoring rather than the dead-letter path; a per-job visibility override and a
  true sliding-log limiter remain possible future refinements.
