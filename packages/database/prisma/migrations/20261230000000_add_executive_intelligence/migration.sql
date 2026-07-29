-- Executive Intelligence, Governance & Institutional Command (P2-D29). Seven tenant-owned tables:
-- kpi_definition, kpi_reading, health_index_definition, health_index_assessment, dashboard,
-- executive_briefing and attention_item. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This is the
-- layer leadership actually reads: twenty-eight contracts each recorded what happened inside one part of the
-- institution, and none of them answers whether the school is alright, whether it was more alright last term,
-- or which part of it to go and look at first.
--
-- The contract's defining rule — role-aware dashboards, a reproducible Institutional Health Index across ten
-- domains, evidence-traceable KPIs — is structural in this schema wherever it can be.
--
-- An assessment stores its inputs, not references to them. `run` is the declared weights and the pillar reports
-- pinned together as JSONB, and `fingerprint` is a digest of exactly that. A foreign key to the definition
-- would resolve to today's weights, and reproducibility is a claim about the day the figure was computed: an
-- institution that reweights its index next term must still be able to re-derive last term's composite and
-- compare, rather than watch the old number silently acquire a new meaning. `index_definition_id` records
-- which composition was used; it is not where the weights are looked up.
--
-- Nullability carries meaning in three places and is not tidiness. `health_index_assessment.value` is NULL
-- rather than 0 when nothing declared could be scored, because a composite that could not be computed and one
-- that came out at zero are different events and a reader cannot tell them apart afterwards. `sufficient` and
-- `weight_redistributed` are stored as decided rather than re-derived on read, because the coverage floors are
-- platform constants that could move and a recomputed verdict would rewrite what the institution was told at
-- the time. `attention_item.observed` is the quantity a finding was last raised on in whatever its own reason
-- measures — a band shortfall, a drop, a target miss — and is never summed across items.
--
-- Two uniques are PARTIAL, which is why they are here and not in the Prisma schema (like RLS, a migration-only
-- DB feature). One standing reading per indicator per period: UNIQUE (tenant_id, kpi_definition_id, period)
-- WHERE withdrawn_at IS NULL. A figure the institution has said should never have counted must not block the
-- corrected figure that replaces it, and a total unique would force the institution to invent a new period to
-- file a correction — which makes the correction unfindable. One composition of a series in service at a time:
-- UNIQUE (tenant_id, index_key) WHERE status = 'published'. Superseded and retired compositions keep the key,
-- because assessments were computed under them.
--
-- The other four uniques are total. (tenant_id, kpi_key), (tenant_id, dashboard_key) and
-- (tenant_id, briefing_key) hold across every status including retired and archived, because a saved link, a
-- default-dashboard setting and a filed reading all resolve through a key and re-issuing one under a new
-- meaning is how a reference comes to point at the wrong thing. (tenant_id, index_key, period) holds
-- invalidated assessments included: a period that produced a figure the institution had to invalidate has not
-- become free, and refiling into it would leave two records of the same period with no way to tell which was
-- quoted. (tenant_id, assessment_id, key) is the attention queue's identity — the assessment is which period's
-- arithmetic raised the finding and the key is the engine's stable name for it, so a sweep restates rather than
-- duplicates, and a finding in a later period is a different row rather than a reopening.
--
-- Ordered and bounded children live inside their aggregate as JSONB — kpi_reading.citations,
-- kpi_definition.scale, health_index_definition.weights, health_index_assessment.run / contributions /
-- omissions / evidence, dashboard.panels, executive_briefing.cited / findings — because every invariant worth
-- having across them is unenforceable from a row that can be written on its own. A reading cannot be
-- constructed without at least one usable citation; a panel set is ordered and order is the only positioning
-- this contract has; a briefing's cited figure must survive its assessment being invalidated, which a
-- reference would not.
--
-- Types follow the data: every period, ordinal and count is INTEGER; scores, coverage ratios, redistributed
-- weight and observed quantities are DOUBLE PRECISION; `sufficient` is BOOLEAN; every ISO stamp the domain owns
-- (activated_at, retired_at, withdrawn_at, published_at, superseded_at, finalized_at, invalidated_at,
-- issued_at, acknowledged_at, closed_at) is TEXT, and created_at/updated_at stay platform TIMESTAMP columns.
-- source_domain and the citation source references name records in other domains and are never re-modelled
-- here. There are no dates anywhere a period is meant: this domain holds no clock, so staleness is subtraction
-- between two ordinals and a run reproduces exactly.
--
-- No table here carries deleted_at, and no repository declares a delete. An indicator is retired, a reading is
-- withdrawn, a composition is superseded, an assessment is invalidated, a dashboard is archived, a briefing is
-- withdrawn, a finding is resolved or dismissed. Every one of those leaves the record of what was measured,
-- published, quoted and acted on — which is the only thing that makes the second rule worth anything, because
-- an index whose unflattering history can be deleted is not a measurement.

-- ---------------------------------------------------------------------------------
CREATE TABLE "kpi_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kpi_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pillar" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "scale" JSONB NOT NULL,
    "target_score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activated_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "kpi_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kpi_definition_tenant_id_kpi_key_key" ON "kpi_definition"("tenant_id", "kpi_key");
CREATE INDEX "kpi_definition_tenant_id_idx" ON "kpi_definition"("tenant_id");
CREATE INDEX "kpi_definition_tenant_id_organization_id_idx" ON "kpi_definition"("tenant_id", "organization_id");
CREATE INDEX "kpi_definition_tenant_id_organization_id_status_idx" ON "kpi_definition"("tenant_id", "organization_id", "status");
CREATE INDEX "kpi_definition_tenant_id_pillar_idx" ON "kpi_definition"("tenant_id", "pillar");
CREATE INDEX "kpi_definition_tenant_id_source_domain_idx" ON "kpi_definition"("tenant_id", "source_domain");
ALTER TABLE "kpi_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kpi_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "kpi_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "kpi_reading" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kpi_definition_id" UUID NOT NULL,
    "kpi_key" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "measurement" JSONB NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "standing" TEXT NOT NULL,
    "withdrawn_at" TEXT,
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "kpi_reading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kpi_reading_tenant_id_idx" ON "kpi_reading"("tenant_id");
CREATE INDEX "kpi_reading_tenant_id_organization_id_idx" ON "kpi_reading"("tenant_id", "organization_id");
CREATE INDEX "kpi_reading_tenant_id_kpi_definition_id_idx" ON "kpi_reading"("tenant_id", "kpi_definition_id");
CREATE INDEX "kpi_reading_tenant_id_kpi_definition_id_period_idx" ON "kpi_reading"("tenant_id", "kpi_definition_id", "period");
CREATE INDEX "kpi_reading_tenant_id_organization_id_kpi_definition_id_idx" ON "kpi_reading"("tenant_id", "organization_id", "kpi_definition_id");
CREATE INDEX "kpi_reading_tenant_id_kpi_key_period_idx" ON "kpi_reading"("tenant_id", "kpi_key", "period");
-- One STANDING reading per indicator per period. Partial, so a withdrawn figure does
-- not block the correction that replaces it — the institution should not have to
-- invent a period to file a correction into.
CREATE UNIQUE INDEX "kpi_reading_standing_period_key" ON "kpi_reading"("tenant_id", "kpi_definition_id", "period") WHERE "withdrawn_at" IS NULL;
ALTER TABLE "kpi_reading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kpi_reading" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "kpi_reading"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "health_index_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "index_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "grain" TEXT NOT NULL,
    "weights" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "superseded_by_id" UUID,
    "published_at" TEXT,
    "superseded_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "health_index_definition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "health_index_definition_tenant_id_idx" ON "health_index_definition"("tenant_id");
CREATE INDEX "health_index_definition_tenant_id_organization_id_idx" ON "health_index_definition"("tenant_id", "organization_id");
CREATE INDEX "health_index_definition_tenant_id_index_key_idx" ON "health_index_definition"("tenant_id", "index_key");
CREATE INDEX "health_index_definition_tenant_id_status_idx" ON "health_index_definition"("tenant_id", "status");
-- One composition of a series in service at a time. Partial, because superseded and
-- retired compositions keep the key: assessments were computed under them, and the
-- supersession chain is what shows a step in the series was a change of question.
CREATE UNIQUE INDEX "health_index_definition_published_key" ON "health_index_definition"("tenant_id", "index_key") WHERE "status" = 'published';
ALTER TABLE "health_index_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_index_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "health_index_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "health_index_assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "index_definition_id" UUID NOT NULL,
    "index_key" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "grain" TEXT NOT NULL,
    "run" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "band" TEXT,
    "pillar_coverage" DOUBLE PRECISION NOT NULL,
    "sufficient" BOOLEAN NOT NULL DEFAULT false,
    "weight_redistributed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contributions" JSONB NOT NULL DEFAULT '[]',
    "omissions" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'provisional',
    "finalized_at" TEXT,
    "invalidated_at" TEXT,
    "invalidation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "health_index_assessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "health_index_assessment_tenant_id_index_key_period_key" ON "health_index_assessment"("tenant_id", "index_key", "period");
CREATE INDEX "health_index_assessment_tenant_id_idx" ON "health_index_assessment"("tenant_id");
CREATE INDEX "health_index_assessment_tenant_id_organization_id_idx" ON "health_index_assessment"("tenant_id", "organization_id");
CREATE INDEX "health_index_assessment_tenant_id_index_definition_id_idx" ON "health_index_assessment"("tenant_id", "index_definition_id");
CREATE INDEX "health_index_assessment_tenant_id_status_idx" ON "health_index_assessment"("tenant_id", "status");
-- Indexed but deliberately NOT unique: two assessments of different series can pin
-- identical inputs, and the read this serves is "did these inputs produce a figure
-- before", which is a comparison and not an identity.
CREATE INDEX "health_index_assessment_tenant_id_fingerprint_idx" ON "health_index_assessment"("tenant_id", "fingerprint");
ALTER TABLE "health_index_assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_index_assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "health_index_assessment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "dashboard" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dashboard_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "panels" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TEXT,
    "archived_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dashboard_tenant_id_dashboard_key_key" ON "dashboard"("tenant_id", "dashboard_key");
CREATE INDEX "dashboard_tenant_id_idx" ON "dashboard"("tenant_id");
CREATE INDEX "dashboard_tenant_id_organization_id_idx" ON "dashboard"("tenant_id", "organization_id");
CREATE INDEX "dashboard_tenant_id_organization_id_status_idx" ON "dashboard"("tenant_id", "organization_id", "status");
ALTER TABLE "dashboard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboard"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "executive_briefing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "briefing_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT,
    "audience_scope" TEXT NOT NULL,
    "assessment_id" UUID NOT NULL,
    "index_key" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "cited" JSONB NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issued_at" TEXT,
    "withdrawn_at" TEXT,
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "executive_briefing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "executive_briefing_tenant_id_briefing_key_key" ON "executive_briefing"("tenant_id", "briefing_key");
CREATE INDEX "executive_briefing_tenant_id_idx" ON "executive_briefing"("tenant_id");
CREATE INDEX "executive_briefing_tenant_id_organization_id_idx" ON "executive_briefing"("tenant_id", "organization_id");
CREATE INDEX "executive_briefing_tenant_id_assessment_id_idx" ON "executive_briefing"("tenant_id", "assessment_id");
CREATE INDEX "executive_briefing_tenant_id_organization_id_status_idx" ON "executive_briefing"("tenant_id", "organization_id", "status");
ALTER TABLE "executive_briefing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "executive_briefing" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "executive_briefing"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "attention_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "index_key" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "observed" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "acknowledged_at" TEXT,
    "acknowledged_by" UUID,
    "closed_at" TEXT,
    "closed_by" UUID,
    "closure_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "attention_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attention_item_tenant_id_assessment_id_key_key" ON "attention_item"("tenant_id", "assessment_id", "key");
CREATE INDEX "attention_item_tenant_id_idx" ON "attention_item"("tenant_id");
CREATE INDEX "attention_item_tenant_id_organization_id_idx" ON "attention_item"("tenant_id", "organization_id");
CREATE INDEX "attention_item_tenant_id_organization_id_status_idx" ON "attention_item"("tenant_id", "organization_id", "status");
CREATE INDEX "attention_item_tenant_id_index_key_period_idx" ON "attention_item"("tenant_id", "index_key", "period");
CREATE INDEX "attention_item_tenant_id_severity_idx" ON "attention_item"("tenant_id", "severity");
ALTER TABLE "attention_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attention_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "attention_item"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
