# Engineering Delivery Report — P1-M04

**Security Foundation** · Phase 1 (Platform Core Engineering)

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P1-M04 — Security Foundation                                                                                       |
| **Status**     | ✅ Complete — CI green (verify incl. Prisma build/typecheck/tests, security audit, E2E). Merged to `main` (PR #2). |
| **Depends on** | P1-M02 (Runtime Kernel), P1-M03 (Data Platform)                                                                    |
| **Date**       | 17 July 2026                                                                                                       |
| **Next**       | P1-M05 — Enterprise Shared Services Platform                                                                       |

---

## 1. Mission recap

Engineer the security foundation on which every future capability authenticates
its actors, authorizes their actions, and produces a trustworthy security
record: cryptographic services and key management, tokens, digital identity,
role- and attribute-based authorization, session management, an authentication
engine, a tamper-evident security audit, and the transport-level middleware that
enforces all of it — with no domain (Student/Finance/HR) concepts introduced.

## 2. What was engineered

| Package                          | Delivers                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowget/security` (expanded)   | scrypt password hashing, AES-256-GCM encryption, HMAC-SHA256, secure token/key generation (`node:crypto` only); versioned **KeyRing** with rotation; **hash-chained** security audit; centralized policy config; transport-agnostic **RateLimiter** |
| `@knowget/tokens` (new)          | HS256 **JWT** sign/verify (expiry, not-before, issuer), SHA-256 hashed **refresh tokens**, in-memory **revocation** registry                                                                                                                        |
| `@knowget/identity` (new)        | Persona-agnostic **Identity** (identifiers, credential hashing, status lifecycle, lockout counters as pure transitions), ORM-agnostic identity repository, identity events                                                                          |
| `@knowget/authorization` (new)   | Deterministic **RBAC + ABAC** engine (deny → RBAC → allow → default-deny), role store, policy model                                                                                                                                                 |
| `@knowget/authentication` (new)  | **Session** lifecycle (concurrent-session limits, idle/absolute timeouts, revocation) and an **AuthenticationEngine** orchestrating verification, lockout, session + token issuance, and audit                                                      |
| `@knowget/exceptions` (expanded) | `RateLimitError` (HTTP 429) + `RATE_LIMITED` code                                                                                                                                                                                                   |
| `apps/api` (expanded)            | `SecurityModule`, the global guard stack, security decorators, and protected reference routes (below)                                                                                                                                               |

## 3. Scope coverage (contract → implementation)

| Contract scope              | Implementation                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cryptographic Services      | `node:crypto` only — scrypt (passwords), AES-256-GCM (encryption), HMAC-SHA256 (signing), CSPRNG token/key generation                       |
| Key Management              | `KeyRing` — versioned keys, rotation, historical-version verify; in-memory material behind an interface an HSM/KMS provider slots into      |
| Token Platform              | `@knowget/tokens` — HS256 JWT (signature/expiry/nbf/issuer), hashed refresh tokens, revocation registry                                     |
| Digital Identity            | `@knowget/identity` — identifiers, credentials, status lifecycle, lockout; repository contract (in-memory default)                          |
| Authentication              | `AuthenticationEngine` — credential verification, account lockout, session creation, access/refresh issuance, fully audited                 |
| Authorization (RBAC + ABAC) | `AuthorizationEngine` — explicit deny → RBAC permission grant → allow policy → default-deny; wildcard permission support                    |
| Session Management          | `SessionManager` — max concurrent sessions, idle + absolute timeouts, revocation, injectable clock                                          |
| Security Audit              | `SecurityAuditLogger` — SHA-256 **hash-chained** events; `verifyChain()` detects any alteration or deletion                                 |
| Rate Limiting               | `RateLimiter` (fixed-window, transport-agnostic) + `RateLimitGuard` (per-client budget, per-route overrides, `X-RateLimit-*`/`Retry-After`) |
| Security Middleware         | `JwtAuthGuard` → `PermissionsGuard` chained after `RateLimitGuard`; `@Public`/`@RequirePermissions`/`@RateLimit`/`@CurrentPrincipal`        |
| Security Headers            | Baseline headers applied at bootstrap (`SECURITY_HEADERS`, P1-M01) — retained                                                               |

No domain schema or persona logic was introduced. Identity, sessions, revocation
and principal→role assignments use **in-memory stores behind interfaces**; the
Phase-2 identity domains replace them with `@knowget/persistence`/RLS-backed
implementations without touching callers.

## 4. Security design decisions

- **`node:crypto` only.** No third-party cryptography. scrypt for passwords,
  AES-256-GCM for confidentiality+integrity, HMAC-SHA256 for signatures.
- **Authentication vs authorization are separated.** The signed token proves
  _who_ the caller is (`sub`); roles/permissions are resolved **server-side**
  per request by the `PrincipalResolver`, so a revoked or changed role takes
  effect immediately rather than lingering until token expiry.
- **Least privilege / fail-closed.** An authenticated-but-unassigned subject
  proceeds with zero authority (default-deny at the permission check) rather than
  failing open. Unset tenant/role context denies rather than errors.
- **Tamper-evident audit.** Every security event is chained (`hash(previousHash
‖ event)`); `verifyChain()` makes any modification or deletion detectable.
- **Guard order is deliberate:** rate limit (throttles even unauthenticated
  brute-force) → authenticate → authorize (needs the attached principal).
- **Bootstrap secrets fail closed in production.** `SECURITY_JWT_SECRET` and
  `SECURITY_BOOTSTRAP_*` are **required in production** (a `ConfigurationError`
  refuses to boot otherwise); development/test use an ephemeral key and a
  documented dev bootstrap identity so the stack runs out of the box.

## 5. Reference endpoints (prove the stack end to end)

`POST /secure/login` (public, tightly rate-limited) → authenticate → access +
refresh token · `GET /secure/whoami` (bearer required) → the resolved principal ·
`GET /secure/admin` (`@RequirePermissions('admin:read')`) → RBAC-gated. Health
probes are marked `@Public`. These are the shape every Phase-2 domain controller
follows.

## 6. Verification — in-sandbox gates (green)

- **Type-check:** 7 buildable packages (`exceptions`, `security`, `auth`,
  `tokens`, `authorization`, `identity`, `authentication`) — clean. API security
  layer type-checked in isolation (no Prisma path) — clean.
- **Build:** the same 7 packages — clean.
- **Lint:** packages + `apps/api` — **0 warnings**. **Format:** clean.
- **Tests:** `security` 18 · `tokens` 7 · `identity` 4 · `authorization` 5 ·
  `authentication` 5 · `apps/api` **24** (guard/resolver/decorator unit tests +
  an in-process integration spec) — all passing.
- **Integration (in-sandbox):** a NestJS testing-module spec **compiles the full
  `SecurityModule` DI graph** (async security-graph factory, derived
  engine/key/resolver providers, and all three `APP_GUARD`s) and **authenticates
  the seeded bootstrap administrator end to end** (scrypt verify → JWT issued),
  plus bad-credential and malformed-payload rejection. This exercises the real
  wiring, not mocks.

## 7. Decisions (ADR)

- **ADR-0006** — Security architecture: `node:crypto`-only primitives; the
  package layering (`security` → `tokens`/`identity` → `authorization` →
  `authentication`); server-side principal resolution; the deny-first
  authorization order; the hash-chained audit; and the guard stack.

## 8. Build-environment constraint (unchanged from P1-M03)

`apps/api` transitively depends on Prisma (via `PlatformModule` → `@knowget/database`),
whose engine CDN is unreachable from this sandbox (TD-12). The **full `nest build`
and API type-check are therefore CI-verified**, exactly as in P1-M03. To close
that gap _before_ merge, the security layer is validated in-sandbox two ways that
do **not** touch Prisma: (a) an isolated `tsc` type-check of the security folder,
and (b) the in-process `SecurityModule` integration spec (§6). CI remains the
authority for the Prisma-dependent build.

**CI now also runs on `feat/**` pushes** (`.github/workflows/ci.yml`) so this
branch is fully verified **before** it merges — the pre-merge gate that caught
real issues in P1-M03. `main` stays releasable at P1-M03 until CI is green here.

## 9. Technical debt (tracked, interface-protected)

Resolved: **TD-03** (auth was contracts-only) and **TD-04** (security was
foundational). New, each behind a stable interface: in-memory identity / session
/ revocation / principal-resolver stores (→ Phase-2 persistence), in-memory
KeyRing material and single-current-key JWT verify (→ KMS/rotation-verify,
TD-11), and the in-memory rate limiter (→ distributed/Redis). See the
technical-debt register.

## 10. Recommendation — proceed to P1-M05

On green CI, merge to `main` and begin **P1-M05 — Enterprise Shared Services
Platform** (notifications, files/storage, jobs/scheduling, search, and related
shared services) on the kernel + data + security foundations engineered so far.
