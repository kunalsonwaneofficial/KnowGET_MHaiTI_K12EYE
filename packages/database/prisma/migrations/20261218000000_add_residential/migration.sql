-- Residential Life, Hostel & Boarding Platform (P2-D17). Eight tenant-owned tables: hostel, warden,
-- room, bed_allocation, outpass, roll_call, hostel_inspection and hostel_occupancy_profile. Every table
-- is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both USING
-- and WITH CHECK, fail-closed on an unset tenant). This domain carries NO money (hostel/mess fees and
-- facility valuation/maintenance are deferred to Finance P2-D14 and the Asset register P2-D15): bed
-- counts, occupancy figures, percents and versions are INTEGER; over-capacity is BOOLEAN; a room's beds,
-- a roll call's roster and its markings are non-null JSONB; date-only and ISO-timestamp domain values
-- (effective, out/return, scheduled, conducted, next-due dates; started/completed/refreshed stamps) are
-- TEXT. Uniqueness mirrors the domain: hostel code, one warden per employee, room number per hostel, one
-- inspection per (hostel, type), one occupancy profile per hostel — all tenant-scoped. The two
-- status-scoped uniques (one active allocation per bed; one active per student) are service-enforced
-- (TD-37). Organizations (P2-D01-M01), employees (P2-D12) and students (P2-D03) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "hostel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "warden_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "hostel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hostel_tenant_id_code_key" ON "hostel"("tenant_id", "code");
CREATE INDEX "hostel_tenant_id_idx" ON "hostel"("tenant_id");
CREATE INDEX "hostel_tenant_id_organization_id_idx" ON "hostel"("tenant_id", "organization_id");
ALTER TABLE "hostel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "hostel"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "warden" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "warden_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warden_tenant_id_employee_id_key" ON "warden"("tenant_id", "employee_id");
CREATE INDEX "warden_tenant_id_idx" ON "warden"("tenant_id");
CREATE INDEX "warden_tenant_id_organization_id_idx" ON "warden"("tenant_id", "organization_id");
ALTER TABLE "warden" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warden" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "warden"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "room" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "room_number" TEXT NOT NULL,
    "floor" INTEGER,
    "type" TEXT NOT NULL,
    "beds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "room_tenant_id_hostel_id_room_number_key" ON "room"("tenant_id", "hostel_id", "room_number");
CREATE INDEX "room_tenant_id_idx" ON "room"("tenant_id");
CREATE INDEX "room_tenant_id_hostel_id_idx" ON "room"("tenant_id", "hostel_id");
CREATE INDEX "room_tenant_id_organization_id_idx" ON "room"("tenant_id", "organization_id");
ALTER TABLE "room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "room"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "bed_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "bed_key" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "bed_allocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bed_allocation_tenant_id_idx" ON "bed_allocation"("tenant_id");
CREATE INDEX "bed_allocation_tenant_id_room_id_idx" ON "bed_allocation"("tenant_id", "room_id");
CREATE INDEX "bed_allocation_tenant_id_student_id_idx" ON "bed_allocation"("tenant_id", "student_id");
CREATE INDEX "bed_allocation_tenant_id_hostel_id_idx" ON "bed_allocation"("tenant_id", "hostel_id");
CREATE INDEX "bed_allocation_tenant_id_organization_id_idx" ON "bed_allocation"("tenant_id", "organization_id");
ALTER TABLE "bed_allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bed_allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "bed_allocation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "outpass" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "expected_out_at" TEXT NOT NULL,
    "expected_in_at" TEXT NOT NULL,
    "actual_out_at" TEXT,
    "actual_in_at" TEXT,
    "approved_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "outpass_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outpass_tenant_id_idx" ON "outpass"("tenant_id");
CREATE INDEX "outpass_tenant_id_student_id_idx" ON "outpass"("tenant_id", "student_id");
CREATE INDEX "outpass_tenant_id_hostel_id_idx" ON "outpass"("tenant_id", "hostel_id");
CREATE INDEX "outpass_tenant_id_organization_id_idx" ON "outpass"("tenant_id", "organization_id");
ALTER TABLE "outpass" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outpass" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "outpass"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "roll_call" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "scheduled_for" TEXT NOT NULL,
    "expected_resident_ids" JSONB NOT NULL DEFAULT '[]',
    "marks" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "started_at" TEXT,
    "completed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "roll_call_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "roll_call_tenant_id_idx" ON "roll_call"("tenant_id");
CREATE INDEX "roll_call_tenant_id_hostel_id_idx" ON "roll_call"("tenant_id", "hostel_id");
CREATE INDEX "roll_call_tenant_id_organization_id_idx" ON "roll_call"("tenant_id", "organization_id");
ALTER TABLE "roll_call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roll_call" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "roll_call"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "hostel_inspection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "conducted_on" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "next_due_on" TEXT NOT NULL,
    "inspector" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "hostel_inspection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hostel_inspection_tenant_id_hostel_id_type_key" ON "hostel_inspection"("tenant_id", "hostel_id", "type");
CREATE INDEX "hostel_inspection_tenant_id_idx" ON "hostel_inspection"("tenant_id");
CREATE INDEX "hostel_inspection_tenant_id_hostel_id_idx" ON "hostel_inspection"("tenant_id", "hostel_id");
CREATE INDEX "hostel_inspection_tenant_id_organization_id_idx" ON "hostel_inspection"("tenant_id", "organization_id");
ALTER TABLE "hostel_inspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_inspection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "hostel_inspection"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "hostel_occupancy_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostel_id" UUID NOT NULL,
    "hostel_code" TEXT NOT NULL,
    "room_count" INTEGER NOT NULL DEFAULT 0,
    "bed_count" INTEGER NOT NULL DEFAULT 0,
    "occupant_count" INTEGER NOT NULL DEFAULT 0,
    "beds_available" INTEGER NOT NULL DEFAULT 0,
    "occupancy_percent" INTEGER NOT NULL DEFAULT 0,
    "over_capacity_room_count" INTEGER NOT NULL DEFAULT 0,
    "over_capacity" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "hostel_occupancy_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hostel_occupancy_profile_tenant_id_hostel_id_key" ON "hostel_occupancy_profile"("tenant_id", "hostel_id");
CREATE INDEX "hostel_occupancy_profile_tenant_id_idx" ON "hostel_occupancy_profile"("tenant_id");
CREATE INDEX "hostel_occupancy_profile_tenant_id_organization_id_idx" ON "hostel_occupancy_profile"("tenant_id", "organization_id");
ALTER TABLE "hostel_occupancy_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hostel_occupancy_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "hostel_occupancy_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
