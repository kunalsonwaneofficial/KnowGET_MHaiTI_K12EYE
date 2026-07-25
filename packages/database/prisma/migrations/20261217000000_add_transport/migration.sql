-- Smart Mobility, Transport & Fleet Platform (P2-D16). Eight tenant-owned tables: vehicle, driver,
-- route, vehicle_assignment, transport_subscription, trip, vehicle_document and
-- route_utilization_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This
-- domain carries NO money (transport fees / vehicle valuation / maintenance cost are deferred to Finance
-- P2-D14 and the Asset register P2-D15): capacities, offsets, percents and versions are INTEGER;
-- over-capacity and has-active-assignment are BOOLEAN; a route's ordered stops and a trip's boarding
-- events are non-null JSONB; date-only and ISO-timestamp domain values (licence expiry; effective,
-- service, issue and expiry dates; departed/completed/refreshed stamps) are TEXT. Uniqueness mirrors the
-- domain: vehicle registration, driver licence and employee, route code, one document per (vehicle,
-- type), one profile per route — all tenant-scoped. Organizations (P2-D01-M01), employees (P2-D12) and
-- students (P2-D03) are referenced by id, not duplicated here.

-- ---------------------------------------------------------------------------------
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "seating_capacity" INTEGER NOT NULL,
    "ownership" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_tenant_id_registration_number_key" ON "vehicle"("tenant_id", "registration_number");
CREATE INDEX "vehicle_tenant_id_idx" ON "vehicle"("tenant_id");
CREATE INDEX "vehicle_tenant_id_organization_id_idx" ON "vehicle"("tenant_id", "organization_id");
ALTER TABLE "vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vehicle"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "driver" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_class" TEXT,
    "license_expiry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "driver_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_tenant_id_license_number_key" ON "driver"("tenant_id", "license_number");
CREATE UNIQUE INDEX "driver_tenant_id_employee_id_key" ON "driver"("tenant_id", "employee_id");
CREATE INDEX "driver_tenant_id_idx" ON "driver"("tenant_id");
CREATE INDEX "driver_tenant_id_organization_id_idx" ON "driver"("tenant_id", "organization_id");
ALTER TABLE "driver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "driver"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "route" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "departure_minutes" INTEGER NOT NULL,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "route_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "route_tenant_id_code_key" ON "route"("tenant_id", "code");
CREATE INDEX "route_tenant_id_idx" ON "route"("tenant_id");
CREATE INDEX "route_tenant_id_organization_id_idx" ON "route"("tenant_id", "organization_id");
ALTER TABLE "route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "route"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "vehicle_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vehicle_assignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_assignment_tenant_id_idx" ON "vehicle_assignment"("tenant_id");
CREATE INDEX "vehicle_assignment_tenant_id_route_id_idx" ON "vehicle_assignment"("tenant_id", "route_id");
CREATE INDEX "vehicle_assignment_tenant_id_vehicle_id_idx" ON "vehicle_assignment"("tenant_id", "vehicle_id");
CREATE INDEX "vehicle_assignment_tenant_id_organization_id_idx" ON "vehicle_assignment"("tenant_id", "organization_id");
ALTER TABLE "vehicle_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vehicle_assignment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "transport_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "pickup_stop_key" TEXT NOT NULL,
    "drop_stop_key" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "transport_subscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transport_subscription_tenant_id_idx" ON "transport_subscription"("tenant_id");
CREATE INDEX "transport_subscription_tenant_id_student_id_idx" ON "transport_subscription"("tenant_id", "student_id");
CREATE INDEX "transport_subscription_tenant_id_route_id_idx" ON "transport_subscription"("tenant_id", "route_id");
CREATE INDEX "transport_subscription_tenant_id_organization_id_idx" ON "transport_subscription"("tenant_id", "organization_id");
ALTER TABLE "transport_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "transport_subscription"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "trip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "service_date" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "departed_at" TEXT,
    "completed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "trip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trip_tenant_id_idx" ON "trip"("tenant_id");
CREATE INDEX "trip_tenant_id_route_id_idx" ON "trip"("tenant_id", "route_id");
CREATE INDEX "trip_tenant_id_vehicle_id_idx" ON "trip"("tenant_id", "vehicle_id");
CREATE INDEX "trip_tenant_id_organization_id_idx" ON "trip"("tenant_id", "organization_id");
ALTER TABLE "trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "trip"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "vehicle_document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "issued_on" TEXT NOT NULL,
    "expires_on" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vehicle_document_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_document_tenant_id_vehicle_id_type_key" ON "vehicle_document"("tenant_id", "vehicle_id", "type");
CREATE INDEX "vehicle_document_tenant_id_idx" ON "vehicle_document"("tenant_id");
CREATE INDEX "vehicle_document_tenant_id_vehicle_id_idx" ON "vehicle_document"("tenant_id", "vehicle_id");
CREATE INDEX "vehicle_document_tenant_id_organization_id_idx" ON "vehicle_document"("tenant_id", "organization_id");
ALTER TABLE "vehicle_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vehicle_document"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "route_utilization_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "route_code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "subscriber_count" INTEGER NOT NULL DEFAULT 0,
    "seats_available" INTEGER NOT NULL DEFAULT 0,
    "utilization_percent" INTEGER NOT NULL DEFAULT 0,
    "over_capacity" BOOLEAN NOT NULL DEFAULT false,
    "has_active_assignment" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "route_utilization_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "route_utilization_profile_tenant_id_route_id_key" ON "route_utilization_profile"("tenant_id", "route_id");
CREATE INDEX "route_utilization_profile_tenant_id_idx" ON "route_utilization_profile"("tenant_id");
CREATE INDEX "route_utilization_profile_tenant_id_organization_id_idx" ON "route_utilization_profile"("tenant_id", "organization_id");
ALTER TABLE "route_utilization_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "route_utilization_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "route_utilization_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
