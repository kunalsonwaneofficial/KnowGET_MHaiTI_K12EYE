# Engineering Delivery Report — Refresh-Token Rotation & Replay Detection (TD-18)

**Live security wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | Refresh-token rotation & replay detection (TD-18)                                                                  |
| **Status**     | 🔄 Implemented; verification green in-sandbox + live-PostgreSQL RLS. CI pending on the feature branch (pre-merge). |
| **Depends on** | ADR-0015 (session/revocation persistence), ADR-0014, P1-M04 (tokens, sessions)                                     |
| **Scope**      | Session-bound rotating refresh family with replay detection, **env-gated (persisted-only)**. Resolves TD-18.       |
| **Date**       | 18 July 2026                                                                                                       |

---

## 1. Mission recap

Close TD-18: refresh tokens were issued at login but **discarded server-side**, with
no refresh endpoint, no rotation, and no replay detection. The groundwork was
already laid — the persisted `RevocationStore` carries a **family** dimension and the
access token's `fid` claim + the guard's family-revocation check (ADR-0015) were
forward hooks. This milestone persists refresh tokens in a rotating, **session-bound**
family, rotates them on use, and revokes the whole family (and its session) on replay.

## 2. What was engineered

| Layer                      | Delivered                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Persistence (RLS)**      | `security_refresh_token` table (FORCE RLS, tenant-isolated): `family_id`, `identity_id`, `session_id`, SHA-256 `token_hash` (unique per tenant), `status` (active/rotated), epoch-ms timestamps                 |
| **Port + adapters**        | `RefreshTokenStore` port (save / findByHash / markRotated) with in-memory + Prisma implementations; family revocation reuses the existing `RevocationStore`                                                     |
| **Rotation + replay**      | `POST /secure/refresh`: resolve by hash → consume (rotated) → issue successor in the same family + fresh access token. A consumed token replayed ⇒ revoke family + session + audit, and the guard rejects `fid` |
| **Session-bound + logout** | Refresh re-validates and reuses the **same** session (can't outlive its absolute expiry); the access token carries `fid`; logout revokes session + token + family                                               |

## 3. How it works

- **Login** opens a refresh family bound to the login session and issues an access
  token carrying `sub` + `sid` + `tenant` + `jti` + **`fid`** (family).
- **Refresh** (`POST /secure/refresh`, public + rate-limited — the refresh token is
  the credential) looks the token up by hash, checks expiry and family revocation,
  re-validates the session, consumes the token, and returns a rotated refresh token
  plus a fresh access token for the same session.
- **Replay**: presenting an already-consumed token revokes the family and its
  session; every access token bearing that `fid` is then rejected by the guard.
- **Logout** revokes the session, the presented token id, and the family — ending
  the whole lineage.

## 4. Verification

- **In-sandbox (green): 97 API tests** (90 prior, **7 new**) covering the refresh
  store (save / find-by-hash / rotate / tenant isolation) and the rotation flow on
  the persisted authenticator: rotate (new pair, same session + family, fresh
  `jti`), unknown / missing-tenant rejection, **replay → family revoked** (successor
  also dies), and logout revoking session + token + family. The end-to-end persisted
  spec now runs login → enforce → refresh → enforce → replay → family-revoked.
- **Memory path unchanged (green):** the `SecurityModule` integration spec passes;
  refresh is persisted-only (memory mode throws a clear error).
- **Live PostgreSQL RLS (green):** `security_refresh_token` verified on a real
  PostgreSQL 16 as a **non-superuser** — RLS enabled + forced; per-tenant isolation;
  the `(tenant_id, token_hash)` unique holds within a tenant while the same hash is
  allowed across tenants; cross-tenant writes rejected; fail-closed on unset tenant.
- **Prisma-free typecheck** of the new/changed security surface; ESLint 0 warnings;
  Prettier clean.
- **CI-verified:** the Prisma refresh-store adapter + the full `nest build` against
  the generated client (runtime boot exercised in production — TD-12).

## 5. Decisions

Recorded in **ADR-0016**. In brief: persist refresh tokens in a rotating family,
tenant-scoped (Prisma + RLS); rotate on use (single-use tokens); a replayed
(consumed) token revokes the whole family and its session; the family is
**session-bound** (refresh re-uses and re-validates the login session and cannot
outlive its absolute timeout); refresh is persisted-only and port-based, so the
whole loop is proven in-sandbox and only the Prisma DI is CI-only.

## 6. Technical debt

- **TD-18 — resolved.** Refresh tokens are persisted, single-use, family-scoped,
  and replay-detected; logout and replay both collapse the family + session.
- **Unchanged:** distributed session/rate-limit cache and KMS key custody
  (TD-11/17/19); the per-request session read (TD-22). A user-facing
  device/session list ("sign out everywhere") is a later feature, not debt.

## 7. Recommendation

Have clients call `POST /secure/refresh` (with the tenant) when the access token
nears expiry, and treat a refresh failure as "re-authenticate." Consider a
user-facing active-sessions view and a distributed session cache (TD-22) as the
next security/UX steps.
