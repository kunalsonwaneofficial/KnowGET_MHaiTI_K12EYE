import type { Session } from "@knowget/authentication";
import type { TenantId } from "@knowget/types";

/**
 * Tenant-explicit persistence port for {@link Session} rows. The frozen
 * `SessionRepository` (P1-M04) is tenant-implicit (it has no tenant argument);
 * this port carries the tenant so one store serves every tenant under RLS.
 * {@link tenantSessionRepository} adapts it back to the frozen interface for the
 * `SessionManager`.
 */
export interface SessionStore {
  create(tenantId: TenantId, session: Session): Promise<void>;
  findById(tenantId: TenantId, id: string): Promise<Session | null>;
  findByIdentity(tenantId: TenantId, identityId: string): Promise<Session[]>;
  update(tenantId: TenantId, session: Session): Promise<void>;
}

/**
 * In-memory {@link SessionStore} — fully in-sandbox testable. Keyed by tenant so
 * it exercises the same tenant scoping the Prisma/RLS adapter enforces in
 * production (a session is only ever visible to its own tenant).
 */
export class InMemorySessionStore implements SessionStore {
  private readonly rows = new Map<
    string,
    { readonly tenantId: TenantId; readonly session: Session }
  >();

  async create(tenantId: TenantId, session: Session): Promise<void> {
    this.rows.set(this.key(tenantId, session.id), { tenantId, session });
  }

  async findById(tenantId: TenantId, id: string): Promise<Session | null> {
    return this.rows.get(this.key(tenantId, id))?.session ?? null;
  }

  async findByIdentity(tenantId: TenantId, identityId: string): Promise<Session[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId && row.session.identityId === identityId)
      .map((row) => row.session);
  }

  async update(tenantId: TenantId, session: Session): Promise<void> {
    this.rows.set(this.key(tenantId, session.id), { tenantId, session });
  }

  private key(tenantId: TenantId, id: string): string {
    return `${tenantId}:${id}`;
  }
}
