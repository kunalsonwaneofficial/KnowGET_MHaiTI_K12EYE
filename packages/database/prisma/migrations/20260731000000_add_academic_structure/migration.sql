-- Academic Structure & Curriculum Platform (P2-D06). Eight tenant-owned tables: the
-- academic calendar, program, curriculum framework, grade, class, section, subject and
-- learning outcome. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset
-- tenant). Scalar-list columns are non-null with an empty-array default, matching the
-- Prisma schema and the platform convention.

-- ---------------------------------------------------------------------------------
CREATE TABLE "academic_calendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "terms" JSONB NOT NULL DEFAULT '[]',
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "examination_periods" JSONB NOT NULL DEFAULT '[]',
    "special_events" JSONB NOT NULL DEFAULT '[]',
    "working_days" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "academic_calendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_calendar_tenant_id_organization_id_academic_year_key" ON "academic_calendar"("tenant_id", "organization_id", "academic_year");
CREATE INDEX "academic_calendar_tenant_id_idx" ON "academic_calendar"("tenant_id");
CREATE INDEX "academic_calendar_tenant_id_organization_id_idx" ON "academic_calendar"("tenant_id", "organization_id");
ALTER TABLE "academic_calendar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_calendar" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "academic_calendar"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "academic_program" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "academic_program_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_program_tenant_id_organization_id_code_key" ON "academic_program"("tenant_id", "organization_id", "code");
CREATE INDEX "academic_program_tenant_id_idx" ON "academic_program"("tenant_id");
CREATE INDEX "academic_program_tenant_id_organization_id_idx" ON "academic_program"("tenant_id", "organization_id");
ALTER TABLE "academic_program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_program" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "academic_program"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "curriculum_framework" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "learning_philosophy" TEXT,
    "competency_model" TEXT,
    "assessment_philosophy" TEXT,
    "subject_framework" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "curriculum_framework_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "curriculum_framework_tenant_id_organization_id_code_key" ON "curriculum_framework"("tenant_id", "organization_id", "code");
CREATE INDEX "curriculum_framework_tenant_id_idx" ON "curriculum_framework"("tenant_id");
CREATE INDEX "curriculum_framework_tenant_id_organization_id_idx" ON "curriculum_framework"("tenant_id", "organization_id");
ALTER TABLE "curriculum_framework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_framework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "curriculum_framework"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "grade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "next_grade_id" UUID,
    "promotion_rule" TEXT,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "grade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grade_tenant_id_program_id_code_key" ON "grade"("tenant_id", "program_id", "code");
CREATE INDEX "grade_tenant_id_idx" ON "grade"("tenant_id");
CREATE INDEX "grade_tenant_id_organization_id_idx" ON "grade"("tenant_id", "organization_id");
CREATE INDEX "grade_tenant_id_program_id_idx" ON "grade"("tenant_id", "program_id");
ALTER TABLE "grade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "grade"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "academic_class" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "curriculum_framework_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "academic_class_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_class_tenant_id_grade_id_academic_year_name_key" ON "academic_class"("tenant_id", "grade_id", "academic_year", "name");
CREATE INDEX "academic_class_tenant_id_idx" ON "academic_class"("tenant_id");
CREATE INDEX "academic_class_tenant_id_organization_id_idx" ON "academic_class"("tenant_id", "organization_id");
CREATE INDEX "academic_class_tenant_id_grade_id_idx" ON "academic_class"("tenant_id", "grade_id");
ALTER TABLE "academic_class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "academic_class"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "section" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "section_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "section_tenant_id_class_id_name_key" ON "section"("tenant_id", "class_id", "name");
CREATE INDEX "section_tenant_id_idx" ON "section"("tenant_id");
CREATE INDEX "section_tenant_id_organization_id_idx" ON "section"("tenant_id", "organization_id");
CREATE INDEX "section_tenant_id_class_id_idx" ON "section"("tenant_id", "class_id");
ALTER TABLE "section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "section" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "section"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "subject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credits" DOUBLE PRECISION,
    "elective_group" TEXT,
    "cross_disciplinary" BOOLEAN NOT NULL DEFAULT false,
    "prerequisites" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subject_tenant_id_organization_id_code_key" ON "subject"("tenant_id", "organization_id", "code");
CREATE INDEX "subject_tenant_id_idx" ON "subject"("tenant_id");
CREATE INDEX "subject_tenant_id_organization_id_idx" ON "subject"("tenant_id", "organization_id");
ALTER TABLE "subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "subject"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "learning_outcome" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "bloom_level" TEXT,
    "competencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "curriculum_framework_id" UUID,
    "assessment_alignment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learning_outcome_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "learning_outcome_tenant_id_subject_id_code_key" ON "learning_outcome"("tenant_id", "subject_id", "code");
CREATE INDEX "learning_outcome_tenant_id_idx" ON "learning_outcome"("tenant_id");
CREATE INDEX "learning_outcome_tenant_id_organization_id_idx" ON "learning_outcome"("tenant_id", "organization_id");
CREATE INDEX "learning_outcome_tenant_id_subject_id_idx" ON "learning_outcome"("tenant_id", "subject_id");
ALTER TABLE "learning_outcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_outcome" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learning_outcome"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
