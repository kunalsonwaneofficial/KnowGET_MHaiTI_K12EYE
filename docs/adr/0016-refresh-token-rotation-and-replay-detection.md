# 16. Session-bound refresh-token rotation and replay detection

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Refresh-token rotation & replay detection (TD-18)

## Context

Login has always returned a refresh token, but the frozen `AuthenticationEngine`
issued it via `issueRefreshToken` and **discarded its hash and family** — nothing
was stored server-side, there was no refresh endpoint, and no rotation or replay
detection (TD-18). The pieces to close it were already in place from the previous
two milestones: the persisted, tenant-scoped `RevocationStore` carries a **family**
dimension, and the access token's `fid` claim plus the guard's family-revocation
check were forward hooks for exactly this.

The one open decision was how a refresh relates to the login **session**. The
config has 7-day refresh tokens but 12-hour absolute sessions, which could argue
for an independent, longer-lived refresh. The chosen model is **session-bound**:
tighter, and coherent with the session enforcement already shipped (ADR-0015).

## Decision

1. **Persist refresh tokens in a rotating family, tenant-scoped (Prisma + RLS).**
   A new `security_refresh_token` table (FORCE RLS) stores, per token, its
   `family_id`, the `identity_id` and `session_id` it belongs to, the SHA-256
   `token_hash` (the raw token is never stored; `(tenant_id, token_hash)` is
   unique), a `status` (`active` / `rotated`), and epoch-ms timestamps. A new
   app-level `RefreshTokenStore` port (in-memory + Prisma) owns per-token
   lifecycle; **family revocation reuses the `RevocationStore`** so a revoked
   family is enforced in one place (the guard and the refresh flow both consult it).

2. **Rotate on use.** `POST /secure/refresh` resolves the presented token by hash,
   consumes it (`status → rotated`), and issues a successor in the **same family**
   plus a fresh access token. Rotation is the norm; a token is single-use.

3. **Detect replay → revoke the family.** Presenting an **already-consumed** token
   is theft: the whole family is revoked (via `RevocationStore`) **and** its session
   is revoked, an audit event is recorded, and the request is rejected. Because the
   access token carries `fid`, the guard then rejects every access token in that
   family on its next request.

4. **Session-bound lifetime.** A refresh re-issues an access token for the **same
   session** — re-validated through the frozen `SessionManager` (idle / absolute
   timeout, revoked). A refresh therefore cannot outlive its session's absolute
   expiry, and the stored token's expiry is capped at the session's. Logout revokes
   the session **and** the refresh family, so signing out truly ends the lineage.

5. **Persisted-only, env-gated, port-based.** Refresh rotation needs a server-side
   store, so it lives on the persisted path (`SECURITY_STORE=persisted`); the
   in-memory `EngineAuthenticator.refresh` throws a clear error (memory mode is
   dev/test). The rotation + replay logic is composed from ports, so the whole loop
   — login → refresh → rotate → replay → family revoked — is proven in-sandbox with
   in-memory stores; only the Prisma DI wiring is CI-only (TD-12).

## Consequences

- **TD-18 is resolved.** Refresh tokens are persisted, single-use, and rotate
  within a family; reuse is detected and collapses the family and its session;
  lineage is tracked by `family_id`.
- Refresh, session enforcement, and logout compose into one coherent model: one
  login = one session = one refresh family, killed together by logout or by a
  detected replay.
- The frozen token/refresh primitives (`issueRefreshToken`, `signJwt`) and the
  session engine are untouched; the additions are one RLS table, a store port with
  in-memory + Prisma implementations, the refresh/rotation logic on the persisted
  authenticator, a `fid` claim already carried by the access token, and a refresh
  route.
- The default (memory) path is unchanged; refresh simply isn't available there.
- **Still deferred:** a distributed session/rate-limit cache and HSM/KMS key
  custody remain their own items (TD-11/17/19/22); refresh tokens do not yet expose
  a device/session list for user-facing "sign out everywhere" (a later feature).
