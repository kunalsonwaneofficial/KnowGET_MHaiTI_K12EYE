-- Integrated Health Centre & Clinical Services Platform (P2-D19). Eight tenant-owned tables: health_centre,
-- clinician, appointment, clinical_encounter, prescription, sick_bay_admission, referral and centre_profile.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy
-- (both USING and WITH CHECK, fail-closed on an unset tenant). This domain carries NO money (clinical
-- services are not billed here — Finance P2-D14; medical-supply cost is Procurement/Assets P2-D15): sick-bay
-- capacity, dose regimens/counts, occupancy figures, percents, workload counts and versions are INTEGER;
-- over-capacity is BOOLEAN; every date-only and ISO-stamp domain value (scheduled/admitted/discharged/
-- start/raised/refreshed stamps) is TEXT. There is no JSONB — this domain has no list-valued fields.
-- Sick-bay occupancy and a prescription's due/overdue doses are always DERIVED by the pure engines, never
-- stored. The standing health record (history, allergies, chronic conditions, immunization history,
-- standing medications, alerts) belongs to Learner Wellbeing (P2-D05); this domain holds the operational
-- clinical services. Uniqueness mirrors the domain: centre code per tenant, one clinician per employee, one
-- profile per centre — all tenant-scoped. The status-scoped uniques (one active admission per bed; one
-- active per patient) are service-enforced (TD-39). Organizations (P2-D01-M01), persons (P2-D01-M02, the
-- patients) and employees (P2-D12, the clinicians) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "health_centre" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sick_bay_capacity" INTEGER NOT NULL DEFAULT 0,
    "lead_clinician_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "health_centre_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "health_centre_tenant_id_code_key" ON "health_centre"("tenant_id", "code");
CREATE INDEX "health_centre_tenant_id_idx" ON "health_centre"("tenant_id");
CREATE INDEX "health_centre_tenant_id_organization_id_idx" ON "health_centre"("tenant_id", "organization_id");
ALTER TABLE "health_centre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_centre" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "health_centre"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "clinician" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "registration_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "clinician_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinician_tenant_id_employee_id_key" ON "clinician"("tenant_id", "employee_id");
CREATE INDEX "clinician_tenant_id_idx" ON "clinician"("tenant_id");
CREATE INDEX "clinician_tenant_id_organization_id_idx" ON "clinician"("tenant_id", "organization_id");
ALTER TABLE "clinician" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinician" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinician"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "appointment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "clinician_id" UUID,
    "scheduled_for" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointment_tenant_id_idx" ON "appointment"("tenant_id");
CREATE INDEX "appointment_tenant_id_centre_id_idx" ON "appointment"("tenant_id", "centre_id");
CREATE INDEX "appointment_tenant_id_patient_id_idx" ON "appointment"("tenant_id", "patient_id");
CREATE INDEX "appointment_tenant_id_organization_id_idx" ON "appointment"("tenant_id", "organization_id");
ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "appointment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "clinical_encounter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "clinician_id" UUID,
    "triage_acuity" TEXT NOT NULL,
    "chief_complaint" TEXT,
    "assessment" TEXT,
    "disposition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "clinical_encounter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinical_encounter_tenant_id_idx" ON "clinical_encounter"("tenant_id");
CREATE INDEX "clinical_encounter_tenant_id_centre_id_idx" ON "clinical_encounter"("tenant_id", "centre_id");
CREATE INDEX "clinical_encounter_tenant_id_patient_id_idx" ON "clinical_encounter"("tenant_id", "patient_id");
CREATE INDEX "clinical_encounter_tenant_id_organization_id_idx" ON "clinical_encounter"("tenant_id", "organization_id");
ALTER TABLE "clinical_encounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_encounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinical_encounter"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "prescription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "clinician_id" UUID NOT NULL,
    "medication" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency_per_day" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "doses_administered" INTEGER NOT NULL DEFAULT 0,
    "start_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "prescription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prescription_tenant_id_idx" ON "prescription"("tenant_id");
CREATE INDEX "prescription_tenant_id_centre_id_idx" ON "prescription"("tenant_id", "centre_id");
CREATE INDEX "prescription_tenant_id_patient_id_idx" ON "prescription"("tenant_id", "patient_id");
CREATE INDEX "prescription_tenant_id_organization_id_idx" ON "prescription"("tenant_id", "organization_id");
ALTER TABLE "prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "prescription"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "sick_bay_admission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "bed_label" TEXT NOT NULL,
    "admitted_on" TEXT NOT NULL,
    "reason" TEXT,
    "discharged_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "sick_bay_admission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sick_bay_admission_tenant_id_idx" ON "sick_bay_admission"("tenant_id");
CREATE INDEX "sick_bay_admission_tenant_id_centre_id_idx" ON "sick_bay_admission"("tenant_id", "centre_id");
CREATE INDEX "sick_bay_admission_tenant_id_patient_id_idx" ON "sick_bay_admission"("tenant_id", "patient_id");
CREATE INDEX "sick_bay_admission_tenant_id_organization_id_idx" ON "sick_bay_admission"("tenant_id", "organization_id");
ALTER TABLE "sick_bay_admission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sick_bay_admission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sick_bay_admission"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "referral" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "clinician_id" UUID,
    "referred_to" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "reason" TEXT,
    "raised_on" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'raised',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "referral_tenant_id_idx" ON "referral"("tenant_id");
CREATE INDEX "referral_tenant_id_centre_id_idx" ON "referral"("tenant_id", "centre_id");
CREATE INDEX "referral_tenant_id_patient_id_idx" ON "referral"("tenant_id", "patient_id");
CREATE INDEX "referral_tenant_id_organization_id_idx" ON "referral"("tenant_id", "organization_id");
ALTER TABLE "referral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referral" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "referral"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "centre_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "centre_id" UUID NOT NULL,
    "centre_code" TEXT NOT NULL,
    "sick_bay_capacity" INTEGER NOT NULL DEFAULT 0,
    "active_admission_count" INTEGER NOT NULL DEFAULT 0,
    "beds_available" INTEGER NOT NULL DEFAULT 0,
    "occupancy_percent" INTEGER NOT NULL DEFAULT 0,
    "over_capacity" BOOLEAN NOT NULL DEFAULT false,
    "open_appointment_count" INTEGER NOT NULL DEFAULT 0,
    "open_encounter_count" INTEGER NOT NULL DEFAULT 0,
    "active_prescription_count" INTEGER NOT NULL DEFAULT 0,
    "overdue_prescription_count" INTEGER NOT NULL DEFAULT 0,
    "open_referral_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "centre_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "centre_profile_tenant_id_centre_id_key" ON "centre_profile"("tenant_id", "centre_id");
CREATE INDEX "centre_profile_tenant_id_idx" ON "centre_profile"("tenant_id");
ALTER TABLE "centre_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "centre_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "centre_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
