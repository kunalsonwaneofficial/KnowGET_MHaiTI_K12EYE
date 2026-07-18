-- Refresh-token rotation & replay detection (TD-18). Tenant-owned; FORCE RLS.
--
-- A stored refresh token belongs to a rotating **family** bound to a login
-- **session**. Rotating consumes a token (status → 'rotated') and issues its
-- successor in the same family; presenting a consumed token is a replay, which
-- revokes the family (recorded in security_revocation) and its session.
--
-- `token_hash` is the SHA-256 hex of the opaque token — the raw token is never
-- stored; `(tenant_id, token_hash)` is unique so a presented token resolves to at
-- most one record within the tenant. Timestamps are epoch-milliseconds (BIGINT).

CREATE TABLE "security_refresh_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "family_id" TEXT NOT NULL,
    "identity_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issued_at" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    CONSTRAINT "security_refresh_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "security_refresh_token_tenant_id_token_hash_key" ON "security_refresh_token"("tenant_id", "token_hash");
CREATE INDEX "security_refresh_token_tenant_id_family_id_idx" ON "security_refresh_token"("tenant_id", "family_id");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); an unset tenant fails closed.
ALTER TABLE "security_refresh_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_refresh_token" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "security_refresh_token"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
