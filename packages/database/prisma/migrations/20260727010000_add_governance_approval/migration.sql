-- Institutional Governance Platform (P2-D02): reusable approval workflow.
-- The governance_approval table persists workflow instances of the single
-- reusable approval process (policy/committee/resolution/delegation approval),
-- driven by the Phase-1 workflow engine. Tenant-isolated by FORCE RLS.

CREATE TABLE "governance_approval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "status" TEXT NOT NULL DEFAULT 'running',
    "submitted_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "note" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_approval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_approval_tenant_id_idx" ON "governance_approval"("tenant_id");
CREATE INDEX "governance_approval_tenant_id_organization_id_idx" ON "governance_approval"("tenant_id", "organization_id");
CREATE INDEX "governance_approval_tenant_id_kind_subject_id_idx" ON "governance_approval"("tenant_id", "kind", "subject_id");
ALTER TABLE "governance_approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_approval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_approval"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
