# Engineering Delivery Report — Live Security Hardening (TD-16)

**Live security wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | Live security hardening — the deferred TD-16 remainder from P2-D01-M07                                                         |
| **Status**     | 🔄 Implemented; verification green in-sandbox. CI pending on `feat/p2-d01-security-hardening` (pre-merge gate).                |
| **Depends on** | P2-D01-M01…M07 (the certified Identity & Organization sub-domain), P1-M04 (security engine)                                    |
| **Scope**      | Identity + principal→role live wiring, **env-gated (memory default)**. Session/revocation persistence deferred (chosen scope). |
| **Date**       | 18 July 2026                                                                                                                   |

---

## 1. Mission recap

Make the certified persisted stores (identity accounts, membership roles, role
catalogue) the **running app's** security path — the operational step the M07
certification deliberately deferred. The blocker was **tenant propagation**: the
global principal resolution runs off the JWT `sub` with no tenant, while the
persisted stores are tenant-scoped (RLS), and the token issuer + `Session` type
are frozen P1-M04. Delivered **env-gated** (`SECURITY_STORE=persisted`), so the
in-memory bootstrap remains the default for dev/test/sandbox and the persisted
path is opt-in — safe and reversible.

## 2. What was engineered

| Layer                        | Delivered                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant propagation**       | `SECURITY_STORE` env flag; tenant carried as a **JWT claim** (`signJwt` already accepts extra claims — no frozen-code change); the JWT guard passes the `tenant` claim to the resolver; the app-level `PrincipalResolver` gains an optional `tenantId` (the in-memory resolver ignores it)                                                                |
| **Composition (port-based)** | `Authenticator` abstraction — `EngineAuthenticator` (memory) and `PersistedAuthenticator` (tenant-qualified login via the identity bridge, re-issuing a tenant-claimed token); `PersistedPrincipalResolver` (account→person→membership roles→catalogue permissions); an idempotent `SecuritySeeder` (bootstrap admin); `buildPersistedSecurity` assembler |
| **Env-gated wiring**         | `AUTHENTICATOR` provider + `@Optional` persisted fallbacks in the security module (memory path unchanged); a `@Global` **`PersistedSecurityModule`** — imported by the root module only in persisted mode — that provides the persisted overrides from the Prisma-backed domain repositories and seeds the bootstrap admin on boot                        |

## 3. How it works

- **Login (persisted mode)** is tenant-qualified: `PersistedAuthenticator` builds a
  tenant-bound `AuthenticationEngine` over the persisted identity store (via the
  M03 bridge), runs the frozen engine (credential verify, lockout, session, audit
  — unchanged), then issues an access token carrying a **`tenant` claim**.
- **Every request**: the guard verifies the token and passes `sub` + `tenant` to
  the `PrincipalResolver`. In persisted mode that is `PersistedPrincipalResolver`,
  which resolves the account's person, unions its **active-membership role names**,
  and expands them into **permissions from the tenant's role catalogue** — the
  data-driven authorization certified in M07, now live.
- **Selection** is a fallback chain: `PersistedSecurityModule` (opt-in) provides
  the persisted overrides; the security module's `@Optional` injection picks them
  up, or falls back to the in-memory bootstrap when they are absent (memory mode).

## 4. Verification

- **In-sandbox (green):** **74 API tests**, including **7 new** — the guard's
  tenant-claim pass-through, the persisted authenticator (tenant claim in the token;
  requires a tenant), the persisted principal resolver (tenant-scoped; nothing
  without/for another tenant), the idempotent seeder, and an **end-to-end spec**
  (seed → tenant-qualified login → verify token → resolve principal → authorize)
  proving the whole persisted path with in-memory repositories.
- **Memory path unchanged (green):** the `SecurityModule` integration spec and guard
  tests pass — with the persisted overrides absent, the security module resolves the
  in-memory bootstrap exactly as before.
- **Prisma-free typecheck** of every new/changed security surface; ESLint 0
  warnings; Prettier clean.
- **CI-verified:** the two Prisma-touching wiring modules (`PersistedSecurityModule`,
  the root module's conditional import) build and type-check against the generated
  Prisma client; the full `nest build`. (The persisted path's runtime boot+seed is
  exercised in production, by design — Prisma cannot boot in the sandbox, TD-12.)

## 5. Decisions

Recorded in **ADR-0014**. In brief: tenant travels as a **JWT claim** (no change to
the frozen token issuer — the app re-signs the access token after the engine
verifies credentials); the rollout is **env-gated with a memory default**,
implemented as an **opt-in `@Global` module + `@Optional` fallback** so memory mode
never imports Prisma and stays fully testable in-sandbox; the persisted composition
is **port-based** so its logic is proven in-sandbox and only the thin DI wiring is
CI-only. Sessions and token revocation remain in-memory (the chosen scope).

## 6. Technical debt

- **TD-16 — identity + principal→role now wirable live.** With `SECURITY_STORE=persisted`
  the running app uses the persisted, tenant-scoped identity / principal→role /
  role→permission stores end to end. Remaining under TD-16: **session and token-
  revocation persistence** (still in-memory); and making `persisted` the **default**
  is an operational toggle (the wiring exists) rather than a code gap.
- No new blocking debt.

## 7. Recommendation

Enable `SECURITY_STORE=persisted` in production once the bootstrap env
(`SECURITY_BOOTSTRAP_EMAIL`/`PASSWORD`/`TENANT`) and migrations are in place;
tenant-qualified login expects a `tenant` in the sign-in request. Persist sessions
and token revocation as the next security follow-up.
