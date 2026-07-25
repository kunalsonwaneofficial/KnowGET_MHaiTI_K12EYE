-- Faculty Excellence, Coaching & Professional Growth Platform (P2-D13). Eight tenant-owned tables:
-- competency_framework, observation, coaching_engagement, coaching_session, development_requirement,
-- professional_learning_activity, development_goal and faculty_profile. Every table is tenant-isolated
-- by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both USING and WITH CHECK,
-- fail-closed on an unset tenant). Structured data (a framework's competencies, an observation's
-- competency ratings) is stored as non-null JSONB matching the Prisma schema; hours, rates and ratings
-- are DOUBLE PRECISION; counts and versions are INTEGER; date-only values (observed/shared/
-- acknowledged, session/start/end/completed/target/last-refreshed) are TEXT. This domain is
-- descriptive and explainable — the faculty profile's growth band is never a prediction (P2-D28).
-- Uniqueness mirrors the domain: framework code per tenant, one requirement per (employee, category,
-- period), one profile per employee — all tenant-scoped. Staff (observed, coach, coachee) are
-- Employees (P2-D12), referenced by id, not duplicated here.

-- ---------------------------------------------------------------------------------
CREATE TABLE "competency_framework" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "competency_framework_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "competency_framework_tenant_id_code_key" ON "competency_framework"("tenant_id", "code");
CREATE INDEX "competency_framework_tenant_id_idx" ON "competency_framework"("tenant_id");
CREATE INDEX "competency_framework_tenant_id_organization_id_idx" ON "competency_framework"("tenant_id", "organization_id");
ALTER TABLE "competency_framework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competency_framework" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "competency_framework"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "framework_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "observer_id" UUID NOT NULL,
    "observation_type" TEXT NOT NULL,
    "observed_on" TEXT NOT NULL,
    "context" TEXT,
    "ratings" JSONB NOT NULL DEFAULT '[]',
    "overall_rating" DOUBLE PRECISION,
    "strengths" TEXT,
    "growth_areas" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "shared_at" TEXT,
    "acknowledged_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "observation_tenant_id_idx" ON "observation"("tenant_id");
CREATE INDEX "observation_tenant_id_organization_id_idx" ON "observation"("tenant_id", "organization_id");
CREATE INDEX "observation_tenant_id_employee_id_idx" ON "observation"("tenant_id", "employee_id");
CREATE INDEX "observation_tenant_id_observer_id_idx" ON "observation"("tenant_id", "observer_id");
ALTER TABLE "observation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "observation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "observation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "coaching_engagement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "coachee_id" UUID NOT NULL,
    "focus" TEXT NOT NULL,
    "framework_id" UUID,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "coaching_engagement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coaching_engagement_tenant_id_idx" ON "coaching_engagement"("tenant_id");
CREATE INDEX "coaching_engagement_tenant_id_organization_id_idx" ON "coaching_engagement"("tenant_id", "organization_id");
CREATE INDEX "coaching_engagement_tenant_id_coachee_id_idx" ON "coaching_engagement"("tenant_id", "coachee_id");
CREATE INDEX "coaching_engagement_tenant_id_coach_id_idx" ON "coaching_engagement"("tenant_id", "coach_id");
ALTER TABLE "coaching_engagement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coaching_engagement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "coaching_engagement"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "coaching_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "session_date" TEXT NOT NULL,
    "focus" TEXT,
    "notes" TEXT,
    "next_steps" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "coaching_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coaching_session_tenant_id_idx" ON "coaching_session"("tenant_id");
CREATE INDEX "coaching_session_tenant_id_engagement_id_idx" ON "coaching_session"("tenant_id", "engagement_id");
ALTER TABLE "coaching_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coaching_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "coaching_session"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "development_requirement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "required_hours" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "development_requirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "development_requirement_tenant_id_employee_id_category_period_key" ON "development_requirement"("tenant_id", "employee_id", "category", "period");
CREATE INDEX "development_requirement_tenant_id_idx" ON "development_requirement"("tenant_id");
CREATE INDEX "development_requirement_tenant_id_employee_id_idx" ON "development_requirement"("tenant_id", "employee_id");
ALTER TABLE "development_requirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "development_requirement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "development_requirement"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "professional_learning_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "provider" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "period" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "completed_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "professional_learning_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "professional_learning_activity_tenant_id_idx" ON "professional_learning_activity"("tenant_id");
CREATE INDEX "professional_learning_activity_tenant_id_employee_id_idx" ON "professional_learning_activity"("tenant_id", "employee_id");
ALTER TABLE "professional_learning_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professional_learning_activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "professional_learning_activity"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "development_goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "target_competency_key" TEXT,
    "framework_id" UUID,
    "engagement_id" UUID,
    "target_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "development_goal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "development_goal_tenant_id_idx" ON "development_goal"("tenant_id");
CREATE INDEX "development_goal_tenant_id_employee_id_idx" ON "development_goal"("tenant_id", "employee_id");
ALTER TABLE "development_goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "development_goal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "development_goal"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "faculty_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "observations_considered" INTEGER NOT NULL DEFAULT 0,
    "average_observation_rating" DOUBLE PRECISION,
    "competencies_observed" INTEGER NOT NULL DEFAULT 0,
    "goals_total" INTEGER NOT NULL DEFAULT 0,
    "goals_achieved" INTEGER NOT NULL DEFAULT 0,
    "goal_progress_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "development_compliance_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growth_band" TEXT NOT NULL DEFAULT 'emerging',
    "status" TEXT NOT NULL DEFAULT 'insufficient_data',
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "faculty_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "faculty_profile_tenant_id_employee_id_key" ON "faculty_profile"("tenant_id", "employee_id");
CREATE INDEX "faculty_profile_tenant_id_idx" ON "faculty_profile"("tenant_id");
CREATE INDEX "faculty_profile_tenant_id_organization_id_idx" ON "faculty_profile"("tenant_id", "organization_id");
ALTER TABLE "faculty_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "faculty_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "faculty_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
