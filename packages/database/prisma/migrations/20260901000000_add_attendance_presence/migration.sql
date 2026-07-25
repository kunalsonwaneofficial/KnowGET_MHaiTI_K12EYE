-- Attendance & Presence Intelligence Platform (P2-D08). Six tenant-owned tables: the
-- attendance session, attendance record, leave, attendance policy, presence profile and
-- participation. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset
-- tenant). Structured data (corrections, supporting documents, policy parameters/revisions,
-- presence anomalies) is stored as non-null JSONB, matching the Prisma schema.

-- ---------------------------------------------------------------------------------
CREATE TABLE "attendance_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "schedule_slot_id" UUID,
    "section_id" UUID,
    "subject_id" UUID,
    "starts_at" TEXT,
    "ends_at" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "attendance_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_session_tenant_id_schedule_slot_id_date_key" ON "attendance_session"("tenant_id", "schedule_slot_id", "date");
CREATE INDEX "attendance_session_tenant_id_idx" ON "attendance_session"("tenant_id");
CREATE INDEX "attendance_session_tenant_id_organization_id_idx" ON "attendance_session"("tenant_id", "organization_id");
ALTER TABLE "attendance_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "attendance_session"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "attendance_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "participant_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "recorded_by" UUID,
    "remarks" TEXT,
    "corrections" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_record_tenant_id_session_id_participant_id_key" ON "attendance_record"("tenant_id", "session_id", "participant_id");
CREATE INDEX "attendance_record_tenant_id_idx" ON "attendance_record"("tenant_id");
CREATE INDEX "attendance_record_tenant_id_session_id_idx" ON "attendance_record"("tenant_id", "session_id");
CREATE INDEX "attendance_record_tenant_id_participant_id_idx" ON "attendance_record"("tenant_id", "participant_id");
ALTER TABLE "attendance_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "attendance_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "leave" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "holder_type" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "from_date" TEXT NOT NULL,
    "to_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "supporting_documents" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "leave_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_tenant_id_idx" ON "leave"("tenant_id");
CREATE INDEX "leave_tenant_id_organization_id_idx" ON "leave"("tenant_id", "organization_id");
CREATE INDEX "leave_tenant_id_person_id_idx" ON "leave"("tenant_id", "person_id");
ALTER TABLE "leave" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leave"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "attendance_policy" (
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
    CONSTRAINT "attendance_policy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_policy_tenant_id_organization_id_code_key" ON "attendance_policy"("tenant_id", "organization_id", "code");
CREATE INDEX "attendance_policy_tenant_id_idx" ON "attendance_policy"("tenant_id");
CREATE INDEX "attendance_policy_tenant_id_organization_id_idx" ON "attendance_policy"("tenant_id", "organization_id");
ALTER TABLE "attendance_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "attendance_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "presence_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "attendance_percentage" DOUBLE PRECISION NOT NULL,
    "punctuality_rate" DOUBLE PRECISION NOT NULL,
    "longest_absent_streak" INTEGER NOT NULL,
    "chronic_absenteeism" BOOLEAN NOT NULL,
    "participation_count" INTEGER NOT NULL,
    "participation_diversity" INTEGER NOT NULL,
    "leave_count" INTEGER NOT NULL,
    "engagement_score" DOUBLE PRECISION NOT NULL,
    "risk_level" TEXT NOT NULL,
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "last_computed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "presence_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presence_profile_tenant_id_participant_id_key" ON "presence_profile"("tenant_id", "participant_id");
CREATE INDEX "presence_profile_tenant_id_idx" ON "presence_profile"("tenant_id");
CREATE INDEX "presence_profile_tenant_id_organization_id_idx" ON "presence_profile"("tenant_id", "organization_id");
ALTER TABLE "presence_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presence_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "presence_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "participation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "session_id" UUID,
    "role" TEXT,
    "engagement_level" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "participation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "participation_tenant_id_idx" ON "participation"("tenant_id");
CREATE INDEX "participation_tenant_id_organization_id_idx" ON "participation"("tenant_id", "organization_id");
CREATE INDEX "participation_tenant_id_participant_id_idx" ON "participation"("tenant_id", "participant_id");
ALTER TABLE "participation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "participation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "participation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
