# 11. Enterprise identity: persisted tenant-scoped accounts and the authentication-engine bridge

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** P2-D01-M03 (Enterprise Identity Platform)

## Context

Phase 1 (P1-M04) delivered the authentication machinery — a digital `Identity`
(`@knowget/identity`), credentials, session management, and the
`AuthenticationEngine` — with the identity, session, revocation and principal→role
stores kept **in-memory behind interfaces** (TD-16), and no link between an
identity and a business `Person`. Phase 1 is certified and frozen at `v0.1.0`.

Phase 2 needs identity to become **persisted, tenant-scoped, and linked to the
`Person`** (P2-D01-M02), following the domain architecture pattern (ADR-0010),
**without destabilising the certified security core**. Two questions have to be
answered consistently for every later identity milestone: how a Phase-2 identity
domain relates to the frozen Phase-1 primitive, and how identifier lookup at login
coexists with fail-closed Row-Level Security (a naïve "find account by email"
cannot run before a tenant is known).

## Decision

1. **A new Phase-2 domain, by composition — not modification.** The frozen
   `@knowget/identity` primitive is left as-is. `@knowget/enterprise-identity`
   introduces the `IdentityAccount` aggregate — a **tenant-scoped** login account
   that links a `Person` (`personId`) to identifiers, credential, status and
   lockout counters. It follows ADR-0010 exactly (pure aggregate + port +
   in-memory impl → Prisma/RLS adapter at the composition root → application
   service on the event bus → permission-gated controller).

2. **Purity via injected ports.** The domain depends only on
   `shared`/`types`/`exceptions`/`events` (ADR-0010's dependency rule). The two
   capabilities it needs from elsewhere — credential hashing and person existence
   — enter through injected ports (`CredentialHasher`, `PersonDirectory`), wired
   at the composition root to `@knowget/security` and the person service. The
   domain stays Prisma- and crypto-free and fully unit-testable in-sandbox.

3. **Login is tenant-qualified.** The tenant is resolved **before** the identifier
   is looked up (e.g. from the sign-in host/slug), so `findByIdentifier` is
   tenant-scoped and every query stays RLS-clean; identifiers are unique **within
   a tenant**, on a normalized key. This avoids a cross-tenant, RLS-bypassing
   identifier index.

4. **A bridge connects persisted accounts to the frozen engine.**
   `tenantIdentityRepository(accounts, tenantId)` adapts the tenant-scoped
   `IdentityAccountRepository` to the Phase-1 `IdentityRepository` port, so the
   unchanged `AuthenticationEngine` authenticates real, persisted accounts and its
   writes (failed-attempt counters, lockout, credential rotation) persist back onto
   the account — preserving the person link and identifiers.

5. **The live security bootstrap is unchanged for now.** Flipping the global
   `SecurityModule` wiring from the in-memory store to the persisted store (and the
   tenant-qualified login bootstrap that requires) is a **later increment**; this
   milestone delivers and proves the persisted store behind the port. This keeps
   the certified core releasable at every step.

## Consequences

- The Person↔login link is real and enforced: an account cannot exist without a
  person in the same tenant. Identity is now persisted and tenant-isolated at the
  database (FORCE RLS), resolving the identity-store portion of TD-16.
- The frozen authentication engine gains persistence with **zero changes** to it —
  the bridge is the only new seam, and it is proven end-to-end by an in-sandbox
  spec (successful login, failed-attempt write-back, cross-tenant isolation).
- Later identity milestones inherit a settled shape: persisted `SessionRepository`
  / revocation / principal→role stores slot in behind their existing ports, and the
  global bootstrap flips to the persisted identity store, following this same
  tenant-qualified, bridge-based approach.
- **Deferred:** session/revocation/principal→role persistence and the live-bootstrap
  swap (TD-16 remainder); refresh-token rotation (TD-18). Specialised indexes
  (the `identifier_keys` GIN index) live in migrations only, like RLS.
