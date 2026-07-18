-- Person domain table (P2-D01-M02). Tenant-owned; isolated by RLS. Contacts are
-- an embedded JSONB value-object collection; match_key powers dedup.
CREATE TABLE "person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "given_name" TEXT NOT NULL,
    "family_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "preferred_name" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT NOT NULL DEFAULT 'unspecified',
    "status" TEXT NOT NULL DEFAULT 'active',
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "match_key" TEXT NOT NULL,
    "merged_into" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "person_tenant_id_idx" ON "person"("tenant_id");
CREATE INDEX "person_tenant_id_match_key_idx" ON "person"("tenant_id", "match_key");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); unset fails closed.
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "person" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "person"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
