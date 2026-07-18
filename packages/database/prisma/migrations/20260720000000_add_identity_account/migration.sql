-- Enterprise Identity account table (P2-D01-M03). Tenant-owned; isolated by RLS.
-- Links a person (person_id) to login identifiers + credential. Identifiers are
-- an embedded JSONB value-object collection; identifier_keys is a normalized,
-- GIN-indexed lookup array powering tenant-scoped identifier resolution.
CREATE TABLE "identity_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "identifiers" JSONB NOT NULL DEFAULT '[]',
    "identifier_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "credential_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "identity_account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_account_tenant_id_idx" ON "identity_account"("tenant_id");
CREATE INDEX "identity_account_tenant_id_person_id_idx" ON "identity_account"("tenant_id", "person_id");
-- GIN index over the normalized identifier keys: `identifier_keys @> ARRAY[$key]`
-- (Prisma `has`) resolves an identifier to its account within the tenant.
CREATE INDEX "identity_account_identifier_keys_idx" ON "identity_account" USING GIN ("identifier_keys");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); unset fails closed.
ALTER TABLE "identity_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_account" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "identity_account"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
