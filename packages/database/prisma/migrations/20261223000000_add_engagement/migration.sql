-- Unified Communication, Engagement & Collaboration Platform (P2-D22). Eight tenant-owned tables: audience,
-- announcement, acknowledgement_receipt, message_thread, message, survey, survey_response and
-- engagement_profile. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This domain owns the
-- institution's engagement — the audiences it addresses, the announcements it broadcasts and the immutable
-- acknowledgement receipts they draw, the message threads and their immutable messages, the surveys it runs
-- and the immutable responses they collect — with a descriptive per-audience engagement profile. It carries
-- NO money. Types follow the data: counts and percents are INTEGER; audience/thread member id sets, survey
-- questions and response answers are JSONB; an announcement's pinned flag is BOOLEAN; every date/ISO stamp
-- (scheduled/published/acknowledged/sent/opens/closes/submitted/refreshed) and every code, name, title, body,
-- subject and label is TEXT. Reach and response rates are DERIVED by the two pure engines (engagement_profile
-- is a re-derivable read model). Channel delivery is the platform notifications service's (P1-M05); contact
-- preferences are Family & Guardian's (P2-D04). Uniqueness is DB-backed: audience code per tenant, one
-- acknowledgement per (announcement, person), one identified response per (survey, respondent) (NULL
-- respondents are distinct, so anonymous responses are unbounded), one profile per audience. Organizations
-- (P2-D01-M01) and persons (P2-D01-M02) are referenced by id.

-- ---------------------------------------------------------------------------------
CREATE TABLE "audience" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria_label" TEXT,
    "member_person_ids" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "audience_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "audience_tenant_id_code_key" ON "audience"("tenant_id", "code");
CREATE INDEX "audience_tenant_id_idx" ON "audience"("tenant_id");
CREATE INDEX "audience_tenant_id_organization_id_idx" ON "audience"("tenant_id", "organization_id");
ALTER TABLE "audience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audience" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audience"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "announcement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audience_id" UUID NOT NULL,
    "author_person_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_for" TEXT,
    "published_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "announcement_tenant_id_idx" ON "announcement"("tenant_id");
CREATE INDEX "announcement_tenant_id_audience_id_idx" ON "announcement"("tenant_id", "audience_id");
CREATE INDEX "announcement_tenant_id_organization_id_idx" ON "announcement"("tenant_id", "organization_id");
ALTER TABLE "announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "announcement"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "acknowledgement_receipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "acknowledged_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "acknowledgement_receipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "acknowledgement_receipt_tenant_id_announcement_id_person_id_key" ON "acknowledgement_receipt"("tenant_id", "announcement_id", "person_id");
CREATE INDEX "acknowledgement_receipt_tenant_id_idx" ON "acknowledgement_receipt"("tenant_id");
CREATE INDEX "acknowledgement_receipt_tenant_id_announcement_id_idx" ON "acknowledgement_receipt"("tenant_id", "announcement_id");
ALTER TABLE "acknowledgement_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acknowledgement_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "acknowledgement_receipt"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "message_thread" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "participant_person_ids" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "message_thread_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_thread_tenant_id_idx" ON "message_thread"("tenant_id");
CREATE INDEX "message_thread_tenant_id_organization_id_idx" ON "message_thread"("tenant_id", "organization_id");
ALTER TABLE "message_thread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_thread" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "message_thread"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author_person_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_tenant_id_idx" ON "message"("tenant_id");
CREATE INDEX "message_tenant_id_thread_id_idx" ON "message"("tenant_id", "thread_id");
ALTER TABLE "message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "message"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "survey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audience_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "opens_at" TEXT,
    "closes_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "survey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "survey_tenant_id_idx" ON "survey"("tenant_id");
CREATE INDEX "survey_tenant_id_audience_id_idx" ON "survey"("tenant_id", "audience_id");
CREATE INDEX "survey_tenant_id_organization_id_idx" ON "survey"("tenant_id", "organization_id");
ALTER TABLE "survey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "survey"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "survey_response" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "respondent_person_id" UUID,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "submitted_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "survey_response_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "survey_response_tenant_id_survey_id_respondent_person_id_key" ON "survey_response"("tenant_id", "survey_id", "respondent_person_id");
CREATE INDEX "survey_response_tenant_id_idx" ON "survey_response"("tenant_id");
CREATE INDEX "survey_response_tenant_id_survey_id_idx" ON "survey_response"("tenant_id", "survey_id");
ALTER TABLE "survey_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_response" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "survey_response"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "engagement_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audience_id" UUID NOT NULL,
    "audience_code" TEXT NOT NULL,
    "audience_name" TEXT NOT NULL,
    "audience_size" INTEGER NOT NULL DEFAULT 0,
    "announcement_count" INTEGER NOT NULL DEFAULT 0,
    "total_acknowledged" INTEGER NOT NULL DEFAULT 0,
    "acknowledgement_percent" INTEGER NOT NULL DEFAULT 0,
    "survey_count" INTEGER NOT NULL DEFAULT 0,
    "total_responses" INTEGER NOT NULL DEFAULT 0,
    "response_percent" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "engagement_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "engagement_profile_tenant_id_audience_id_key" ON "engagement_profile"("tenant_id", "audience_id");
CREATE INDEX "engagement_profile_tenant_id_idx" ON "engagement_profile"("tenant_id");
CREATE INDEX "engagement_profile_tenant_id_organization_id_idx" ON "engagement_profile"("tenant_id", "organization_id");
ALTER TABLE "engagement_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "engagement_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "engagement_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
