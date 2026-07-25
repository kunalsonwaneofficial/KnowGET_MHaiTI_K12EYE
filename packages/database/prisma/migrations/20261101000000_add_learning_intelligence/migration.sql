-- Learning Intelligence & Educational Insights Platform (P2-D11). Seven tenant-owned tables: the
-- learner insight profile, learning signal, early warning, educational insight, recommendation,
-- growth plan and cohort insight. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with
-- the standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant).
-- Structured data (dimension scores, evidence chains, status histories, goals, member/recommendation
-- id lists, band distribution) is stored as non-null JSONB matching the Prisma schema; scores and
-- percentages are DOUBLE PRECISION. Uniqueness mirrors the domain: one profile per (student) and one
-- cohort insight per (scope type, scope id), both tenant-scoped. This domain synthesizes the upstream
-- academic domains' descriptive indicators — it stores references (evidence), not their records.

-- ---------------------------------------------------------------------------------
CREATE TABLE "learner_insight_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overall_band" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "signals_considered" INTEGER NOT NULL DEFAULT 0,
    "dimensions_covered" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'insufficient_data',
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_synthesized_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learner_insight_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "learner_insight_profile_tenant_id_student_id_key" ON "learner_insight_profile"("tenant_id", "student_id");
CREATE INDEX "learner_insight_profile_tenant_id_idx" ON "learner_insight_profile"("tenant_id");
CREATE INDEX "learner_insight_profile_tenant_id_organization_id_idx" ON "learner_insight_profile"("tenant_id", "organization_id");
ALTER TABLE "learner_insight_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learner_insight_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learner_insight_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "learning_signal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "observed_at" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learning_signal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_signal_tenant_id_idx" ON "learning_signal"("tenant_id");
CREATE INDEX "learning_signal_tenant_id_organization_id_idx" ON "learning_signal"("tenant_id", "organization_id");
CREATE INDEX "learning_signal_tenant_id_student_id_idx" ON "learning_signal"("tenant_id", "student_id");
ALTER TABLE "learning_signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_signal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learning_signal"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "early_warning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "observed_score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'raised',
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "early_warning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "early_warning_tenant_id_idx" ON "early_warning"("tenant_id");
CREATE INDEX "early_warning_tenant_id_organization_id_idx" ON "early_warning"("tenant_id", "organization_id");
CREATE INDEX "early_warning_tenant_id_student_id_idx" ON "early_warning"("tenant_id", "student_id");
ALTER TABLE "early_warning" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "early_warning" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "early_warning"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "educational_insight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "dimension" TEXT,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "educational_insight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "educational_insight_tenant_id_idx" ON "educational_insight"("tenant_id");
CREATE INDEX "educational_insight_tenant_id_organization_id_idx" ON "educational_insight"("tenant_id", "organization_id");
CREATE INDEX "educational_insight_tenant_id_student_id_idx" ON "educational_insight"("tenant_id", "student_id");
ALTER TABLE "educational_insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "educational_insight" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "educational_insight"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "target_dimension" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "decided_by" UUID,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "recommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recommendation_tenant_id_idx" ON "recommendation"("tenant_id");
CREATE INDEX "recommendation_tenant_id_organization_id_idx" ON "recommendation"("tenant_id", "organization_id");
CREATE INDEX "recommendation_tenant_id_student_id_idx" ON "recommendation"("tenant_id", "student_id");
ALTER TABLE "recommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "recommendation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "growth_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "focus_dimension" TEXT,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "source_recommendation_ids" JSONB NOT NULL DEFAULT '[]',
    "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "growth_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "growth_plan_tenant_id_idx" ON "growth_plan"("tenant_id");
CREATE INDEX "growth_plan_tenant_id_organization_id_idx" ON "growth_plan"("tenant_id", "organization_id");
CREATE INDEX "growth_plan_tenant_id_student_id_idx" ON "growth_plan"("tenant_id", "student_id");
ALTER TABLE "growth_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "growth_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "cohort_insight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "member_student_ids" JSONB NOT NULL DEFAULT '[]',
    "learners_considered" INTEGER NOT NULL DEFAULT 0,
    "average_learning_health" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "average_band" TEXT NOT NULL,
    "band_distribution" JSONB NOT NULL DEFAULT '{}',
    "learners_needing_attention" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "cohort_insight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cohort_insight_tenant_id_scope_type_scope_id_key" ON "cohort_insight"("tenant_id", "scope_type", "scope_id");
CREATE INDEX "cohort_insight_tenant_id_idx" ON "cohort_insight"("tenant_id");
CREATE INDEX "cohort_insight_tenant_id_organization_id_idx" ON "cohort_insight"("tenant_id", "organization_id");
ALTER TABLE "cohort_insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cohort_insight" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cohort_insight"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
