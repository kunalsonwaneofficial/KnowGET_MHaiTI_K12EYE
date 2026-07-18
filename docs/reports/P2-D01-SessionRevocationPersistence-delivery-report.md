# Engineering Delivery Report — Session & Token-Revocation Persistence (closes TD-16)

**Live security wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | Session & token-revocation persistence — the last of TD-16                                                                              |
| **Status**     | 🔄 Implemented; verification green in-sandbox + live-PostgreSQL RLS. CI pending on the feature branch (pre-merge).                      |
| **Depends on** | ADR-0014 (live security hardening), P2-D01-M01…M07, P1-M04 (security engine, sessions, tokens)                                          |
| **Scope**      | Persist **and enforce** sessions + token revocation, tenant-scoped, **env-gated (memory default)**. Refresh-token rotation stays TD-18. |
| **Date**       | 18 July 2026                                                                                                                            |

---

## 1. Mission recap

Close the final sliver of TD-16: sessions and token revocation were still
in-memory. Two facts set the scope. The guard **never validated the session** per
request, so a revoked session's access token kept working until expiry; and the
frozen `RevocationRegistry` was a concrete class **wired nowhere**. Persisting the
stores without enforcing them on the request path would be hollow — so this
milestone **persists and enforces**, env-gated under `SECURITY_STORE=persisted`
(memory remains the default and is unchanged).

## 2. What was engineered

| Layer                       | Delivered                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Persistence (RLS)**       | `security_session` and `security_revocation` tables (FORCE RLS, tenant-isolated). Session timestamps persist as epoch-ms `BIGINT` to preserve the frozen numeric `Session` contract                                                                          |
| **Ports + adapters**        | `SessionStore` port (in-memory + Prisma) with a `tenantSessionRepository` bridge to the frozen `SessionRepository`; `RevocationStore` port (in-memory + Prisma) replacing the unwired frozen `RevocationRegistry`                                            |
| **Per-request enforcement** | A `SessionEnforcer` injected `@Optional` into the JWT guard — validates the session (frozen `SessionManager.validate`: idle/absolute timeout + revoked) and honours token/family revocation; **fail-closed**. Absent in memory mode (Phase-1 path unchanged) |
| **Effective revocation**    | Persisted access token gains a **`jti` claim** (app re-sign, no frozen change); **`POST /secure/logout`** revokes the session and records the token as revoked — both enforced on the next request                                                           |

## 3. How it works

- **Login (persisted mode)** creates the session in the persisted, tenant-scoped
  store (via the frozen `SessionManager` over the tenant bridge) and issues an
  access token carrying `sub` + `sid` + `tenant` + **`jti`**.
- **Every request**: the guard verifies the token, then — in persisted mode — asks
  the `SessionEnforcer` whether the `sid` is still a live session for that tenant
  and whether the `jti`/family has been revoked. A revoked or lapsed session, or a
  revoked token, is rejected with 401. In memory mode the enforcer is absent and
  the check is skipped (unchanged).
- **Logout** (`POST /secure/logout`, authenticated) revokes the session and records
  the presented token id — so the token stops working immediately, and durably.

## 4. Verification

- **In-sandbox (green): 90 API tests** (74 prior, **16 new**) covering the session
  store and its tenant bridge (create/read/revoke, tenant isolation), the revocation
  store (token/family, tenant isolation, fail-closed), the enforcer (valid / missing
  tenant or session / wrong tenant / revoked session / revoked token), the guard's
  enforce-and-reject and claim pass-through, the persisted authenticator (token
  carries `sid`/`jti`, session persisted, logout revokes both), and the end-to-end
  persisted path extended through **login → enforce → logout → reject**.
- **Memory path unchanged (green):** the `SecurityModule` integration spec passes —
  with no enforcer injected, the guard behaves exactly as in Phase 1.
- **Live PostgreSQL RLS (green):** both tables verified on a real PostgreSQL 16 as
  a **non-superuser** — RLS enabled + forced; per-tenant read isolation; cross-tenant
  writes rejected by `WITH CHECK`; **fail-closed** when the tenant is unset (0 rows
  visible, writes rejected).
- **Prisma-free typecheck** of the new/changed security surface; ESLint 0 warnings;
  Prettier clean.
- **CI-verified:** the two Prisma store adapters + the full `nest build` against the
  generated client (the persisted runtime boot is exercised in production — Prisma
  cannot boot in the sandbox, TD-12).

## 5. Decisions

Recorded in **ADR-0015**. In brief: persist behind the existing frozen/port seams,
tenant-scoped (Prisma + RLS); enforce per request via an **optional guard
collaborator** so memory mode is untouched and stays in-sandbox testable; make
revocation **effective** by adding a `jti` claim on the re-signed token plus a
logout route (no frozen-code change); accept one session read-and-touch per
authenticated request (sliding sessions — TD-22); keep refresh-token rotation as
TD-18.

## 6. Technical debt

- **TD-16 — resolved.** Identity, principal→role, role→permission (certified M07),
  the live bootstrap swap (ADR-0014), and now **session + token-revocation
  persistence with live enforcement** are all persisted, tenant-scoped and
  effective under `SECURITY_STORE=persisted`.
- **TD-22 (new, minor):** per-request session read-and-touch in persisted mode
  (sliding-expiry cost); interface-protected behind `SessionEnforcer`; resolvable
  with a read-through cache / read-only fast path.
- **Unchanged:** refresh-token rotation/replay (TD-18); promoting `persisted` to
  the default is an operational toggle.

## 7. Recommendation

Enable `SECURITY_STORE=persisted` with the bootstrap env and migrations in place;
sign-in is tenant-qualified and clients should call `POST /secure/logout` to end a
session. Take refresh-token rotation (TD-18) as the next security contract, and add
a session cache if the per-request read (TD-22) shows up in latency budgets.
