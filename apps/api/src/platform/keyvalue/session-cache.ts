import type { Cache } from "@knowget/cache";

/**
 * Short-lived read-through cache of session validity (resolves TD-22). A cache hit
 * lets the JWT guard's session enforcer skip the per-request session-store read
 * (and activity touch); the TTL bounds staleness, and explicit revokes (logout,
 * replay) invalidate immediately. Over the Redis-backed cache this is cross-replica
 * — a revoke on one node is seen by all.
 */
export class SessionValidityCache {
  constructor(
    private readonly cache: Cache,
    private readonly ttlMs: number,
  ) {}

  /** True if this session was recently validated and not since invalidated. */
  async isValid(tenantId: string, sessionId: string): Promise<boolean> {
    return (await this.cache.get<true>(this.key(tenantId, sessionId))) === true;
  }

  /** Record a validated session for the (short) TTL window. */
  async markValid(tenantId: string, sessionId: string): Promise<void> {
    await this.cache.set(this.key(tenantId, sessionId), true, { ttlMs: this.ttlMs });
  }

  /** Drop a session from the fast path (call on revoke) so it is re-checked. */
  async invalidate(tenantId: string, sessionId: string): Promise<void> {
    await this.cache.delete(this.key(tenantId, sessionId));
  }

  private key(tenantId: string, sessionId: string): string {
    return `sess:${tenantId}:${sessionId}`;
  }
}
