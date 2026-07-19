-- Student Lifecycle Intelligence Platform (P2-D03). Six tenant-owned tables for the
-- learner journey (prospect -> applicant -> student -> alumni) plus the append-only
-- educational journey, intelligence profile and permanent timeline. Every table is
-- tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy.

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_prospect" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "lead_source" TEXT NOT NULL,
    "campaign" TEXT,
    "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'new',
    "follow_ups" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_prospect_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_prospect_tenant_id_idx" ON "student_prospect"("tenant_id");
CREATE INDEX "student_prospect_tenant_id_organization_id_idx" ON "student_prospect"("tenant_id", "organization_id");
ALTER TABLE "student_prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_prospect" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_prospect"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_applicant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "prospect_id" UUID,
    "program_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "interview" JSONB,
    "decision" JSONB,
    "submitted_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_applicant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_applicant_tenant_id_idx" ON "student_applicant"("tenant_id");
CREATE INDEX "student_applicant_tenant_id_organization_id_idx" ON "student_applicant"("tenant_id", "organization_id");
CREATE INDEX "student_applicant_tenant_id_person_id_idx" ON "student_applicant"("tenant_id", "person_id");
ALTER TABLE "student_applicant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_applicant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_applicant"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "membership_id" UUID,
    "applicant_id" UUID,
    "student_number" TEXT NOT NULL,
    "program_id" UUID,
    "section_id" UUID,
    "academic_year" TEXT,
    "roll_number" TEXT,
    "enrollment_status" TEXT NOT NULL DEFAULT 'enrolled',
    "academic_status" TEXT NOT NULL DEFAULT 'good_standing',
    "administrative_status" TEXT NOT NULL DEFAULT 'clear',
    "enrolled_on" DATE,
    "exited_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_tenant_id_student_number_key" ON "student"("tenant_id", "student_number");
CREATE INDEX "student_tenant_id_idx" ON "student"("tenant_id");
CREATE INDEX "student_tenant_id_organization_id_idx" ON "student"("tenant_id", "organization_id");
CREATE INDEX "student_tenant_id_person_id_idx" ON "student"("tenant_id", "person_id");
ALTER TABLE "student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_educational_journey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_educational_journey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_educational_journey_tenant_id_student_id_key" ON "student_educational_journey"("tenant_id", "student_id");
CREATE INDEX "student_educational_journey_tenant_id_idx" ON "student_educational_journey"("tenant_id");
ALTER TABLE "student_educational_journey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_educational_journey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_educational_journey"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_intelligence_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "indicators" JSONB NOT NULL DEFAULT '{}',
    "interventions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_intelligence_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_intelligence_profile_tenant_id_student_id_key" ON "student_intelligence_profile"("tenant_id", "student_id");
CREATE INDEX "student_intelligence_profile_tenant_id_idx" ON "student_intelligence_profile"("tenant_id");
ALTER TABLE "student_intelligence_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_intelligence_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_intelligence_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_timeline_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "source_event" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_timeline_entry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_timeline_entry_tenant_id_idx" ON "student_timeline_entry"("tenant_id");
CREATE INDEX "student_timeline_entry_tenant_id_student_id_idx" ON "student_timeline_entry"("tenant_id", "student_id");
CREATE INDEX "student_timeline_entry_tenant_id_organization_id_idx" ON "student_timeline_entry"("tenant_id", "organization_id");
CREATE INDEX "student_timeline_entry_tenant_id_occurred_on_idx" ON "student_timeline_entry"("tenant_id", "occurred_on");
ALTER TABLE "student_timeline_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_timeline_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_timeline_entry"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
