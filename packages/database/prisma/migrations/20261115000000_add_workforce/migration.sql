-- Workforce & Human Capital Platform (P2-D12). Eight tenant-owned tables: department, position,
-- employee, employment_contract, leave_entitlement, leave_request, performance_review and
-- workforce_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). Compensation
-- amounts are deliberately NOT modelled — a contract/position carries only the pay grade/band label
-- (money lives in the Financial platform, P2-D14). Date-only values (hire/exit, term and leave dates,
-- last-refreshed) are TEXT; day counts, rates and ratings are DOUBLE PRECISION; tenure/headcount/
-- version are INTEGER. The workforce profile is a descriptive snapshot refreshed by a pure engine —
-- never a prediction (P2-D28). Uniqueness mirrors the domain: department/position code per tenant,
-- employee number per tenant, one contract per (employee, version), one entitlement per
-- (employee, leave type, period), and one profile per employee — all tenant-scoped.

-- ---------------------------------------------------------------------------------
CREATE TABLE "department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_department_id" UUID,
    "head_employee_id" UUID,
    "cost_center" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "department_tenant_id_code_key" ON "department"("tenant_id", "code");
CREATE INDEX "department_tenant_id_idx" ON "department"("tenant_id");
CREATE INDEX "department_tenant_id_organization_id_idx" ON "department"("tenant_id", "organization_id");
CREATE INDEX "department_tenant_id_parent_department_id_idx" ON "department"("tenant_id", "parent_department_id");
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "department"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employment_type" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "grade" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "position_tenant_id_code_key" ON "position"("tenant_id", "code");
CREATE INDEX "position_tenant_id_idx" ON "position"("tenant_id");
CREATE INDEX "position_tenant_id_organization_id_idx" ON "position"("tenant_id", "organization_id");
CREATE INDEX "position_tenant_id_department_id_idx" ON "position"("tenant_id", "department_id");
ALTER TABLE "position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "position" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "position"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "employee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "employee_number" TEXT NOT NULL,
    "department_id" UUID,
    "position_id" UUID,
    "employment_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "hire_date" TEXT NOT NULL,
    "exit_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employee_tenant_id_employee_number_key" ON "employee"("tenant_id", "employee_number");
CREATE INDEX "employee_tenant_id_idx" ON "employee"("tenant_id");
CREATE INDEX "employee_tenant_id_organization_id_idx" ON "employee"("tenant_id", "organization_id");
CREATE INDEX "employee_tenant_id_person_id_idx" ON "employee"("tenant_id", "person_id");
CREATE INDEX "employee_tenant_id_department_id_idx" ON "employee"("tenant_id", "department_id");
ALTER TABLE "employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "employee"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "employment_contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "employment_type" TEXT NOT NULL,
    "grade" TEXT,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supersedes_contract_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "employment_contract_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employment_contract_tenant_id_employee_id_version_key" ON "employment_contract"("tenant_id", "employee_id", "version");
CREATE INDEX "employment_contract_tenant_id_idx" ON "employment_contract"("tenant_id");
CREATE INDEX "employment_contract_tenant_id_employee_id_idx" ON "employment_contract"("tenant_id", "employee_id");
ALTER TABLE "employment_contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employment_contract" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "employment_contract"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "leave_entitlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "entitled_days" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "leave_entitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_entitlement_tenant_id_employee_id_leave_type_period_key" ON "leave_entitlement"("tenant_id", "employee_id", "leave_type", "period");
CREATE INDEX "leave_entitlement_tenant_id_idx" ON "leave_entitlement"("tenant_id");
CREATE INDEX "leave_entitlement_tenant_id_employee_id_idx" ON "leave_entitlement"("tenant_id", "employee_id");
ALTER TABLE "leave_entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_entitlement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leave_entitlement"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "decided_by" UUID,
    "decided_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_request_tenant_id_idx" ON "leave_request"("tenant_id");
CREATE INDEX "leave_request_tenant_id_employee_id_idx" ON "leave_request"("tenant_id", "employee_id");
ALTER TABLE "leave_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leave_request"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "performance_review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "period" TEXT NOT NULL,
    "overall_rating" DOUBLE PRECISION,
    "summary" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "performance_review_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "performance_review_tenant_id_idx" ON "performance_review"("tenant_id");
CREATE INDEX "performance_review_tenant_id_employee_id_idx" ON "performance_review"("tenant_id", "employee_id");
ALTER TABLE "performance_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_review" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "performance_review"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "workforce_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "tenure_months" INTEGER NOT NULL DEFAULT 0,
    "employment_status" TEXT NOT NULL,
    "leave_utilization_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviews_finalized" INTEGER NOT NULL DEFAULT 0,
    "average_review_rating" DOUBLE PRECISION,
    "attrition_risk_band" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'insufficient_data',
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "workforce_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workforce_profile_tenant_id_employee_id_key" ON "workforce_profile"("tenant_id", "employee_id");
CREATE INDEX "workforce_profile_tenant_id_idx" ON "workforce_profile"("tenant_id");
CREATE INDEX "workforce_profile_tenant_id_organization_id_idx" ON "workforce_profile"("tenant_id", "organization_id");
ALTER TABLE "workforce_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workforce_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "workforce_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
