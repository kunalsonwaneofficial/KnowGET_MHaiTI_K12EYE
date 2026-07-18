import type { TenantId } from "@knowget/types";

export type RevocationKind = "token" | "family";

/** A reference to check for revocation: an access-token id (`jti`) and/or the
 * refresh-token family it belongs to. */
export interface RevocationRef {
  readonly tokenId?: string;
  readonly familyId?: string;
}

/**
 * Tenant-scoped persistence port for token/family revocations — the durable
 * replacement for the frozen in-memory `RevocationRegistry` (P1-M04). A revoked
 * access-token id or refresh-token family is recorded per tenant; the guard
 * consults it on every request so a revocation takes effect immediately and
 * survives restarts / spans replicas.
 */
export interface RevocationStore {
  revoke(tenantId: TenantId, kind: RevocationKind, ref: string): Promise<void>;
  isRevoked(tenantId: TenantId, ref: RevocationRef): Promise<boolean>;
}

/** In-memory {@link RevocationStore} — in-sandbox testable; tenant-keyed so a
 * revocation in one tenant never leaks into another. */
export class InMemoryRevocationStore implements RevocationStore {
  private readonly entries = new Set<string>();

  async revoke(tenantId: TenantId, kind: RevocationKind, ref: string): Promise<void> {
    this.entries.add(this.key(tenantId, kind, ref));
  }

  async isRevoked(tenantId: TenantId, ref: RevocationRef): Promise<boolean> {
    if (ref.tokenId !== undefined && this.entries.has(this.key(tenantId, "token", ref.tokenId))) {
      return true;
    }
    return (
      ref.familyId !== undefined && this.entries.has(this.key(tenantId, "family", ref.familyId))
    );
  }

  private key(tenantId: TenantId, kind: RevocationKind, ref: string): string {
    return `${tenantId}:${kind}:${ref}`;
  }
}
