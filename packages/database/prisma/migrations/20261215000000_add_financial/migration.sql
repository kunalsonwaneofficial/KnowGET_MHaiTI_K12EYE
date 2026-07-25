-- Fees, Finance & Payroll Platform (P2-D14). Eight tenant-owned tables: financial_period,
-- fee_structure, invoice, payment, concession, payroll_run, payslip and student_financial_account.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy
-- (both USING and WITH CHECK, fail-closed on an unset tenant). Money is engineered as integer minor
-- units: scalar amounts (invoice paid, payment amount, concession fixed amount, account totals) are
-- BIGINT; amounts embedded in structured data (a fee structure's components, an invoice's lines, a
-- payslip's earnings/deductions) live inside non-null JSONB matching the Prisma schema. Counts and
-- versions are INTEGER; a concession percentage is DOUBLE PRECISION; date-only and ISO-timestamp
-- domain values (start/end/due/received dates; closed/issued/cleared/refunded/processed/paid/refreshed
-- stamps) are TEXT. Uniqueness mirrors the domain: period code and fee-structure code and invoice
-- number per tenant, one payslip per (run, employee), one account per student — all tenant-scoped.
-- Students (P2-D03) and employees (P2-D12) are referenced by id, not duplicated here.

-- ---------------------------------------------------------------------------------
CREATE TABLE "financial_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "financial_period_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_period_tenant_id_code_key" ON "financial_period"("tenant_id", "code");
CREATE INDEX "financial_period_tenant_id_idx" ON "financial_period"("tenant_id");
CREATE INDEX "financial_period_tenant_id_organization_id_idx" ON "financial_period"("tenant_id", "organization_id");
ALTER TABLE "financial_period" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_period" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_period"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "fee_structure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academic_year" TEXT,
    "currency" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fee_structure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fee_structure_tenant_id_code_key" ON "fee_structure"("tenant_id", "code");
CREATE INDEX "fee_structure_tenant_id_idx" ON "fee_structure"("tenant_id");
CREATE INDEX "fee_structure_tenant_id_organization_id_idx" ON "fee_structure"("tenant_id", "organization_id");
ALTER TABLE "fee_structure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structure" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "fee_structure"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID,
    "number" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "amount_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "due_date" TEXT NOT NULL,
    "notes" TEXT,
    "issued_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoice_tenant_id_number_key" ON "invoice"("tenant_id", "number");
CREATE INDEX "invoice_tenant_id_idx" ON "invoice"("tenant_id");
CREATE INDEX "invoice_tenant_id_organization_id_idx" ON "invoice"("tenant_id", "organization_id");
CREATE INDEX "invoice_tenant_id_student_id_idx" ON "invoice"("tenant_id", "student_id");
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invoice"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "received_at" TEXT NOT NULL,
    "cleared_at" TEXT,
    "refunded_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_tenant_id_idx" ON "payment"("tenant_id");
CREATE INDEX "payment_tenant_id_invoice_id_idx" ON "payment"("tenant_id", "invoice_id");
CREATE INDEX "payment_tenant_id_student_id_idx" ON "payment"("tenant_id", "student_id");
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "payment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "concession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID,
    "type" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION,
    "amount_minor" BIGINT,
    "currency" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "concession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "concession_tenant_id_idx" ON "concession"("tenant_id");
CREATE INDEX "concession_tenant_id_organization_id_idx" ON "concession"("tenant_id", "organization_id");
CREATE INDEX "concession_tenant_id_student_id_idx" ON "concession"("tenant_id", "student_id");
ALTER TABLE "concession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "concession"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "payroll_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_id" UUID,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "processed_at" TEXT,
    "paid_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payroll_run_tenant_id_idx" ON "payroll_run"("tenant_id");
CREATE INDEX "payroll_run_tenant_id_organization_id_idx" ON "payroll_run"("tenant_id", "organization_id");
ALTER TABLE "payroll_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "payroll_run"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "payslip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "earnings" JSONB NOT NULL DEFAULT '[]',
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payslip_tenant_id_payroll_run_id_employee_id_key" ON "payslip"("tenant_id", "payroll_run_id", "employee_id");
CREATE INDEX "payslip_tenant_id_idx" ON "payslip"("tenant_id");
CREATE INDEX "payslip_tenant_id_payroll_run_id_idx" ON "payslip"("tenant_id", "payroll_run_id");
CREATE INDEX "payslip_tenant_id_employee_id_idx" ON "payslip"("tenant_id", "employee_id");
ALTER TABLE "payslip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payslip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "payslip"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_financial_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "total_billed_minor" BIGINT NOT NULL DEFAULT 0,
    "total_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "outstanding_minor" BIGINT NOT NULL DEFAULT 0,
    "overdue_minor" BIGINT NOT NULL DEFAULT 0,
    "charge_count" INTEGER NOT NULL DEFAULT 0,
    "standing" TEXT NOT NULL DEFAULT 'settled',
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_financial_account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_financial_account_tenant_id_student_id_key" ON "student_financial_account"("tenant_id", "student_id");
CREATE INDEX "student_financial_account_tenant_id_idx" ON "student_financial_account"("tenant_id");
CREATE INDEX "student_financial_account_tenant_id_organization_id_idx" ON "student_financial_account"("tenant_id", "organization_id");
ALTER TABLE "student_financial_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_financial_account" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_financial_account"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
