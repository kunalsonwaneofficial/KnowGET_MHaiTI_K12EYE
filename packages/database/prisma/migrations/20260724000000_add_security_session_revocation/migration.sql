-- Session + token-revocation persistence (P2-D01 security hardening, TD-16).
-- Both tables are tenant-owned and isolated by FORCE Row-Level Security.
--
-- security_session is the server-side record of authenticated sessions: the
-- access token's `sid` claim references a row, so the guard can reject a session
-- that has been revoked or has lapsed. `id` is the opaque session token (TEXT, not
-- a UUID); the three timestamps are epoch-milliseconds (BIGINT) to preserve the
-- frozen `Session` numeric contract (P1-M04) without lossy conversion.
--
-- security_revocation is the durable revoked-token registry: a revoked access
-- token id (kind='token') or refresh-token family (kind='family'), unique per
-- tenant so re-revoking is idempotent.

CREATE TABLE "security_session" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "created_at" BIGINT NOT NULL,
    "last_activity_at" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "device" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "security_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_session_tenant_id_idx" ON "security_session"("tenant_id");
CREATE INDEX "security_session_tenant_id_identity_id_idx" ON "security_session"("tenant_id", "identity_id");

CREATE TABLE "security_revocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_revocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "security_revocation_tenant_id_kind_ref_key" ON "security_revocation"("tenant_id", "kind", "ref");
CREATE INDEX "security_revocation_tenant_id_idx" ON "security_revocation"("tenant_id");

-- Multi-tenancy: FORCE RLS on both; rows are visible/insertable only for the
-- session tenant (set_config('app.current_tenant', <uuid>, true)); an unset tenant
-- fails closed (NULLIF(...,'')::uuid → NULL, which no row matches).
ALTER TABLE "security_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_session" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "security_session"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "security_revocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_revocation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "security_revocation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
