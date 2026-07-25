-- Teaching, Learning & Instruction Intelligence Platform (P2-D09). Seven tenant-owned tables:
-- the academic plan, unit plan, lesson plan, learning resource, classroom session, assignment
-- and learning evidence. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant).
-- Structured data (objectives, outcome/resource id lists, strategies, activities, revisions,
-- submissions, participation) is stored as non-null JSONB (participation nullable), matching
-- the Prisma schema; estimated instructional time is DOUBLE PRECISION.

-- ---------------------------------------------------------------------------------
CREATE TABLE "academic_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "academic_year" TEXT,
    "term" TEXT,
    "subject_id" UUID,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "from_date" TEXT,
    "to_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "academic_plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_plan_tenant_id_organization_id_code_key" ON "academic_plan"("tenant_id", "organization_id", "code");
CREATE INDEX "academic_plan_tenant_id_idx" ON "academic_plan"("tenant_id");
CREATE INDEX "academic_plan_tenant_id_organization_id_idx" ON "academic_plan"("tenant_id", "organization_id");
ALTER TABLE "academic_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "academic_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "unit_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "academic_plan_id" UUID,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "curriculum_framework_id" UUID,
    "learning_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "estimated_instructional_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assessment_strategy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "unit_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "unit_plan_tenant_id_idx" ON "unit_plan"("tenant_id");
CREATE INDEX "unit_plan_tenant_id_organization_id_idx" ON "unit_plan"("tenant_id", "organization_id");
CREATE INDEX "unit_plan_tenant_id_subject_id_idx" ON "unit_plan"("tenant_id", "subject_id");
ALTER TABLE "unit_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unit_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "unit_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "lesson_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "unit_plan_id" UUID,
    "title" TEXT NOT NULL,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "learning_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "teaching_strategies" JSONB NOT NULL DEFAULT '[]',
    "learning_activities" JSONB NOT NULL DEFAULT '[]',
    "assessment_checkpoints" JSONB NOT NULL DEFAULT '[]',
    "required_resource_ids" JSONB NOT NULL DEFAULT '[]',
    "differentiation_strategies" JSONB NOT NULL DEFAULT '[]',
    "reflection_notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "lesson_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lesson_plan_tenant_id_idx" ON "lesson_plan"("tenant_id");
CREATE INDEX "lesson_plan_tenant_id_organization_id_idx" ON "lesson_plan"("tenant_id", "organization_id");
CREATE INDEX "lesson_plan_tenant_id_subject_id_idx" ON "lesson_plan"("tenant_id", "subject_id");
CREATE INDEX "lesson_plan_tenant_id_unit_plan_id_idx" ON "lesson_plan"("tenant_id", "unit_plan_id");
ALTER TABLE "lesson_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lesson_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "learning_resource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "subject_id" UUID,
    "learning_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learning_resource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_resource_tenant_id_idx" ON "learning_resource"("tenant_id");
CREATE INDEX "learning_resource_tenant_id_organization_id_idx" ON "learning_resource"("tenant_id", "organization_id");
CREATE INDEX "learning_resource_tenant_id_subject_id_idx" ON "learning_resource"("tenant_id", "subject_id");
ALTER TABLE "learning_resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_resource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learning_resource"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "classroom_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "schedule_slot_id" UUID,
    "lesson_plan_id" UUID,
    "section_id" UUID,
    "subject_id" UUID,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "planned_topics" JSONB NOT NULL DEFAULT '[]',
    "actual_topics_covered" JSONB NOT NULL DEFAULT '[]',
    "activities_completed" JSONB NOT NULL DEFAULT '[]',
    "resources_used_ids" JSONB NOT NULL DEFAULT '[]',
    "participation" JSONB,
    "teacher_reflections" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "classroom_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "classroom_session_tenant_id_idx" ON "classroom_session"("tenant_id");
CREATE INDEX "classroom_session_tenant_id_organization_id_idx" ON "classroom_session"("tenant_id", "organization_id");
CREATE INDEX "classroom_session_tenant_id_section_id_idx" ON "classroom_session"("tenant_id", "section_id");
CREATE INDEX "classroom_session_tenant_id_subject_id_idx" ON "classroom_session"("tenant_id", "subject_id");
ALTER TABLE "classroom_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classroom_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "classroom_session"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "section_id" UUID,
    "lesson_plan_id" UUID,
    "title" TEXT NOT NULL,
    "assignment_type" TEXT NOT NULL,
    "instructions" TEXT,
    "assigned_date" TEXT,
    "due_date" TEXT,
    "submission_opens_at" TEXT,
    "submission_closes_at" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assignment_tenant_id_idx" ON "assignment"("tenant_id");
CREATE INDEX "assignment_tenant_id_organization_id_idx" ON "assignment"("tenant_id", "organization_id");
CREATE INDEX "assignment_tenant_id_subject_id_idx" ON "assignment"("tenant_id", "subject_id");
CREATE INDEX "assignment_tenant_id_section_id_idx" ON "assignment"("tenant_id", "section_id");
ALTER TABLE "assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assignment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "learning_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "activity_kind" TEXT NOT NULL,
    "activity_id" UUID NOT NULL,
    "subject_id" UUID,
    "learning_outcome_ids" JSONB NOT NULL DEFAULT '[]',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "captured_at" TEXT NOT NULL,
    "captured_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "learning_evidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_evidence_tenant_id_idx" ON "learning_evidence"("tenant_id");
CREATE INDEX "learning_evidence_tenant_id_organization_id_idx" ON "learning_evidence"("tenant_id", "organization_id");
CREATE INDEX "learning_evidence_tenant_id_student_id_idx" ON "learning_evidence"("tenant_id", "student_id");
CREATE INDEX "learning_evidence_tenant_id_activity_kind_activity_id_idx" ON "learning_evidence"("tenant_id", "activity_kind", "activity_id");
ALTER TABLE "learning_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_evidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "learning_evidence"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
