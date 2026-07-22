-- Learner Wellbeing, Safety & Success Platform (P2-D05). Seven tenant-owned tables: the
-- holistic wellbeing profile, the health record, the behaviour record, the counselling
-- case, the safeguarding case, the learner support plan and the intervention plan. Every
-- table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation
-- policy (both USING and WITH CHECK, fail-closed on an unset tenant). The sensitive
-- surfaces (health, counselling, safeguarding) are additionally gated by fine-grained
-- permission scopes at the API layer.

-- ---------------------------------------------------------------------------------
CREATE TABLE "wellbeing_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "learning_support_indicators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "success_metrics" JSONB NOT NULL DEFAULT '[]',
    "indicators" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "wellbeing_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wellbeing_profile_tenant_id_student_id_key" ON "wellbeing_profile"("tenant_id", "student_id");
CREATE INDEX "wellbeing_profile_tenant_id_idx" ON "wellbeing_profile"("tenant_id");
CREATE INDEX "wellbeing_profile_tenant_id_organization_id_idx" ON "wellbeing_profile"("tenant_id", "organization_id");
ALTER TABLE "wellbeing_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wellbeing_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "wellbeing_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "health_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "medical_history" TEXT,
    "blood_group" TEXT,
    "allergies" JSONB NOT NULL DEFAULT '[]',
    "chronic_conditions" JSONB NOT NULL DEFAULT '[]',
    "immunizations" JSONB NOT NULL DEFAULT '[]',
    "medications" JSONB NOT NULL DEFAULT '[]',
    "medical_alerts" JSONB NOT NULL DEFAULT '[]',
    "emergency_plan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "health_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "health_record_tenant_id_student_id_key" ON "health_record"("tenant_id", "student_id");
CREATE INDEX "health_record_tenant_id_idx" ON "health_record"("tenant_id");
CREATE INDEX "health_record_tenant_id_organization_id_idx" ON "health_record"("tenant_id", "organization_id");
ALTER TABLE "health_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "health_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "behaviour_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "observations" JSONB NOT NULL DEFAULT '[]',
    "incidents" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "improvement_plan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "behaviour_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "behaviour_record_tenant_id_student_id_key" ON "behaviour_record"("tenant_id", "student_id");
CREATE INDEX "behaviour_record_tenant_id_idx" ON "behaviour_record"("tenant_id");
CREATE INDEX "behaviour_record_tenant_id_organization_id_idx" ON "behaviour_record"("tenant_id", "organization_id");
ALTER TABLE "behaviour_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "behaviour_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "counselling_case" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "counsellor_id" UUID NOT NULL,
    "presenting_concern" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "sessions" JSONB NOT NULL DEFAULT '[]',
    "referrals" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "counselling_case_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "counselling_case_tenant_id_idx" ON "counselling_case"("tenant_id");
CREATE INDEX "counselling_case_tenant_id_student_id_idx" ON "counselling_case"("tenant_id", "student_id");
CREATE INDEX "counselling_case_tenant_id_counsellor_id_idx" ON "counselling_case"("tenant_id", "counsellor_id");
CREATE INDEX "counselling_case_tenant_id_organization_id_idx" ON "counselling_case"("tenant_id", "organization_id");
ALTER TABLE "counselling_case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselling_case" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "counselling_case"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "safeguarding_case" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "concern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'reported',
    "reported_by" UUID NOT NULL,
    "incident_reports" JSONB NOT NULL DEFAULT '[]',
    "escalations" JSONB NOT NULL DEFAULT '[]',
    "external_agencies" JSONB NOT NULL DEFAULT '[]',
    "resolution" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "safeguarding_case_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "safeguarding_case_tenant_id_idx" ON "safeguarding_case"("tenant_id");
CREATE INDEX "safeguarding_case_tenant_id_student_id_idx" ON "safeguarding_case"("tenant_id", "student_id");
CREATE INDEX "safeguarding_case_tenant_id_organization_id_idx" ON "safeguarding_case"("tenant_id", "organization_id");
ALTER TABLE "safeguarding_case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_case" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safeguarding_case"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "learner_support_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "academic_accommodations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "medical_accommodations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "behaviour_interventions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "inclusion_strategies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "goals" JSONB NOT NULL DEFAULT '[]',
    "review_schedule" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learner_support_plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "learner_support_plan_tenant_id_student_id_key" ON "learner_support_plan"("tenant_id", "student_id");
CREATE INDEX "learner_support_plan_tenant_id_idx" ON "learner_support_plan"("tenant_id");
CREATE INDEX "learner_support_plan_tenant_id_organization_id_idx" ON "learner_support_plan"("tenant_id", "organization_id");
ALTER TABLE "learner_support_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learner_support_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learner_support_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "intervention_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "early_warning_triggers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "interventions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "intervention_plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "intervention_plan_tenant_id_student_id_key" ON "intervention_plan"("tenant_id", "student_id");
CREATE INDEX "intervention_plan_tenant_id_idx" ON "intervention_plan"("tenant_id");
CREATE INDEX "intervention_plan_tenant_id_organization_id_idx" ON "intervention_plan"("tenant_id", "organization_id");
ALTER TABLE "intervention_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "intervention_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
