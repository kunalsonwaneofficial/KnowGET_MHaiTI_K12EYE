-- Assessment & Evaluation Platform (P2-D10). Seven tenant-owned tables: the assessment framework,
-- assessment plan, assessment, question bank, evaluation, competency profile and academic record.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation
-- policy (both USING and WITH CHECK, fail-closed on an unset tenant). Structured data (grade bands,
-- weightage/promotion rules, planned assessments, outcome/competency id lists, rubric, questions,
-- rubric scores, evaluation history, competency masteries, growth trajectory, grade entries and the
-- amendment log) is stored as non-null JSONB matching the Prisma schema; marks/percentage/GPA are
-- DOUBLE PRECISION. Uniqueness mirrors the domain: (organization, code) for framework and question
-- bank, (assessment, student) for evaluation, (student) for competency profile and
-- (student, academic year, term) for academic record — all scoped by tenant.

-- ---------------------------------------------------------------------------------
CREATE TABLE "assessment_framework" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assessment_model" TEXT NOT NULL,
    "weightage_rules" JSONB NOT NULL DEFAULT '{}',
    "grade_bands" JSONB NOT NULL DEFAULT '[]',
    "competency_model" JSONB NOT NULL DEFAULT '[]',
    "promotion_criteria" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "assessment_framework_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assessment_framework_tenant_id_organization_id_code_key" ON "assessment_framework"("tenant_id", "organization_id", "code");
CREATE INDEX "assessment_framework_tenant_id_idx" ON "assessment_framework"("tenant_id");
CREATE INDEX "assessment_framework_tenant_id_organization_id_idx" ON "assessment_framework"("tenant_id", "organization_id");
ALTER TABLE "assessment_framework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_framework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assessment_framework"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "assessment_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "academic_year" TEXT,
    "term" TEXT,
    "subject_id" UUID,
    "grade_id" UUID,
    "planned_assessments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "assessment_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assessment_plan_tenant_id_idx" ON "assessment_plan"("tenant_id");
CREATE INDEX "assessment_plan_tenant_id_organization_id_idx" ON "assessment_plan"("tenant_id", "organization_id");
CREATE INDEX "assessment_plan_tenant_id_subject_id_idx" ON "assessment_plan"("tenant_id", "subject_id");
ALTER TABLE "assessment_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assessment_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "framework_id" UUID,
    "plan_id" UUID,
    "assessment_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "learning_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "maximum_marks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rubric" JSONB NOT NULL DEFAULT '[]',
    "evaluation_strategy" TEXT NOT NULL DEFAULT 'manual',
    "delivery_mode" TEXT NOT NULL DEFAULT 'offline',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assessment_tenant_id_idx" ON "assessment"("tenant_id");
CREATE INDEX "assessment_tenant_id_organization_id_idx" ON "assessment"("tenant_id", "organization_id");
CREATE INDEX "assessment_tenant_id_subject_id_idx" ON "assessment"("tenant_id", "subject_id");
ALTER TABLE "assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assessment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "question_bank" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject_id" UUID,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "question_bank_tenant_id_organization_id_code_key" ON "question_bank"("tenant_id", "organization_id", "code");
CREATE INDEX "question_bank_tenant_id_idx" ON "question_bank"("tenant_id");
CREATE INDEX "question_bank_tenant_id_organization_id_idx" ON "question_bank"("tenant_id", "organization_id");
CREATE INDEX "question_bank_tenant_id_subject_id_idx" ON "question_bank"("tenant_id", "subject_id");
ALTER TABLE "question_bank" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_bank" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "question_bank"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "evaluation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "evaluation_type" TEXT NOT NULL DEFAULT 'manual',
    "maximum_marks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marks_awarded" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "rubric_scores" JSONB NOT NULL DEFAULT '[]',
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "evaluation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "evaluation_tenant_id_assessment_id_student_id_key" ON "evaluation"("tenant_id", "assessment_id", "student_id");
CREATE INDEX "evaluation_tenant_id_idx" ON "evaluation"("tenant_id");
CREATE INDEX "evaluation_tenant_id_organization_id_idx" ON "evaluation"("tenant_id", "organization_id");
CREATE INDEX "evaluation_tenant_id_assessment_id_idx" ON "evaluation"("tenant_id", "assessment_id");
CREATE INDEX "evaluation_tenant_id_student_id_idx" ON "evaluation"("tenant_id", "student_id");
ALTER TABLE "evaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evaluation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "evaluation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "competency_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "trajectory" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "competency_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "competency_profile_tenant_id_student_id_key" ON "competency_profile"("tenant_id", "student_id");
CREATE INDEX "competency_profile_tenant_id_idx" ON "competency_profile"("tenant_id");
CREATE INDEX "competency_profile_tenant_id_organization_id_idx" ON "competency_profile"("tenant_id", "organization_id");
ALTER TABLE "competency_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competency_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "competency_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "academic_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "grade_entries" JSONB NOT NULL DEFAULT '[]',
    "gpa" DOUBLE PRECISION,
    "total_credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promotion_decision" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "amendments" JSONB NOT NULL DEFAULT '[]',
    "published_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "academic_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_record_tenant_id_student_id_academic_year_term_key" ON "academic_record"("tenant_id", "student_id", "academic_year", "term");
CREATE INDEX "academic_record_tenant_id_idx" ON "academic_record"("tenant_id");
CREATE INDEX "academic_record_tenant_id_organization_id_idx" ON "academic_record"("tenant_id", "organization_id");
CREATE INDEX "academic_record_tenant_id_student_id_idx" ON "academic_record"("tenant_id", "student_id");
ALTER TABLE "academic_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "academic_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
