# Engineering Delivery Report — Distributed Cache, Rate Limiter & Session Read-Through (TD-17/19/22)

**Live security wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | Distributed session / rate-limit cache (TD-17 / TD-19 / TD-22)                                                                        |
| **Status**     | ✅ Complete — merged to `main` (`31a8cde`); CI green. **TD-17/22 resolved; TD-19 cache dimension resolved.** Live behind `REDIS_URL`. |
| **Depends on** | P1-M04 (rate limiter), P1-M05 (`Cache` port), ADR-0015 (session enforcer)                                                             |
| **Scope**      | One Redis-backed key-value backend behind the rate limiter, cache and session read-through, **env-gated (in-memory default)**.        |
| **Date**       | 18 July 2026                                                                                                                          |

---

## 1. Mission recap

Three deferrals shared one cause — per-instance in-process state: the rate limiter
(TD-17), the shared cache (TD-19), and the per-request session read (TD-22). This
milestone introduces **one distributed key-value seam** — in-memory by default,
Redis when `REDIS_URL` is set — and routes all three through it, so a multi-replica
deployment shares one rate-limit budget, one cache, and prompt cross-node session
revocation, while dev/test/sandbox keep the unchanged in-memory default.

## 2. What was engineered

| Layer                            | Delivered                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KeyValueStore**                | Backend-agnostic port (`get`/`set(ttl)`/`delete`/`deleteByPrefix`/atomic `incrementWindow`) with an in-memory impl and an ioredis `RedisKeyValueStore` (atomic window via a Lua script) |
| **Rate limiter (TD-17)**         | `KeyValueRateLimiter` (async) + an **async `RateLimitGuard`** over it — concurrent replicas share one fixed-window counter                                                              |
| **Cache (TD-19)**                | `KeyValueCache` implementing the existing `@knowget/cache` `Cache` port; wired as the services `CACHE` when `REDIS_URL` is set (in-memory LRU otherwise)                                |
| **Session read-through (TD-22)** | `SessionValidityCache`; the enforcer skips the session-store validate on a cache hit (revocation still checked every request), with invalidation on logout/replay                       |
| **Wiring**                       | `KeyValueModule` (`@Global`, env-gated, closes Redis on shutdown); a `redis` service + `REDIS_URL` added to CI                                                                          |

## 3. How it works

- **`REDIS_URL` selects the backend.** Set ⇒ `RedisKeyValueStore` (shared across
  replicas); unset ⇒ `InMemoryKeyValueStore` (per-instance — the Phase-1 default).
  One env flag turns all three surfaces distributed.
- **Rate limiting**: the guard calls the async limiter with the client key and the
  route's budget; the Redis store's atomic `INCR`+`PEXPIRE` gives one counter across
  replicas.
- **Cache**: unchanged callers hit the same async `Cache` port; behind it is Redis
  (shared) or in-memory (LRU).
- **Session enforcement**: a recently-validated session is served from the cache
  without the session-store round-trip; revocation is still checked, and logout /
  replay invalidate the entry — cross-replica when Redis-backed.

## 4. Verification

- **In-sandbox (green): 114 API tests** (97 prior, **17 new**) — the key-value store
  (get/set/ttl/delete/atomic window), the cache (get/set/has/delete/clear/getOrSet +
  single-flight), the async rate limiter (allow/deny/reset), the session cache
  (mark/invalidate/expire/tenant isolation), the async rate-limit guard (headers,
  429 + Retry-After, per-route override), and the enforcer read-through (fast path
  skips the store validate until invalidated). The `SecurityModule` and
  `ServicesModule` integration specs still pass.
- **Live Redis (green):** a `REDIS_URL`-gated integration test (set/get/TTL, expiry,
  and an **atomic window counter shared across store instances**) and the security +
  services modules run against a real Redis — the cache self-test key lands in Redis
  and two "replicas" share one fixed-window counter, proving distribution.
- **Prisma-free typecheck** of the new/changed surface; ESLint 0 warnings; Prettier
  clean.
- **CI:** a `redis:7` service + `REDIS_URL` were added so the gated integration test
  runs in CI as well as in sandbox.

## 5. Decisions

Recorded in **ADR-0017**. In brief: one backend-agnostic `KeyValueStore` seam
(in-memory default, Redis when `REDIS_URL` is set) backs an async distributed rate
limiter (guard made async — the frozen sync limiter could not coordinate replicas),
a Redis-backed cache behind the existing async `Cache` port, and a session
read-through cache (fast path skips the session-store validate; revocation still
checked; invalidate on revoke). Env-gated and port-based; the ioredis adapter lives
at the composition root and is verified live.

## 6. Technical debt

- **TD-17 — resolved.** The rate limiter is shared across replicas over Redis.
- **TD-22 — resolved.** The per-request session read is eliminated on the fast path.
- **TD-19 — cache dimension resolved.** A distributed cache is available behind the
  `Cache` port; the object-store (files), search, job-runner and notification
  backends remain the rest of TD-19.
- **New/unchanged:** Redis availability/HA is an operational concern; a
  sliding-window / token-bucket limiter is a future refinement; KMS key custody
  (TD-11) is untouched.

## 7. Recommendation

Set `REDIS_URL` in multi-replica environments to share the rate-limit budget and
cache and to make session revocation cross-node; leave it unset for single-instance
or local runs. Take the remaining TD-19 backends (object store, search) and a
sliding-window limiter as later infrastructure steps.
