# 6. Security architecture

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M04

## Context

P1-M04 must provide the platform's security foundation — cryptography, key
management, tokens, identity, authentication, authorization (RBAC + ABAC),
sessions, a trustworthy security audit, and the middleware that enforces them —
without introducing any domain (persona) concepts, and layered so Phase-2
domains build on it without reimplementing security.

## Decision

- **`node:crypto` only.** No third-party cryptographic libraries. scrypt for
  password hashing, AES-256-GCM for authenticated encryption, HMAC-SHA256 for
  signing (and HS256 JWTs), and the platform CSPRNG for tokens and keys.

- **Package layering (acyclic).** `@knowget/security` (primitives: crypto, key
  ring, policy config, audit, rate limiter) → `@knowget/tokens` (JWT/refresh/
  revocation) and `@knowget/identity` (identity, credentials, repository) →
  `@knowget/authorization` (RBAC/ABAC over `@knowget/auth` principals) →
  `@knowget/authentication` (sessions + the authentication engine that composes
  identity, tokens, sessions and audit). Domains depend on these contracts, not
  on the concrete stores.

- **Authentication is separate from authorization.** The signed JWT establishes
  identity (`sub`). Roles and permissions are resolved **server-side per request**
  by a `PrincipalResolver`, not trusted from client-held token claims, so
  role/permission changes take effect immediately instead of at token expiry.

- **Deterministic authorization order:** explicit **deny** policies → **RBAC**
  permission grant (wildcard `*` supported) → **allow** policies (ABAC) →
  **default-deny**. Denials raise `AuthorizationError` (HTTP 403).

- **Tamper-evident audit.** `SecurityAuditLogger` chains each event's SHA-256
  hash to the previous (`hash(previousHash ‖ canonical(event))`); `verifyChain()`
  recomputes the chain so any alteration or deletion is detectable.

- **Guard stack (global, ordered).** `RateLimitGuard` → `JwtAuthGuard` →
  `PermissionsGuard`, installed as `APP_GUARD`s. Rate limiting runs first (throttles
  unauthenticated brute-force); authentication attaches the principal; authorization
  consumes it. `@Public` opts routes out of auth; `@RequirePermissions`,
  `@RateLimit` and `@CurrentPrincipal` drive the rest.

- **Bootstrap secrets fail closed.** `SECURITY_JWT_SECRET` and
  `SECURITY_BOOTSTRAP_EMAIL`/`_PASSWORD` are **required in production** — the
  security graph refuses to boot (`ConfigurationError`) with an ephemeral key or
  no administrator. Development/test generate an ephemeral key and seed a
  documented dev bootstrap identity so the stack runs out of the box.

- **State behind interfaces.** Identity, session, revocation and principal→role
  stores are in-memory implementations of their interfaces for P1-M04; Phase-2
  identity domains replace them with `@knowget/persistence`/RLS-backed stores
  without changing callers.

## Consequences

- Every future capability authenticates and authorizes through one consistent,
  audited stack; controllers follow the `/secure` reference shape.
- Immediate revocation semantics (server-side role resolution) at the cost of a
  per-request principal lookup — acceptable, and cache-able later.
- **Build environment:** `apps/api` transitively depends on Prisma, so the full
  API build/type-check is CI-verified (TD-12). The security layer is additionally
  verified in-sandbox without Prisma via an isolated type-check and an in-process
  `SecurityModule` integration spec, and CI now runs on `feat/**` pushes so the
  branch is gated before merge.
- **Deferred (interface-protected):** in-memory stores (→ Phase-2 persistence),
  in-memory KeyRing material and single-current-key verify (→ KMS + rotation
  verify, TD-11), and the in-memory rate limiter (→ distributed backend).
