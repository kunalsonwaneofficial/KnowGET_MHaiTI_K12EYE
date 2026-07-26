-- Campus Security, Safety & Visitor Platform (P2-D21). Eight tenant-owned tables: access_zone, visitor,
-- visit, access_credential, access_event, security_incident, emergency_drill and safety_profile. Every table
-- is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both USING and
-- WITH CHECK, fail-closed on an unset tenant). This domain owns the campus security operations — visitor
-- management, access control and the immutable door log, security incidents, and emergency drills — with a
-- descriptive per-zone safety profile. It carries NO money (security-service billing/procurement is out of
-- scope: Finance P2-D14 / Procurement & Assets P2-D15). Types follow the data: capacities, counts, drill
-- rosters/musters and percents are INTEGER; a credential's granted zone ids are JSONB; a zone's over-capacity
-- flag on the profile is BOOLEAN; every date-only and ISO-stamp value (scheduled/checked-in/checked-out/
-- issued/expires/occurred/reported/resolved/started/completed/refreshed stamps), and every code, name and
-- free-text summary, is TEXT. Who is on-site, a drill's unaccounted-for count, an access decision and the
-- granted/denied activity are DERIVED by the pure engines (safety_profile is a re-derivable read model). The
-- standing safeguarding/disciplinary record belongs to Learner Wellbeing (P2-D05) and clinical incidents to
-- the Health Centre (P2-D19). Uniqueness mirrors the domain: zone/visitor/credential/incident/drill codes
-- per tenant, one profile per zone — all tenant-scoped. The status-scoped uniques (an access-event log is
-- append-only; there is no one-active guard beyond service checks) are documented in ADR-0040. Organizations
-- (P2-D01-M01), persons (P2-D01-M02) and employees (P2-D12) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "access_zone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "security_level" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "access_zone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "access_zone_tenant_id_code_key" ON "access_zone"("tenant_id", "code");
CREATE INDEX "access_zone_tenant_id_idx" ON "access_zone"("tenant_id");
CREATE INDEX "access_zone_tenant_id_organization_id_idx" ON "access_zone"("tenant_id", "organization_id");
ALTER TABLE "access_zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_zone" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "access_zone"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "visitor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "visitor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "visitor_tenant_id_code_key" ON "visitor"("tenant_id", "code");
CREATE INDEX "visitor_tenant_id_idx" ON "visitor"("tenant_id");
CREATE INDEX "visitor_tenant_id_organization_id_idx" ON "visitor"("tenant_id", "organization_id");
ALTER TABLE "visitor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "visitor"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "visit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "host_person_id" UUID NOT NULL,
    "zone_id" UUID,
    "purpose" TEXT,
    "scheduled_for" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "checked_in_at" TEXT,
    "checked_out_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "visit_tenant_id_idx" ON "visit"("tenant_id");
CREATE INDEX "visit_tenant_id_visitor_id_idx" ON "visit"("tenant_id", "visitor_id");
CREATE INDEX "visit_tenant_id_zone_id_idx" ON "visit"("tenant_id", "zone_id");
CREATE INDEX "visit_tenant_id_host_person_id_idx" ON "visit"("tenant_id", "host_person_id");
CREATE INDEX "visit_tenant_id_organization_id_idx" ON "visit"("tenant_id", "organization_id");
ALTER TABLE "visit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "visit"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "access_credential" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "credential_number" TEXT NOT NULL,
    "holder_type" TEXT NOT NULL,
    "holder_id" UUID NOT NULL,
    "granted_zone_ids" JSONB NOT NULL DEFAULT '[]',
    "issued_on" TEXT NOT NULL,
    "expires_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "access_credential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "access_credential_tenant_id_credential_number_key" ON "access_credential"("tenant_id", "credential_number");
CREATE INDEX "access_credential_tenant_id_idx" ON "access_credential"("tenant_id");
CREATE INDEX "access_credential_tenant_id_holder_type_holder_id_idx" ON "access_credential"("tenant_id", "holder_type", "holder_id");
CREATE INDEX "access_credential_tenant_id_organization_id_idx" ON "access_credential"("tenant_id", "organization_id");
ALTER TABLE "access_credential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_credential" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "access_credential"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "access_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "point_label" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "occurred_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "access_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "access_event_tenant_id_idx" ON "access_event"("tenant_id");
CREATE INDEX "access_event_tenant_id_credential_id_idx" ON "access_event"("tenant_id", "credential_id");
CREATE INDEX "access_event_tenant_id_zone_id_idx" ON "access_event"("tenant_id", "zone_id");
CREATE INDEX "access_event_tenant_id_organization_id_idx" ON "access_event"("tenant_id", "organization_id");
ALTER TABLE "access_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "access_event"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "security_incident" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "zone_id" UUID,
    "reported_by_person_id" UUID,
    "assignee_id" UUID,
    "summary" TEXT NOT NULL,
    "reported_on" TEXT NOT NULL,
    "resolved_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "security_incident_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "security_incident_tenant_id_code_key" ON "security_incident"("tenant_id", "code");
CREATE INDEX "security_incident_tenant_id_idx" ON "security_incident"("tenant_id");
CREATE INDEX "security_incident_tenant_id_zone_id_idx" ON "security_incident"("tenant_id", "zone_id");
CREATE INDEX "security_incident_tenant_id_assignee_id_idx" ON "security_incident"("tenant_id", "assignee_id");
CREATE INDEX "security_incident_tenant_id_organization_id_idx" ON "security_incident"("tenant_id", "organization_id");
ALTER TABLE "security_incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_incident" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "security_incident"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "emergency_drill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "zone_id" UUID,
    "conducted_by_id" UUID,
    "scheduled_for" TEXT NOT NULL,
    "expected_count" INTEGER NOT NULL DEFAULT 0,
    "accounted_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TEXT,
    "completed_at" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "emergency_drill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "emergency_drill_tenant_id_code_key" ON "emergency_drill"("tenant_id", "code");
CREATE INDEX "emergency_drill_tenant_id_idx" ON "emergency_drill"("tenant_id");
CREATE INDEX "emergency_drill_tenant_id_zone_id_idx" ON "emergency_drill"("tenant_id", "zone_id");
CREATE INDEX "emergency_drill_tenant_id_organization_id_idx" ON "emergency_drill"("tenant_id", "organization_id");
ALTER TABLE "emergency_drill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_drill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "emergency_drill"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "safety_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "zone_code" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "security_level" TEXT NOT NULL,
    "zone_status" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "on_site_visitor_count" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "over_capacity" BOOLEAN NOT NULL DEFAULT false,
    "occupancy_percent" INTEGER NOT NULL DEFAULT 0,
    "open_incident_count" INTEGER NOT NULL DEFAULT 0,
    "active_credential_count" INTEGER NOT NULL DEFAULT 0,
    "access_granted_count" INTEGER NOT NULL DEFAULT 0,
    "access_denied_count" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "safety_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "safety_profile_tenant_id_zone_id_key" ON "safety_profile"("tenant_id", "zone_id");
CREATE INDEX "safety_profile_tenant_id_idx" ON "safety_profile"("tenant_id");
CREATE INDEX "safety_profile_tenant_id_organization_id_idx" ON "safety_profile"("tenant_id", "organization_id");
ALTER TABLE "safety_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safety_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "safety_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
