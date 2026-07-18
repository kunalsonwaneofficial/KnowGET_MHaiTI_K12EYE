# Engineering Delivery Report — P2-D01-M05

**Authorization** · Phase 2 (Enterprise Domain Engineering) · Program A (Identity & Organization)

|                |                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D01-M05 — Authorization                                                                                                          |
| **Status**     | 🔄 Implemented; verification green in-sandbox + on live PostgreSQL. CI pending on `feat/p2-d01-m05-authorization` (pre-merge gate). |
| **Depends on** | P2-D01-M01…M04 (Organization, Person, Identity, Membership), P1-M04 (Authorization engine/RBAC), Phase 1 baseline (`v0.1.0`)        |
| **Date**       | 18 July 2026                                                                                                                        |
| **Next**       | P2-D01-M06 — Relationship                                                                                                           |

---

## 1. Mission recap

Deliver **Authorization** — the tenant-scoped **role catalogue** that gives role
names meaning. Memberships (M04) assign role _names_; this milestone makes those
names first-class, tenant-owned definitions of **which permissions each role
grants**, and **closes the authorization loop**: an authenticated principal's
permissions are now resolved from its own tenant's roles, data-driven, so the
authorization engine grants exactly what the institution has defined.

## 2. What was engineered

| Layer            | Delivered                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**       | `@knowget/roles` — `Role` aggregate (tenant-scoped: name, description, permission set, `active`/`archived` status, `isSystem`), permission normalization, lifecycle, domain events, repository port + in-memory impl, `RoleService`                      |
| **Persistence**  | `Role` table in `schema.prisma` (tenant-scoped; name; **`permissions` text[]**; status; `is_system`; soft delete) + `add_role` migration with **FORCE RLS**                                                                                              |
| **Adapter**      | `PrismaRoleRepository` — implements the port over Prisma (RLS via `withTenant`)                                                                                                                                                                          |
| **API**          | `RolesModule` + `RolesController` (define / get / list / by-name / set- grant- revoke-permissions / rename / describe / archive / unarchive / delete), zod DTOs, `role:read`/`:write`, tenant from the principal                                         |
| **Loop closure** | `withResolvedPermissions` — a composition-root decorator over the M04 principal resolver that expands a principal's role names into the tenant role's **permissions** onto the `Principal`, so the frozen authorization engine grants them at check time |
| **Integration**  | Membership now validates role names against the catalogue (optional `RoleDirectory` port): granting or changing to an undefined/inactive role is rejected                                                                                                |

## 3. Domain capabilities & invariants

- **Tenant-scoped catalogue** — roles are per tenant; names are unique within a
  tenant (the same name is free in another). Memberships reference roles by name.
- **Permissions** — opaque action strings (e.g. `student.read`, `*`), normalized
  (trimmed, de-duplicated); an empty set is valid (a role that grants nothing).
- **Lifecycle** — `active ↔ archived`; only active roles grant permissions or can
  be assigned. **System roles** (`isSystem`) are protected from rename, archive
  and delete (their permissions may still be edited).
- **Authorization is data-driven** — a principal's permissions are the union of
  its active roles' permissions, resolved from the tenant catalogue at
  principal-resolution time and carried on `Principal.permissions`; the engine
  unions them at check time. Unknown or archived roles contribute nothing (fail-safe).
- **Referential integrity** — a membership cannot grant a role name that is not an
  active role in the tenant's catalogue.
- **Tenant isolation** — layered: explicit tenant argument in the port, RLS in the
  adapter, and the principal's tenant at the edge.
- **Event per change** — defined / permissions-changed / renamed / archived / unarchived.

## 4. Verification

- **In-sandbox (green):** `@knowget/roles` builds, type-checks and lints clean with
  **12 tests** (permission normalization; creation; lifecycle; service: name dedup,
  permission edits, system-role protection, role existence, permission union).
  Membership: **18 tests** (incl. **2 new** role-validation tests). API layer:
  **58 tests** total, incl. **3 roles controller tests** and **2 permission-resolution
  tests**; Prisma-free API code type-checks in isolation; format clean.
- **Loop closure (green, in-sandbox):** with a `teacher` role defined
  (`student.read`, …) and a membership granting it, the resolved `Principal`
  carries those permissions; an **undefined or archived** role yields **no**
  permissions.
- **Live PostgreSQL (psql):** applied `add_role` as the non-superuser app role and
  verified — RLS **enabled + forced**; the same role name is isolated per tenant;
  **no-tenant reads return 0 (fail-closed)**; cross-tenant insert **blocked by
  `WITH CHECK`**; the `permissions` text[] persists and reads back intact.
- **CI-verified:** the Prisma client build, `prisma migrate deploy`, the
  `PrismaRoleRepository`, and the full `nest build` (TD-12).

## 5. Decisions

Recorded in **ADR-0012**. The key decision: the frozen P1-M04 `AuthorizationEngine`
resolves roles→permissions **synchronously** through a global `RoleStore`, but a
tenant-scoped catalogue is **async and per-tenant**. Rather than modify the
certified engine or make its global singleton request-scoped, the loop is closed
through the engine's existing seam — `Principal.permissions` — by **expanding
permissions at principal-resolution time** (the `withResolvedPermissions`
decorator over the membership resolver). This keeps the engine untouched and the
resolver composable. Membership role validation is added via an **optional** port
(backward-compatible). As before, the **live security bootstrap is unchanged** for
stability; the data-driven resolver is delivered and proven behind the interface.

## 6. Technical debt

- **TD-16 — authorization is now fully data-driven per tenant** behind the ports:
  identity (M03), principal→role via membership (M04) and **role→permission via the
  catalogue (M05)** are all persisted and tenant-scoped and proven against the
  engine. Remaining under TD-16: **session / revocation** persistence and the
  one-time flip of the **live security bootstrap** onto these stores (with the
  tenant-qualified request wiring) — certification-phase work.
- No new blocking debt; `DataProbe` (TD-14) remains the data-platform fixture.

## 7. Recommendation — proceed to P2-D01-M06

On green CI, merge to `main` and begin **P2-D01-M06 — Relationship** (modelling
relationships between people — e.g. guardian↔student — completing the Identity &
Organization domain graph ahead of the sub-domain certification in M07).
