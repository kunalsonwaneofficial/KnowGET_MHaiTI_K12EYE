-- Institutional Governance Platform (P2-D02). Seven tenant-owned tables — governance
-- bodies, committees, policies (+ acknowledgments), delegations of authority,
-- resolutions and the governance calendar — each isolated by FORCE Row-Level
-- Security (rows visible/insertable only for the session tenant; unset fails closed).

-- Governance body -----------------------------------------------------------------
CREATE TABLE "governance_body" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_body_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "terms_of_reference" TEXT,
    "established_on" DATE,
    "dissolved_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_body_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_body_tenant_id_idx" ON "governance_body"("tenant_id");
CREATE INDEX "governance_body_tenant_id_organization_id_idx" ON "governance_body"("tenant_id", "organization_id");
CREATE INDEX "governance_body_tenant_id_parent_body_id_idx" ON "governance_body"("tenant_id", "parent_body_id");
ALTER TABLE "governance_body" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_body" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_body"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Committee -----------------------------------------------------------------------
CREATE TABLE "governance_committee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "governance_body_id" UUID,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "terms_of_reference" TEXT,
    "members" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_committee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_committee_tenant_id_idx" ON "governance_committee"("tenant_id");
CREATE INDEX "governance_committee_tenant_id_organization_id_idx" ON "governance_committee"("tenant_id", "organization_id");
ALTER TABLE "governance_committee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_committee" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_committee"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Policy --------------------------------------------------------------------------
CREATE TABLE "governance_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "owner_id" UUID NOT NULL,
    "effective_on" DATE,
    "approved_on" DATE,
    "published_on" DATE,
    "retired_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_policy_tenant_id_idx" ON "governance_policy"("tenant_id");
CREATE INDEX "governance_policy_tenant_id_organization_id_idx" ON "governance_policy"("tenant_id", "organization_id");
CREATE INDEX "governance_policy_tenant_id_organization_id_status_idx" ON "governance_policy"("tenant_id", "organization_id", "status");
ALTER TABLE "governance_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Policy acknowledgment -----------------------------------------------------------
CREATE TABLE "governance_policy_acknowledgment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledged_on" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "governance_policy_acknowledgment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "governance_policy_acknowledgment_tenant_id_policy_id_person__key" ON "governance_policy_acknowledgment"("tenant_id", "policy_id", "person_id", "version");
CREATE INDEX "governance_policy_acknowledgment_tenant_id_policy_id_idx" ON "governance_policy_acknowledgment"("tenant_id", "policy_id");
ALTER TABLE "governance_policy_acknowledgment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_policy_acknowledgment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_policy_acknowledgment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Delegation of authority ---------------------------------------------------------
CREATE TABLE "governance_delegation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "description" TEXT,
    "monetary_limit" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "granted_on" DATE NOT NULL,
    "revoked_on" DATE,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_delegation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_delegation_tenant_id_idx" ON "governance_delegation"("tenant_id");
CREATE INDEX "governance_delegation_tenant_id_organization_id_idx" ON "governance_delegation"("tenant_id", "organization_id");
CREATE INDEX "governance_delegation_tenant_id_delegate_id_idx" ON "governance_delegation"("tenant_id", "delegate_id");
ALTER TABLE "governance_delegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_delegation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_delegation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Resolution ----------------------------------------------------------------------
CREATE TABLE "governance_resolution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "governance_body_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "proposal_text" TEXT NOT NULL,
    "proposed_by_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "votes" JSONB NOT NULL DEFAULT '[]',
    "effective_on" DATE,
    "approved_on" DATE,
    "implemented_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_resolution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_resolution_tenant_id_idx" ON "governance_resolution"("tenant_id");
CREATE INDEX "governance_resolution_tenant_id_governance_body_id_idx" ON "governance_resolution"("tenant_id", "governance_body_id");
ALTER TABLE "governance_resolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_resolution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_resolution"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Governance calendar -------------------------------------------------------------
CREATE TABLE "governance_calendar_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "governance_body_id" UUID,
    "committee_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "completed_on" DATE,
    "minutes" TEXT,
    "attendee_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "governance_calendar_entry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_calendar_entry_tenant_id_idx" ON "governance_calendar_entry"("tenant_id");
CREATE INDEX "governance_calendar_entry_tenant_id_organization_id_idx" ON "governance_calendar_entry"("tenant_id", "organization_id");
CREATE INDEX "governance_calendar_entry_tenant_id_scheduled_on_idx" ON "governance_calendar_entry"("tenant_id", "scheduled_on");
ALTER TABLE "governance_calendar_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_calendar_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_calendar_entry"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
