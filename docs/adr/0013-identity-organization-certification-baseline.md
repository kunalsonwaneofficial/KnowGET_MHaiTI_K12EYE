# 13. Identity & Organization sub-domain certification baseline

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** P2-D01-M07 (Domain certification)

## Context

The Identity & Organization sub-domain (P2-D01) is the first Phase-2 program:
Organization, Person, Enterprise Identity, Membership, Roles/Authorization and
Relationship (M01–M06). All six are merged, CI-green, and follow ADR-0010. The
certification milestone (M07) must certify the sub-domain, decide how far to take
the live security-bootstrap swap that M03–M05 deferred, and freeze a baseline —
the analogue of P1-M07 for a Phase-2 program.

The security-bootstrap swap is the crux. The persisted, tenant-scoped stores
(identity accounts, membership-backed principal→role, role→permission catalogue)
exist and are proven. But the running app's global guard stack resolves a
principal from the JWT `sub` **without a tenant**, while those stores are
tenant-scoped (RLS). Bridging that for the live default needs **tenant
propagation** — a tenant claim in the token, a tenant-qualified session, or a
system-context account→tenant resolver — and the token issuer and `Session` type
are **frozen P1-M04**.

## Decision

1. **Certify by composition, proven in-sandbox.** A single cross-domain suite
   (`identity-organization.cert.spec.ts`) assembles all six domains with the real
   authentication and authorization engines and certifies the full chain: login →
   principal resolution (roles from membership, permissions from the catalogue) →
   authorization (allow + default-deny), including immediate effect of membership
   suspension and role-permission changes, relationship directionality, and tenant
   isolation. Per-table RLS is certified separately on live PostgreSQL. This
   certifies the _composition and semantics_ the Prisma adapters back (CI-verified,
   TD-12).

2. **Defer the live-bootstrap swap to hardening — do not force it here.** Flipping
   the global default to the persisted stores is a large, security-critical,
   mostly-CI-only change to the certified guard stack that also needs a designed
   tenant-propagation mechanism touching frozen P1-M04. Doing it during
   certification would work against "repo always releasable". The persisted
   composition it will use is already assembled and proven; the live default stays
   the in-memory bootstrap so the API remains bootable and testable in-sandbox.

3. **Baseline the sub-domain at `v0.2.0`.** Tag and CHANGELOG the certified
   Identity & Organization sub-domain, built on the frozen Phase-1 core (`v0.1.0`).

## Consequences

- The sub-domain is certified and reusable: later Phase-2 programs build on these
  six packages without modifying them.
- The RBAC substance of TD-16 is resolved (persisted, tenant-scoped, certified);
  the remaining sliver is the tenant-propagation plumbing for the live swap, plus
  session/revocation persistence, now precisely scoped to the operations/hardening
  phase.
- The frozen Phase-1 security engine, token format and guard stack are untouched;
  the only connective tissue remains the two composition-root seams (the identity
  bridge, ADR-0011, and the permission-resolution decorator, ADR-0012).
- **Deferred (documented):** the live security-bootstrap swap (tenant propagation
  and a DB-seeded bootstrap admin), and "follow the survivor" re-pointing of
  memberships/relationships on `person.merged` — both event-driven, additive, and
  non-blocking.
