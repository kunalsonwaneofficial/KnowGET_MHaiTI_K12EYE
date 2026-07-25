-- Enterprise Academic Scheduling & Resource Orchestration Platform (P2-D07). Six
-- tenant-owned tables: the timetable, schedule slot, resource, allocation, scheduling
-- policy and substitution. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with
-- the standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset
-- tenant). Structured data (revisions, availability windows, policy parameters) is stored as
-- non-null JSONB with an empty default, matching the Prisma schema.

-- ---------------------------------------------------------------------------------
CREATE TABLE "timetable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "term" TEXT,
    "grade_id" UUID NOT NULL,
    "class_id" UUID,
    "section_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "timetable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "timetable_tenant_id_organization_id_code_key" ON "timetable"("tenant_id", "organization_id", "code");
CREATE INDEX "timetable_tenant_id_idx" ON "timetable"("tenant_id");
CREATE INDEX "timetable_tenant_id_organization_id_idx" ON "timetable"("tenant_id", "organization_id");
ALTER TABLE "timetable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "timetable"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "schedule_slot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "timetable_id" UUID NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID,
    "section_id" UUID NOT NULL,
    "venue_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "schedule_slot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schedule_slot_tenant_id_timetable_id_day_of_week_starts_at_section_id_key" ON "schedule_slot"("tenant_id", "timetable_id", "day_of_week", "starts_at", "section_id");
CREATE INDEX "schedule_slot_tenant_id_idx" ON "schedule_slot"("tenant_id");
CREATE INDEX "schedule_slot_tenant_id_timetable_id_idx" ON "schedule_slot"("tenant_id", "timetable_id");
ALTER TABLE "schedule_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "schedule_slot"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "resource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "availability_windows" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "resource_tenant_id_organization_id_code_key" ON "resource"("tenant_id", "organization_id", "code");
CREATE INDEX "resource_tenant_id_idx" ON "resource"("tenant_id");
CREATE INDEX "resource_tenant_id_organization_id_idx" ON "resource"("tenant_id", "organization_id");
ALTER TABLE "resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "resource"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "resource_kind" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "schedule_slot_id" UUID,
    "section_id" UUID,
    "day_of_week" TEXT NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "occupancy" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'allocated',
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "allocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "allocation_tenant_id_idx" ON "allocation"("tenant_id");
CREATE INDEX "allocation_tenant_id_organization_id_idx" ON "allocation"("tenant_id", "organization_id");
CREATE INDEX "allocation_tenant_id_resource_id_idx" ON "allocation"("tenant_id", "resource_id");
CREATE INDEX "allocation_tenant_id_schedule_slot_id_idx" ON "allocation"("tenant_id", "schedule_slot_id");
ALTER TABLE "allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "allocation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "scheduling_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "scheduling_policy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scheduling_policy_tenant_id_organization_id_code_key" ON "scheduling_policy"("tenant_id", "organization_id", "code");
CREATE INDEX "scheduling_policy_tenant_id_idx" ON "scheduling_policy"("tenant_id");
CREATE INDEX "scheduling_policy_tenant_id_organization_id_idx" ON "scheduling_policy"("tenant_id", "organization_id");
ALTER TABLE "scheduling_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scheduling_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "scheduling_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "substitution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "schedule_slot_id" UUID NOT NULL,
    "substitution_type" TEXT NOT NULL,
    "original_id" UUID NOT NULL,
    "replacement_id" UUID NOT NULL,
    "reason" TEXT,
    "date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "substitution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "substitution_tenant_id_idx" ON "substitution"("tenant_id");
CREATE INDEX "substitution_tenant_id_organization_id_idx" ON "substitution"("tenant_id", "organization_id");
CREATE INDEX "substitution_tenant_id_schedule_slot_id_idx" ON "substitution"("tenant_id", "schedule_slot_id");
ALTER TABLE "substitution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "substitution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "substitution"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
