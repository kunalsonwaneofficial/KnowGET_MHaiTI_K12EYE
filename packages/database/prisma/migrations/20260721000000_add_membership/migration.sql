-- Membership table (P2-D01-M04). Tenant-owned; isolated by RLS. The join across
-- Person and Organization: a person's roles within an organization node, with a
-- status and an effective period. Role names are stored as a text[] (opaque here;
-- their permissions are resolved by the authorization engine).
CREATE TABLE "membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_tenant_id_idx" ON "membership"("tenant_id");
CREATE INDEX "membership_tenant_id_person_id_idx" ON "membership"("tenant_id", "person_id");
CREATE INDEX "membership_tenant_id_organization_id_idx" ON "membership"("tenant_id", "organization_id");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); unset fails closed.
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "membership"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
