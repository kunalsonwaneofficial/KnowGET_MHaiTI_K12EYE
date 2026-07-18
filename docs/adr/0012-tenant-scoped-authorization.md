# 12. Tenant-scoped authorization: role catalogue and permission resolution

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** P2-D01-M05 (Authorization)

## Context

P1-M04 delivered a deterministic `AuthorizationEngine` whose
`effectivePermissions(principal)` expands a principal's role **names** into
permissions **synchronously**, via a `RoleStore.getRole(name)` lookup, and which
is installed as a **global singleton** behind the permissions guard. Its role
store is an in-memory, non-tenant-scoped bootstrap seed (TD-16).

Phase 2 needs authorization to be **data-driven per tenant**: each institution
defines its own roles and the permissions they grant, and a principal is granted
exactly those. That catalogue is **persisted and tenant-scoped** — its lookups are
**async** and require a tenant — which does not fit a synchronous, tenant-agnostic,
global `RoleStore`. The certified engine must not be modified, and the guard's
global engine should not become request-scoped (both are Phase-1 baseline).

## Decision

1. **A tenant-scoped role catalogue as a new Phase-2 domain.** `@knowget/roles`
   introduces the `Role` aggregate (tenant-scoped name → permission set, lifecycle,
   `isSystem` protection) following ADR-0010. It owns role definitions; memberships
   (M04) reference roles by name.

2. **Close the loop through `Principal.permissions`, not the `RoleStore`.** The
   engine already unions `principal.permissions` into its decision. So permissions
   are resolved **at principal-resolution time**: `withResolvedPermissions`
   decorates the membership-backed principal resolver (M04) and expands the
   principal's active role names into the tenant catalogue's permissions, carried on
   the `Principal`. The engine then grants them at check time — **unchanged**. This
   avoids making the engine async or its global store tenant-aware.

3. **Resolution is fail-safe and composable.** Unknown or archived roles contribute
   no permissions (default-deny holds). The decorator composes over the base
   resolver, so the membership resolver stays free of any role-catalogue dependency.

4. **Membership validates role names against the catalogue** via an **optional**
   `RoleDirectory` port — additive and backward-compatible (in-memory callers that
   don't wire it are unaffected; the API wires it, so grants validate).

5. **The live security bootstrap is unchanged** for stability (as in M03/M04): the
   data-driven resolver is delivered and proven behind the `PrincipalResolver`
   interface, ready for the one-time live swap in the certification phase.

## Consequences

- Authorization is now defined by tenant data end to end: identity (M03),
  principal→role (M04) and **role→permission (M05)** are all persisted, tenant-scoped
  and proven against the engine — resolving the RBAC substance of TD-16 behind its
  ports.
- The frozen `AuthorizationEngine` and the global guard stack are untouched; the
  only new seam is a resolver decorator, exercised by an in-sandbox spec.
- Role names that memberships reference are kept honest by catalogue validation.
- **Deferred:** session/revocation persistence and the live-bootstrap swap (TD-16
  remainder); role inheritance/hierarchy and a first-class permission registry
  remain flat/opaque by choice (revisit if needed).
