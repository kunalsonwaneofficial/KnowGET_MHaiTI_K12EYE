-- Relationship table (P2-D01-M06). Tenant-owned; isolated by RLS. A typed
-- association between two people, stored as a directed edge from_person →
-- to_person (guardian→dependent, sibling↔sibling, etc.).
CREATE TABLE "relationship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "from_person_id" UUID NOT NULL,
    "to_person_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "relationship_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relationship_tenant_id_idx" ON "relationship"("tenant_id");
CREATE INDEX "relationship_tenant_id_from_person_id_idx" ON "relationship"("tenant_id", "from_person_id");
CREATE INDEX "relationship_tenant_id_to_person_id_idx" ON "relationship"("tenant_id", "to_person_id");

-- Multi-tenancy: FORCE RLS; rows visible/insertable only for the session tenant
-- (set_config('app.current_tenant', <uuid>, true)); unset fails closed.
ALTER TABLE "relationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "relationship"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
