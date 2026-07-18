# 17. Distributed cache, rate limiter and session read-through (Redis-backed)

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Distributed session / rate-limit cache (TD-17 / TD-19 / TD-22)

## Context

Three deferrals shared one root cause — per-instance, in-process state that does
not coordinate across replicas:

- **TD-17:** the rate limiter (`@knowget/security`) is an in-memory fixed-window
  counter, so each replica enforces its own budget.
- **TD-19 (cache dimension):** the shared `Cache` is in-memory per instance.
- **TD-22:** the session enforcer does a session-store read-and-touch
  (a write-transaction) on every authenticated request.

The `Cache` port (`@knowget/cache`) is already async and provider-agnostic — a
distributed backend slots in behind it unchanged. The frozen `RateLimiter`,
however, is **synchronous** and in-memory, so a distributed limiter cannot hide
behind it; the guard (app-level) must become async. Redis is the de-facto backend
and is available in CI and the sandbox for live verification.

## Decision

1. **One backend-agnostic seam: a `KeyValueStore` port.** `get` / `set(ttl)` /
   `delete` / `deleteByPrefix` plus an atomic `incrementWindow` (the fixed-window
   rate-limit primitive). An in-memory implementation is the default (per-instance,
   the substrate for in-sandbox tests); a `RedisKeyValueStore` (ioredis) makes it
   **shared across replicas**. Selected by env: `REDIS_URL` set ⇒ Redis, unset ⇒
   in-memory (dev / test / sandbox unchanged).

2. **Async distributed rate limiter (TD-17).** A `KeyValueRateLimiter` over the
   store; the `RateLimitGuard` becomes async and consults it. The atomic window
   (`INCR` + first-hit `PEXPIRE` in one Lua script) means concurrent replicas share
   one counter — the budget is now global, not per-instance. The frozen
   `RateLimiter` is untouched; the guard simply no longer depends on it.

3. **Redis-backed cache behind the existing port (TD-19, cache dimension).** A
   `KeyValueCache` implements `@knowget/cache`'s `Cache`; the services module wires
   it as `CACHE` when `REDIS_URL` is set, else keeps the in-memory LRU default.
   Callers are unchanged (the port is the same).

4. **Session read-through cache (TD-22).** A `SessionValidityCache` (over the same
   store) lets the enforcer skip the session-store validate for a recently-checked
   session. Revocation is **still checked every request**, so logout/replay (which
   revoke the family) stay prompt; explicit revokes also invalidate the cache, and a
   short TTL bounds the only stale case (max-concurrent eviction, inside the frozen
   `SessionManager`). Over Redis the cache is cross-replica, so a revoke on one node
   is seen by all.

5. **Env-gated, port-based, adapter at the composition root.** The Redis adapter is
   the only place `ioredis` is imported (mirroring the Prisma adapters, TD-21). The
   pure logic (store, cache, limiter, session cache) is unit-tested in-sandbox over
   the in-memory store; the Redis adapter is verified live (a `REDIS_URL`-gated
   integration test in CI's `redis` service and in sandbox). The connection is closed
   on shutdown.

## Consequences

- **TD-17 and TD-22 are resolved.** The rate limiter is shared across replicas and
  the per-request session read is eliminated on the fast path — both behind
  `REDIS_URL`, with the in-memory default unchanged for single-instance / dev.
- **TD-19 is resolved for the cache dimension.** A distributed cache is available
  behind the `Cache` port. The other TD-19 backends — object store (files),
  search index, distributed job runner, notifications — remain their own follow-ups.
- No frozen code changed: the `Cache` port already existed; the rate limiter moved
  to an async app-level seam; the session engine is untouched.
- The default (no `REDIS_URL`) path is unchanged and fully in-sandbox testable; the
  Redis path is proven live (adapter + module wiring + cross-instance counter).
- **New operational surface:** a Redis dependency when `REDIS_URL` is set (its own
  availability/HA is an ops concern); Redis `maxmemory-policy` governs cache
  eviction. A sliding-window or token-bucket algorithm remains a future refinement
  over the same store.
