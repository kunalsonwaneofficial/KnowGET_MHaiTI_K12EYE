-- Role catalogue table (P2-D01-M05). Tenant-owned; isolated by RLS. A named grant
-- of permissions (text[]); memberships reference roles by name and the
-- authorization engine expands a principal's roles into these permissions.
CREATE TABLE "role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "role_tenant_id_idx" ON "role"("tenant_id");
CREATE INDEX "role_tenant_id_name_idx" ON "role"("tenant_id", "name");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); unset fails closed.
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "role"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
