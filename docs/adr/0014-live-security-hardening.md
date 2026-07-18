# 14. Live security hardening: env-gated persisted store with tenant-as-a-claim

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** Live security hardening (post-P2-D01-M07, the deferred TD-16 remainder)

## Context

P2-D01-M07 certified the persisted, tenant-scoped identity / principal→role /
role→permission stores by composition and **deliberately deferred the live
security-bootstrap swap** (ADR-0013): making those stores the running app's
security path. That swap was left for hardening because it is a
security-critical, mostly-CI-only change to the certified global guard stack and
because it needs a designed **tenant-propagation** mechanism.

Tenant propagation is the crux. The global guard stack resolves a principal from
the JWT `sub` **with no tenant**, while the persisted stores are tenant-scoped
(RLS) — resolution and login both need to know the tenant. The token issuer
(`signJwt`) and the `Session` type are **frozen P1-M04** and must not change. The
API must also stay bootable and fully testable in-sandbox, where Prisma cannot
run (TD-12), so the persisted path cannot become an unconditional dependency of
the security layer.

## Decision

1. **Carry the tenant as a JWT claim — no frozen-code change.** `signJwt` already
   accepts arbitrary extra claims (`{ sub, ...claims }`) and `verifyJwt` returns
   them, so the app issues an access token bearing a `tenant` claim without
   touching the frozen token issuer or `Session` type. In persisted mode the
   authenticator runs the frozen engine to verify credentials, then **re-signs**
   the access token with the resolved tenant; every subsequent request's guard
   reads the `tenant` claim and passes it to the resolver. The app-level
   `PrincipalResolver` gains an **optional** `tenantId` argument — additive, and
   the in-memory resolver simply ignores it.

2. **Env-gate the rollout with a memory default.** `SECURITY_STORE`
   (`memory` | `persisted`, default `memory`) selects the path. The in-memory
   bootstrap remains the default for dev, test and sandbox; the persisted,
   tenant-scoped path is opt-in and reversible. Bootstrap-admin material
   (`SECURITY_BOOTSTRAP_*`) is required only when `persisted` is selected.

3. **Implement selection as an opt-in `@Global` module plus `@Optional`
   fallback.** A `PersistedSecurityModule` — imported by the root module **only**
   in persisted mode — provides the persisted authenticator and principal
   resolver from the Prisma-backed domain repositories under dedicated tokens. The
   security module injects those tokens `@Optional`ly and uses them when present,
   otherwise falls back to the in-memory bootstrap graph. Consequently **memory
   mode never imports Prisma**, so the default path stays fully in-sandbox
   testable and the API stays bootable.

4. **Keep the persisted composition port-based, so its logic is proven
   in-sandbox.** The authenticator, tenant-scoped principal resolver, and the
   idempotent bootstrap **seeder** are assembled by a pure `buildPersistedSecurity`
   function over domain **ports**. With in-memory repositories the whole persisted
   path — seed → tenant-qualified login → verify token → resolve principal →
   authorize — is exercised end to end in-sandbox; only the thin DI wiring that
   binds the Prisma adapters is CI-only (TD-12).

5. **Seed the bootstrap admin idempotently through the domain services.** On boot
   in persisted mode the seeder composes the domain services exactly as an
   operator would (root organization, an `administrator` system role, a person, an
   identity account, and the membership that grants the role) — no direct table
   writes — and is a no-op once the admin account exists.

6. **Hold session and revocation persistence out of scope.** They remain in-memory
   behind their interfaces; persisting them is the next security follow-up. The
   chosen scope is identity + principal→role going live.

## Consequences

- With `SECURITY_STORE=persisted` the running app authenticates and authorizes
  against the persisted, tenant-scoped stores end to end — the data-driven
  authorization certified in M07 is now the live path, behind an env flag.
- The frozen Phase-1 security engine, token format, session type and guard stack
  are untouched; the connective tissue is a re-signed access token, an optional
  resolver argument, and the two composition-root seams that already existed.
- The default (memory) path is unchanged and its integration spec still passes;
  the persisted path is proven in-sandbox by seven new specs and CI-verified for
  the Prisma-touching wiring. The persisted runtime boot-and-seed is exercised in
  production by design (Prisma cannot boot in the sandbox, TD-12).
- **TD-16 refinement:** the RBAC substance is certified (M03–M05/M07) and the
  identity + principal→role live swap is now wirable via `SECURITY_STORE=persisted`.
  What remains under TD-16 is session / token-revocation persistence, and making
  `persisted` the **default** — an operational toggle now that the wiring exists,
  not a code gap.
- **Deferred (documented):** session/revocation persistence; promoting `persisted`
  to the default; and a first-class tenant-context mechanism (should tenant
  propagation ever need to move off the token claim).
