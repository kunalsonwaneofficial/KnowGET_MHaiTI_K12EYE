# 15. Session and token-revocation persistence

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Session & token-revocation persistence (post-P2-D01-M07 — the last of TD-16)

## Context

The live security hardening (ADR-0014) made the persisted identity and
principal→role stores the running app's path under `SECURITY_STORE=persisted`,
and left one sliver of TD-16: **sessions and token revocation were still
in-memory**. Two facts shaped the work:

- The frozen P1-M04 `SessionRepository` / `SessionManager` are **tenant-implicit**
  (no tenant argument), and the frozen `RevocationRegistry` is a **concrete class**
  (not an interface) that was **not wired into the request path at all**.
- The JWT guard **never validated the session** per request. So even with a
  persisted session store, revoking a session or a token would have **no live
  effect** — a revoked token kept working until it expired. Persisting these
  stores without enforcing them on the request path would be a hollow half-feature.

## Decision

1. **Persist behind the existing seams, tenant-scoped (Prisma + RLS).** A new
   app-level `SessionStore` port (tenant-explicit) is adapted to the frozen
   `SessionRepository` by a `tenantSessionRepository` bridge (mirroring the
   identity bridge, ADR-0011); a new app-level `RevocationStore` port replaces the
   frozen in-memory `RevocationRegistry` (which is concrete and was unwired). Both
   get a `security_session` / `security_revocation` table under **FORCE RLS**
   tenant isolation. Session timestamps persist as epoch-ms `BIGINT` to preserve
   the frozen numeric `Session` contract exactly.

2. **Enforce per request via an optional guard collaborator.** A `SessionEnforcer`
   is injected `@Optional` into the JWT guard: **absent in memory mode** (the guard
   skips the check, so the Phase-1 request path is unchanged) and **present in
   persisted mode**. It validates the session against the persisted store through
   the frozen `SessionManager.validate` (idle + absolute timeout and the revoked
   flag — unchanged), then rejects if the token id or its family has been revoked.
   It is **fail-closed**: a token with no tenant or no session reference is rejected.

3. **Make revocation effective without touching frozen code.** The persisted
   access token gains a **`jti` claim** (the app already re-signs the token after
   the frozen engine verifies credentials, so no frozen change). A new **logout
   endpoint** (`POST /secure/logout`) revokes the session and records the token id
   as revoked; both take effect on the very next request through the enforcer.

4. **Keep it env-gated and port-based.** All of the above is opt-in under the
   existing `SECURITY_STORE=persisted` (memory default). The composition is
   assembled from ports, so the whole loop — login → persist session → enforce →
   logout → reject — is proven in-sandbox with in-memory stores; only the thin
   Prisma DI wiring is CI-only (TD-12).

5. **Accept a per-request session write (sliding sessions).** Reusing
   `SessionManager.validate` updates `last_activity_at`, so each authenticated
   request in persisted mode performs one session read-and-touch. This is the cost
   of server-side sliding-expiry sessions; a read-through cache or a read-only
   fast path is a future optimization (TD-22).

6. **Hold refresh-token rotation out of scope.** The revocation store carries the
   `family` dimension the refresh model needs, but refresh-token rotation /
   replay-detection / family lineage remain **TD-18**, deliberately separate from
   this session/revocation-persistence contract.

## Consequences

- **TD-16 is fully resolved.** Identity, principal→role, role→permission (M03–M05,
  certified M07), the live bootstrap swap (ADR-0014), and now **session and
  token-revocation persistence with live enforcement** are all persisted,
  tenant-scoped, and effective under `SECURITY_STORE=persisted`.
- Session and token revocation now take effect **immediately** and **survive
  restarts / span replicas**, rather than lingering until token expiry in a single
  process's memory.
- The frozen Phase-1 security engine, session type, token format and guard
  contract are untouched; the additions are two RLS tables, three app-level ports
  with in-memory + Prisma implementations, one optional guard collaborator, a
  `jti` claim on the re-signed token, and a logout route.
- The default (memory) path is unchanged: with no enforcer injected the guard
  behaves exactly as in Phase 1, and its integration spec still passes.
- **New minor debt (TD-22):** the per-request session read-and-touch in persisted
  mode; interface-protected behind `SessionEnforcer`, resolvable with caching.
- **Still deferred:** refresh-token rotation/replay (TD-18); promoting `persisted`
  to the default (an operational toggle); a distributed rate-limit/session cache.
