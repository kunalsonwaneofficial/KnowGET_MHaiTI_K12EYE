import type { Session, SessionRepository } from "@knowget/authentication";
import type { TenantId } from "@knowget/types";
import type { SessionStore } from "./session-store";

/**
 * Adapt the tenant-explicit {@link SessionStore} to the frozen, tenant-implicit
 * `SessionRepository` that the P1-M04 `SessionManager` consumes. The tenant is
 * bound at construction (resolved from the sign-in request at login, or the
 * token's `tenant` claim per request), so every read and write stays RLS-clean.
 * Mirrors `tenantIdentityRepository` (the identity bridge, ADR-0011).
 */
export function tenantSessionRepository(
  store: SessionStore,
  tenantId: TenantId,
): SessionRepository {
  return {
    create: (session: Session): Promise<void> => store.create(tenantId, session),
    findById: (id: string): Promise<Session | null> => store.findById(tenantId, id),
    findByIdentity: (identityId: string): Promise<Session[]> =>
      store.findByIdentity(tenantId, identityId),
    update: (session: Session): Promise<void> => store.update(tenantId, session),
  };
}
