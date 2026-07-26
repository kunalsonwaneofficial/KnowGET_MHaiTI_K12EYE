-- Admissions, Marketing, Enrollment & Growth Platform (P2-D23). Eight tenant-owned tables:
-- marketing_campaign, lead, admission_cycle, application, admission_evaluation, offer,
-- enrollment_confirmation and admissions_funnel_profile. Every table is tenant-isolated by FORCE ROW LEVEL
-- SECURITY with the standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset
-- tenant). This domain owns the top of the institution's growth funnel — the campaigns it runs and the leads
-- they draw, the admission cycles it opens with their per-grade seat plans, the applications families submit
-- and the immutable entrance evaluations they gather, the offers extended and the immutable enrollment
-- confirmations that close the funnel — with a descriptive, re-derivable per-cycle funnel profile. It carries
-- NO money: application and admission fees are Finance's (P2-D14). Types follow the data: an evaluation score,
-- every funnel count and every conversion/fill percent are INTEGER; a cycle's per-grade seat plan is JSONB;
-- every date/ISO stamp (start/end, opens/closes, submitted/decided, evaluated, extended/respond-by/responded,
-- confirmed, refreshed) and every code, name, channel, source, status, grade and contact detail is TEXT.
-- Funnel and intake rates are DERIVED by the two pure engines (admissions_funnel_profile is a re-derivable
-- read model). Marketing message delivery is the notifications (P1-M05) / engagement (P2-D22) concern.
-- Uniqueness is DB-backed: campaign / lead / cycle / application code per tenant, one offer per application,
-- one enrollment confirmation per offer, one funnel profile per cycle. Organizations (P2-D01-M01), persons
-- (P2-D01-M02) and the prospect/applicant/student records of Student Lifecycle (P2-D03) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "marketing_campaign" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "start_on" TEXT,
    "end_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "marketing_campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_campaign_tenant_id_code_key" ON "marketing_campaign"("tenant_id", "code");
CREATE INDEX "marketing_campaign_tenant_id_idx" ON "marketing_campaign"("tenant_id");
CREATE INDEX "marketing_campaign_tenant_id_organization_id_idx" ON "marketing_campaign"("tenant_id", "organization_id");
ALTER TABLE "marketing_campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_campaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "marketing_campaign"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "lead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL,
    "campaign_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_tenant_id_code_key" ON "lead"("tenant_id", "code");
CREATE INDEX "lead_tenant_id_idx" ON "lead"("tenant_id");
CREATE INDEX "lead_tenant_id_organization_id_idx" ON "lead"("tenant_id", "organization_id");
CREATE INDEX "lead_tenant_id_campaign_id_idx" ON "lead"("tenant_id", "campaign_id");
ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lead"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "admission_cycle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "grade_capacities" JSONB NOT NULL DEFAULT '[]',
    "opens_on" TEXT,
    "closes_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "admission_cycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admission_cycle_tenant_id_code_key" ON "admission_cycle"("tenant_id", "code");
CREATE INDEX "admission_cycle_tenant_id_idx" ON "admission_cycle"("tenant_id");
CREATE INDEX "admission_cycle_tenant_id_organization_id_idx" ON "admission_cycle"("tenant_id", "organization_id");
ALTER TABLE "admission_cycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_cycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "admission_cycle"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "application" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "applicant_person_id" UUID NOT NULL,
    "lead_id" UUID,
    "code" TEXT NOT NULL,
    "grade_applying_for" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submitted_on" TEXT NOT NULL,
    "decided_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "application_tenant_id_code_key" ON "application"("tenant_id", "code");
CREATE INDEX "application_tenant_id_idx" ON "application"("tenant_id");
CREATE INDEX "application_tenant_id_cycle_id_idx" ON "application"("tenant_id", "cycle_id");
CREATE INDEX "application_tenant_id_organization_id_idx" ON "application"("tenant_id", "organization_id");
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "application"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "admission_evaluation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "evaluated_on" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "admission_evaluation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admission_evaluation_tenant_id_idx" ON "admission_evaluation"("tenant_id");
CREATE INDEX "admission_evaluation_tenant_id_application_id_idx" ON "admission_evaluation"("tenant_id", "application_id");
ALTER TABLE "admission_evaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_evaluation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "admission_evaluation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "offer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "grade_offered" TEXT NOT NULL,
    "extended_on" TEXT NOT NULL,
    "respond_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'extended',
    "responded_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "offer_tenant_id_application_id_key" ON "offer"("tenant_id", "application_id");
CREATE INDEX "offer_tenant_id_idx" ON "offer"("tenant_id");
CREATE INDEX "offer_tenant_id_cycle_id_idx" ON "offer"("tenant_id", "cycle_id");
ALTER TABLE "offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "offer"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "enrollment_confirmation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "applicant_person_id" UUID NOT NULL,
    "grade_confirmed" TEXT NOT NULL,
    "student_id" UUID,
    "confirmed_on" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "enrollment_confirmation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enrollment_confirmation_tenant_id_offer_id_key" ON "enrollment_confirmation"("tenant_id", "offer_id");
CREATE INDEX "enrollment_confirmation_tenant_id_idx" ON "enrollment_confirmation"("tenant_id");
CREATE INDEX "enrollment_confirmation_tenant_id_cycle_id_idx" ON "enrollment_confirmation"("tenant_id", "cycle_id");
ALTER TABLE "enrollment_confirmation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollment_confirmation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "enrollment_confirmation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "admissions_funnel_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "lead_count" INTEGER NOT NULL DEFAULT 0,
    "application_count" INTEGER NOT NULL DEFAULT 0,
    "offer_count" INTEGER NOT NULL DEFAULT 0,
    "enrollment_count" INTEGER NOT NULL DEFAULT 0,
    "lead_to_application_percent" INTEGER NOT NULL DEFAULT 0,
    "application_to_offer_percent" INTEGER NOT NULL DEFAULT 0,
    "offer_to_enrollment_percent" INTEGER NOT NULL DEFAULT 0,
    "overall_conversion_percent" INTEGER NOT NULL DEFAULT 0,
    "grade_count" INTEGER NOT NULL DEFAULT 0,
    "total_capacity" INTEGER NOT NULL DEFAULT 0,
    "total_confirmed" INTEGER NOT NULL DEFAULT 0,
    "fill_percent" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "admissions_funnel_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admissions_funnel_profile_tenant_id_cycle_id_key" ON "admissions_funnel_profile"("tenant_id", "cycle_id");
CREATE INDEX "admissions_funnel_profile_tenant_id_idx" ON "admissions_funnel_profile"("tenant_id");
CREATE INDEX "admissions_funnel_profile_tenant_id_organization_id_idx" ON "admissions_funnel_profile"("tenant_id", "organization_id");
ALTER TABLE "admissions_funnel_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admissions_funnel_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "admissions_funnel_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
