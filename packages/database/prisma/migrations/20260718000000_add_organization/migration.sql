-- Organization domain table (P2-D01-M01). Tenant-owned; isolated by RLS.
CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- Code is unique within a tenant; indexes serve tenant and child lookups.
CREATE UNIQUE INDEX "organization_tenant_id_code_key" ON "organization"("tenant_id", "code");
CREATE INDEX "organization_tenant_id_idx" ON "organization"("tenant_id");
CREATE INDEX "organization_tenant_id_parent_id_idx" ON "organization"("tenant_id", "parent_id");

-- Multi-tenancy: FORCE RLS so isolation applies even to the table owner. Rows
-- are visible/insertable only for the tenant set via
-- set_config('app.current_tenant', <uuid>, true); unset fails closed (0 rows).
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "organization"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
