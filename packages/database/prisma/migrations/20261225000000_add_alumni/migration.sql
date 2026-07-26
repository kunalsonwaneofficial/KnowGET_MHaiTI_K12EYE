-- Alumni, Community & Relationship Platform (P2-D24). Eight tenant-owned tables: alumni_profile,
-- alumni_chapter, chapter_membership, alumni_event, event_registration, mentorship_connection, contribution
-- and alumni_engagement_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This domain owns the
-- institution's alumni network and community — the network-membership profiles built on the alumnus lifecycle
-- stage that Student Lifecycle (P2-D03) owns, the chapters and their memberships, the events and their
-- registrations, the mentorship connections between alumni, and the immutable giving record — with a
-- descriptive per-alumnus engagement profile. It carries NO money: gift amounts are Finance's (P2-D14); a
-- contribution records the relationship fact (type + non-monetary recognition tier), not the transaction.
-- Types follow the data: an event capacity, every engagement count and the engagement score are INTEGER;
-- every date/ISO stamp (graduation year, joined/left, starts/ends, registered/responded, proposed/started/
-- ended, contributed, refreshed) and every code, name, type, role, region, status, tier and focus is TEXT.
-- Engagement and participation are DERIVED by the two pure engines (alumni_engagement_profile is a
-- re-derivable read model). Community delivery (invitations, newsletters) is the notifications (P1-M05) /
-- engagement (P2-D22) concern. Uniqueness is DB-backed: one profile per (tenant, alumnus person); chapter /
-- event code per tenant; one membership per (chapter, alumni profile); one registration per (event, alumni
-- profile); one engagement profile per alumni profile. Organizations (P2-D01-M01), persons (P2-D01-M02) and
-- the alumnus/student records of Student Lifecycle (P2-D03) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "alumni_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alumnus_person_id" UUID NOT NULL,
    "graduation_year" TEXT NOT NULL,
    "program" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "alumni_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alumni_profile_tenant_id_alumnus_person_id_key" ON "alumni_profile"("tenant_id", "alumnus_person_id");
CREATE INDEX "alumni_profile_tenant_id_idx" ON "alumni_profile"("tenant_id");
CREATE INDEX "alumni_profile_tenant_id_organization_id_idx" ON "alumni_profile"("tenant_id", "organization_id");
ALTER TABLE "alumni_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "alumni_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "alumni_chapter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'forming',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "alumni_chapter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alumni_chapter_tenant_id_code_key" ON "alumni_chapter"("tenant_id", "code");
CREATE INDEX "alumni_chapter_tenant_id_idx" ON "alumni_chapter"("tenant_id");
CREATE INDEX "alumni_chapter_tenant_id_organization_id_idx" ON "alumni_chapter"("tenant_id", "organization_id");
ALTER TABLE "alumni_chapter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_chapter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "alumni_chapter"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "chapter_membership" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "alumni_profile_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joined_on" TEXT NOT NULL,
    "left_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "chapter_membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chapter_membership_tenant_id_chapter_id_alumni_profile_id_key" ON "chapter_membership"("tenant_id", "chapter_id", "alumni_profile_id");
CREATE INDEX "chapter_membership_tenant_id_idx" ON "chapter_membership"("tenant_id");
CREATE INDEX "chapter_membership_tenant_id_chapter_id_idx" ON "chapter_membership"("tenant_id", "chapter_id");
CREATE INDEX "chapter_membership_tenant_id_alumni_profile_id_idx" ON "chapter_membership"("tenant_id", "alumni_profile_id");
ALTER TABLE "chapter_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chapter_membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "chapter_membership"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "alumni_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "starts_on" TEXT,
    "ends_on" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "alumni_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alumni_event_tenant_id_code_key" ON "alumni_event"("tenant_id", "code");
CREATE INDEX "alumni_event_tenant_id_idx" ON "alumni_event"("tenant_id");
CREATE INDEX "alumni_event_tenant_id_organization_id_idx" ON "alumni_event"("tenant_id", "organization_id");
ALTER TABLE "alumni_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "alumni_event"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "event_registration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "alumni_profile_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "registered_on" TEXT NOT NULL,
    "responded_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_registration_tenant_id_event_id_alumni_profile_id_key" ON "event_registration"("tenant_id", "event_id", "alumni_profile_id");
CREATE INDEX "event_registration_tenant_id_idx" ON "event_registration"("tenant_id");
CREATE INDEX "event_registration_tenant_id_event_id_idx" ON "event_registration"("tenant_id", "event_id");
CREATE INDEX "event_registration_tenant_id_alumni_profile_id_idx" ON "event_registration"("tenant_id", "alumni_profile_id");
ALTER TABLE "event_registration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_registration" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "event_registration"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "mentorship_connection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mentor_profile_id" UUID NOT NULL,
    "mentee_profile_id" UUID NOT NULL,
    "focus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposed_on" TEXT NOT NULL,
    "started_on" TEXT,
    "ended_on" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "mentorship_connection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentorship_connection_tenant_id_idx" ON "mentorship_connection"("tenant_id");
CREATE INDEX "mentorship_connection_tenant_id_mentor_profile_id_idx" ON "mentorship_connection"("tenant_id", "mentor_profile_id");
CREATE INDEX "mentorship_connection_tenant_id_mentee_profile_id_idx" ON "mentorship_connection"("tenant_id", "mentee_profile_id");
ALTER TABLE "mentorship_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentorship_connection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "mentorship_connection"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "contribution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alumni_profile_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "recognition_tier" TEXT NOT NULL,
    "campaign_ref" TEXT,
    "contributed_on" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "contribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contribution_tenant_id_idx" ON "contribution"("tenant_id");
CREATE INDEX "contribution_tenant_id_alumni_profile_id_idx" ON "contribution"("tenant_id", "alumni_profile_id");
ALTER TABLE "contribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contribution" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "contribution"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "alumni_engagement_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alumni_profile_id" UUID NOT NULL,
    "events_attended" INTEGER NOT NULL DEFAULT 0,
    "active_chapters" INTEGER NOT NULL DEFAULT 0,
    "active_mentorships" INTEGER NOT NULL DEFAULT 0,
    "contributions_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT 'inactive',
    "refreshed_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "alumni_engagement_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alumni_engagement_profile_tenant_id_alumni_profile_id_key" ON "alumni_engagement_profile"("tenant_id", "alumni_profile_id");
CREATE INDEX "alumni_engagement_profile_tenant_id_idx" ON "alumni_engagement_profile"("tenant_id");
CREATE INDEX "alumni_engagement_profile_tenant_id_organization_id_idx" ON "alumni_engagement_profile"("tenant_id", "organization_id");
ALTER TABLE "alumni_engagement_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alumni_engagement_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "alumni_engagement_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
