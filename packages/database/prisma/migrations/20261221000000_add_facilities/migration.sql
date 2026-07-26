-- Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20). Eight tenant-owned tables:
-- building, space, facility_system, sensor, environment_reading, maintenance_order, comfort_policy and
-- facility_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This domain owns the
-- immovable built environment and the smart-environment telemetry; it carries NO money (the movable /
-- capitalized asset register and its costed maintenance are Procurement & Assets P2-D15, and utility billing
-- is Finance P2-D14). Types follow the data: floor/capacity/floors/interval/counts/percents/version are
-- INTEGER; a sensor reading value is FLOAT (a physical measurement); comfort thresholds are JSONB; over-
-- capacity-style flags would be BOOLEAN (none here); every date-only and ISO-stamp domain value
-- (commissioned/last-serviced/recorded/reported/assigned/completed/refreshed stamps) is TEXT. Building
-- condition, campus rollups, a system's service status and a space's comfort band are always DERIVED by the
-- pure engines, never stored (facility_profile is a re-derivable read model). The movable asset register
-- and its costed maintenance belong to P2-D15; this domain holds the built environment and its operational,
-- no-money work queue. Uniqueness mirrors the domain: building code per tenant, space code per building,
-- facility-system code per building, sensor code per tenant, maintenance-order code per tenant, one profile
-- per building — all tenant-scoped. The status-scoped uniques (one active sensor per space+metric; one
-- active comfort policy per organization) are service-enforced (TD-40). Organizations (P2-D01-M01) and
-- employees (P2-D12, the work-order assignees) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "building" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "floors" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "building_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "building_tenant_id_code_key" ON "building"("tenant_id", "code");
CREATE INDEX "building_tenant_id_idx" ON "building"("tenant_id");
CREATE INDEX "building_tenant_id_organization_id_idx" ON "building"("tenant_id", "organization_id");
ALTER TABLE "building" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "building" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "building"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "space" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "space_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "space_tenant_id_building_id_code_key" ON "space"("tenant_id", "building_id", "code");
CREATE INDEX "space_tenant_id_idx" ON "space"("tenant_id");
CREATE INDEX "space_tenant_id_building_id_idx" ON "space"("tenant_id", "building_id");
CREATE INDEX "space_tenant_id_organization_id_idx" ON "space"("tenant_id", "organization_id");
ALTER TABLE "space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "space" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "space"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "facility_system" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "commissioned_on" TEXT NOT NULL,
    "service_interval_days" INTEGER NOT NULL,
    "last_serviced_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'operational',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "facility_system_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "facility_system_tenant_id_building_id_code_key" ON "facility_system"("tenant_id", "building_id", "code");
CREATE INDEX "facility_system_tenant_id_idx" ON "facility_system"("tenant_id");
CREATE INDEX "facility_system_tenant_id_building_id_idx" ON "facility_system"("tenant_id", "building_id");
CREATE INDEX "facility_system_tenant_id_organization_id_idx" ON "facility_system"("tenant_id", "organization_id");
ALTER TABLE "facility_system" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facility_system" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "facility_system"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "sensor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "sensor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sensor_tenant_id_code_key" ON "sensor"("tenant_id", "code");
CREATE INDEX "sensor_tenant_id_idx" ON "sensor"("tenant_id");
CREATE INDEX "sensor_tenant_id_space_id_idx" ON "sensor"("tenant_id", "space_id");
CREATE INDEX "sensor_tenant_id_building_id_idx" ON "sensor"("tenant_id", "building_id");
CREATE INDEX "sensor_tenant_id_organization_id_idx" ON "sensor"("tenant_id", "organization_id");
ALTER TABLE "sensor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sensor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sensor"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "environment_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "sensor_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "recorded_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "environment_reading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "environment_reading_tenant_id_idx" ON "environment_reading"("tenant_id");
CREATE INDEX "environment_reading_tenant_id_space_id_idx" ON "environment_reading"("tenant_id", "space_id");
CREATE INDEX "environment_reading_tenant_id_sensor_id_idx" ON "environment_reading"("tenant_id", "sensor_id");
CREATE INDEX "environment_reading_tenant_id_organization_id_idx" ON "environment_reading"("tenant_id", "organization_id");
ALTER TABLE "environment_reading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "environment_reading" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "environment_reading"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "maintenance_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "space_id" UUID,
    "system_id" UUID,
    "code" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "assignee_id" UUID,
    "reported_on" TEXT NOT NULL,
    "assigned_on" TEXT,
    "completed_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "maintenance_order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "maintenance_order_tenant_id_code_key" ON "maintenance_order"("tenant_id", "code");
CREATE INDEX "maintenance_order_tenant_id_idx" ON "maintenance_order"("tenant_id");
CREATE INDEX "maintenance_order_tenant_id_building_id_idx" ON "maintenance_order"("tenant_id", "building_id");
CREATE INDEX "maintenance_order_tenant_id_organization_id_idx" ON "maintenance_order"("tenant_id", "organization_id");
CREATE INDEX "maintenance_order_tenant_id_assignee_id_idx" ON "maintenance_order"("tenant_id", "assignee_id");
ALTER TABLE "maintenance_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maintenance_order"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "comfort_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "thresholds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "comfort_policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comfort_policy_tenant_id_idx" ON "comfort_policy"("tenant_id");
CREATE INDEX "comfort_policy_tenant_id_organization_id_idx" ON "comfort_policy"("tenant_id", "organization_id");
ALTER TABLE "comfort_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comfort_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "comfort_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "facility_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "building_code" TEXT NOT NULL,
    "building_name" TEXT NOT NULL,
    "building_status" TEXT NOT NULL,
    "space_count" INTEGER NOT NULL DEFAULT 0,
    "available_space_count" INTEGER NOT NULL DEFAULT 0,
    "out_of_service_space_count" INTEGER NOT NULL DEFAULT 0,
    "total_capacity" INTEGER NOT NULL DEFAULT 0,
    "available_capacity" INTEGER NOT NULL DEFAULT 0,
    "system_count" INTEGER NOT NULL DEFAULT 0,
    "operational_system_count" INTEGER NOT NULL DEFAULT 0,
    "systems_under_maintenance" INTEGER NOT NULL DEFAULT 0,
    "readiness_percent" INTEGER NOT NULL DEFAULT 0,
    "open_maintenance_count" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "facility_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "facility_profile_tenant_id_building_id_key" ON "facility_profile"("tenant_id", "building_id");
CREATE INDEX "facility_profile_tenant_id_idx" ON "facility_profile"("tenant_id");
CREATE INDEX "facility_profile_tenant_id_organization_id_idx" ON "facility_profile"("tenant_id", "organization_id");
ALTER TABLE "facility_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facility_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "facility_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
