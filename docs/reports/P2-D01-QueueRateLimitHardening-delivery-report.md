# Engineering Delivery Report — Job-Queue Visibility Timeout & Sliding-Window Rate Limiter

**Reliability hardening** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **Contract**   | Reliability refinements deferred by ADR-0017 (limiter) and ADR-0018 (job queue)                               |
| **Status**     | ✅ Complete — merged to `main` (CI green). Verified in-sandbox (154 API tests, live Redis).                   |
| **Depends on** | ADR-0017 (KeyValue/rate limiter), ADR-0018 (Redis job queue)                                                  |
| **Scope**      | Job-queue visibility timeout (crash recovery) + sliding-window rate limiter, **env-gated**. No frozen change. |
| **Date**       | 18 July 2026                                                                                                  |

---

## 1. Mission recap

Two limitations were noted-but-deferred by earlier milestones: the Redis job queue
lost a job if its worker crashed mid-run (no visibility timeout), and the distributed
rate limiter was a fixed window (a boundary burst of up to 2×`max`). This milestone
closes both, at the composition root, with no frozen-package change.

## 2. What was engineered

| Piece                      | Delivered                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visibility timeout**     | `RedisJobQueue` claims into an in-flight ZSET scored by a visibility deadline; a reaper re-queues jobs whose deadline passed (crash recovery, at-least-once)     |
| **Sliding-window limiter** | A clock-aligned `slidingWindow` primitive on the `KeyValueStore` (in-memory + Redis Lua) + `SlidingWindowRateLimiter`; selected by `RATE_LIMIT_STRATEGY=sliding` |
| **Wiring**                 | The KeyValue module picks fixed vs sliding from env (default **fixed**, unchanged); job-queue `visibilityTimeoutMs` is configurable (default 30s)                |

## 3. How it works

- **Visibility timeout:** claiming a job moves it from the ready set to an in-flight
  set scored `now + visibilityTimeoutMs`, instead of removing it. Success/retry/
  dead-letter remove it from in-flight; at the top of `process()` a reaper moves any
  in-flight job past its deadline back to ready, so another worker retries a crashed
  claim. Lua keeps the claim and reap atomic across replicas. `pending()` counts
  ready + in-flight.
- **Sliding-window limiter:** two clock-aligned buckets per client; the estimate is
  the current bucket's count plus the previous bucket weighted by its overlap
  fraction — smooth at the boundary, O(1) memory. Env-selected, backend-agnostic.

## 4. Verification

- **In-sandbox (green): 154 API tests** (149 prior, **5 new**) — the sliding-window
  limiter (accumulate-to-max, boundary-burst blocked, previous-window decay, all with
  a deterministic clock) and the job-queue recovery path.
- **Live Redis (green):** the job queue **recovers a job abandoned by a crashed
  worker** (an expired in-flight claim is reaped and run), and the sliding-window
  counter is **shared across store instances** — both run against a real Redis in CI
  (`redis` service) and in sandbox, alongside the existing job/inbox/window checks.
- **No regression:** the existing fixed-window limiter and job-queue tests
  (claim/retry/dead-letter/delay) stay green; the default rate-limit strategy and the
  guard are unchanged.
- **Typecheck / lint / format:** apps/api `tsc --noEmit` clean (generated client via
  the offline WASM path); ESLint 0 warnings; Prettier clean. No schema change.

## 5. Decisions

Recorded in **ADR-0020**. In brief: the job queue claims into an in-flight set with a
visibility deadline and reaps expired claims (at-least-once crash recovery); a
clock-aligned sliding-window-counter primitive on the `KeyValueStore` backs a
`SlidingWindowRateLimiter`, env-selected (`RATE_LIMIT_STRATEGY=sliding`) with the
fixed-window default unchanged; no frozen change.

## 6. Technical debt

- **Both deferred refinements resolved:** the Redis job queue now has a visibility
  timeout (crash recovery), and a sliding-window rate limiter is available behind an
  env toggle.
- **Noted:** a crash does not consume a `maxAttempts` budget (attempts persist only
  on retry), so a job that repeatedly crashes its worker relies on external
  monitoring; a per-job visibility override and a true sliding-log limiter remain
  possible future refinements.

## 7. Recommendation

Keep `visibilityTimeoutMs` comfortably above the longest expected handler runtime so
a slow-but-healthy job is not reaped and double-run. Enable
`RATE_LIMIT_STRATEGY=sliding` where a smooth per-instant rate matters more than the
cheaper fixed window; leave it `fixed` otherwise.
