-- Knowledge Resource, Library & Digital Learning Asset Platform (P2-D18). Eight tenant-owned tables:
-- title, copy, digital_asset, library_member, loan, reservation, circulation_policy and
-- collection_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This domain carries
-- NO money (overdue/lost fines are deferred to Finance P2-D14; acquisition spend and asset valuation to
-- Procurement/Assets P2-D15): loan periods, renewal limits/counts, queue positions, holdings/circulation
-- counts, utilization percents and versions are INTEGER; JSONB carries the string lists (a title's authors
-- and subjects) and the circulation policy's rules (per-category rule array + default rule object); every
-- date-only and ISO-timestamp domain value (acquired/joined/expires/issue/returned/requested/ready/
-- refreshed stamps and licence expiry) is TEXT. Title availability and a loan's due date / overdue state
-- are always DERIVED by the pure engines, never stored. Uniqueness mirrors the domain: ISBN per tenant
-- (Postgres permits many NULLs, so untitled-by-ISBN copies coexist), barcode per tenant, membership number
-- per tenant, one membership per (person, org), one collection profile per org — all tenant-scoped. The
-- status-scoped uniques (one active loan per copy; one open reservation per member+title; one active
-- circulation policy per org) are service-enforced (TD-38). Organizations (P2-D01-M01) and persons
-- (P2-D01-M02) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "title" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "authors" JSONB NOT NULL DEFAULT '[]',
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "type" TEXT NOT NULL,
    "language" TEXT,
    "publisher" TEXT,
    "publication_year" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "title_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "title_tenant_id_isbn_key" ON "title"("tenant_id", "isbn");
CREATE INDEX "title_tenant_id_idx" ON "title"("tenant_id");
CREATE INDEX "title_tenant_id_organization_id_idx" ON "title"("tenant_id", "organization_id");
ALTER TABLE "title" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "title" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "title"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "copy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "location" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "acquired_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "copy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "copy_tenant_id_barcode_key" ON "copy"("tenant_id", "barcode");
CREATE INDEX "copy_tenant_id_idx" ON "copy"("tenant_id");
CREATE INDEX "copy_tenant_id_title_id_idx" ON "copy"("tenant_id", "title_id");
CREATE INDEX "copy_tenant_id_organization_id_idx" ON "copy"("tenant_id", "organization_id");
ALTER TABLE "copy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "copy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "digital_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "access_model" TEXT NOT NULL,
    "access_url" TEXT,
    "provider" TEXT,
    "license_expiry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "digital_asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "digital_asset_tenant_id_idx" ON "digital_asset"("tenant_id");
CREATE INDEX "digital_asset_tenant_id_organization_id_idx" ON "digital_asset"("tenant_id", "organization_id");
ALTER TABLE "digital_asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "digital_asset"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "library_member" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "membership_number" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "joined_on" TEXT NOT NULL,
    "expires_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "library_member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_member_tenant_id_membership_number_key" ON "library_member"("tenant_id", "membership_number");
CREATE UNIQUE INDEX "library_member_tenant_id_person_id_organization_id_key" ON "library_member"("tenant_id", "person_id", "organization_id");
CREATE INDEX "library_member_tenant_id_idx" ON "library_member"("tenant_id");
CREATE INDEX "library_member_tenant_id_organization_id_idx" ON "library_member"("tenant_id", "organization_id");
ALTER TABLE "library_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "library_member"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "loan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "issue_date" TEXT NOT NULL,
    "loan_period_days" INTEGER NOT NULL,
    "renewal_limit" INTEGER NOT NULL,
    "renewals_used" INTEGER NOT NULL DEFAULT 0,
    "returned_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loan_tenant_id_idx" ON "loan"("tenant_id");
CREATE INDEX "loan_tenant_id_copy_id_idx" ON "loan"("tenant_id", "copy_id");
CREATE INDEX "loan_tenant_id_member_id_idx" ON "loan"("tenant_id", "member_id");
CREATE INDEX "loan_tenant_id_organization_id_idx" ON "loan"("tenant_id", "organization_id");
ALTER TABLE "loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "loan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "reservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "requested_on" TEXT NOT NULL,
    "queue_position" INTEGER NOT NULL,
    "ready_on" TEXT,
    "expires_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reservation_tenant_id_idx" ON "reservation"("tenant_id");
CREATE INDEX "reservation_tenant_id_title_id_idx" ON "reservation"("tenant_id", "title_id");
CREATE INDEX "reservation_tenant_id_member_id_idx" ON "reservation"("tenant_id", "member_id");
CREATE INDEX "reservation_tenant_id_organization_id_idx" ON "reservation"("tenant_id", "organization_id");
ALTER TABLE "reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reservation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "circulation_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "default_rule" JSONB NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "circulation_policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "circulation_policy_tenant_id_idx" ON "circulation_policy"("tenant_id");
CREATE INDEX "circulation_policy_tenant_id_organization_id_idx" ON "circulation_policy"("tenant_id", "organization_id");
ALTER TABLE "circulation_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circulation_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "circulation_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "collection_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title_count" INTEGER NOT NULL DEFAULT 0,
    "copy_count" INTEGER NOT NULL DEFAULT 0,
    "available_count" INTEGER NOT NULL DEFAULT 0,
    "on_loan_count" INTEGER NOT NULL DEFAULT 0,
    "lost_count" INTEGER NOT NULL DEFAULT 0,
    "digital_asset_count" INTEGER NOT NULL DEFAULT 0,
    "active_loan_count" INTEGER NOT NULL DEFAULT 0,
    "overdue_loan_count" INTEGER NOT NULL DEFAULT 0,
    "open_reservation_count" INTEGER NOT NULL DEFAULT 0,
    "utilization_percent" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "collection_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_profile_tenant_id_organization_id_key" ON "collection_profile"("tenant_id", "organization_id");
CREATE INDEX "collection_profile_tenant_id_idx" ON "collection_profile"("tenant_id");
ALTER TABLE "collection_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collection_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "collection_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
