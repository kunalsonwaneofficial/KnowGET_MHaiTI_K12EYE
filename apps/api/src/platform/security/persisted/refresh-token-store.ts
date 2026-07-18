import { secureToken } from "@knowget/security";
import type { TenantId } from "@knowget/types";

export type RefreshTokenStatus = "active" | "rotated";

/** A stored refresh token in a rotating family bound to a login session. */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly familyId: string;
  readonly identityId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly status: RefreshTokenStatus;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/** Fields to persist for a newly issued refresh token (the store assigns id + active status). */
export interface NewRefreshToken {
  readonly familyId: string;
  readonly identityId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * Tenant-scoped persistence port for rotating refresh tokens (TD-18). Family-level
 * revocation lives in the {@link RevocationStore} (kind `family`), which both the
 * refresh flow and the JWT guard consult — so a revoked family is enforced in one
 * place. This store owns per-token lifecycle: issue (active) and consume (rotated),
 * the pair that makes replay detectable (a presented token already `rotated` is a
 * reuse).
 */
export interface RefreshTokenStore {
  /** Persist a newly issued (active) refresh token; returns the stored record. */
  save(tenantId: TenantId, token: NewRefreshToken): Promise<RefreshTokenRecord>;
  /** Resolve a presented token by its hash within the tenant. */
  findByHash(tenantId: TenantId, tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark a token consumed (rotated) — its successor in the family has been issued. */
  markRotated(tenantId: TenantId, id: string): Promise<void>;
}

/** In-memory {@link RefreshTokenStore} — in-sandbox testable; tenant-keyed. */
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly rows = new Map<
    string,
    { readonly tenantId: TenantId; record: RefreshTokenRecord }
  >();

  async save(tenantId: TenantId, token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = { id: secureToken(12), status: "active", ...token };
    this.rows.set(this.key(tenantId, record.id), { tenantId, record });
    return record;
  }

  async findByHash(tenantId: TenantId, tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const row of this.rows.values()) {
      if (row.tenantId === tenantId && row.record.tokenHash === tokenHash) {
        return row.record;
      }
    }
    return null;
  }

  async markRotated(tenantId: TenantId, id: string): Promise<void> {
    const row = this.rows.get(this.key(tenantId, id));
    if (row) {
      row.record = { ...row.record, status: "rotated" };
    }
  }

  private key(tenantId: TenantId, id: string): string {
    return `${tenantId}:${id}`;
  }
}
