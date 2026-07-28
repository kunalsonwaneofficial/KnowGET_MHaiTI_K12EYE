-- Predictive Intelligence, Simulation & Strategic Planning (P2-D28). Seven tenant-owned tables:
-- observation_series, forecast_model, forecast_run, backtest, scenario, simulation_run and strategic_plan.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both
-- USING and WITH CHECK, fail-closed on an unset tenant). This is the forward-looking layer of the intelligence
-- core (Program E), and where prediction deferred out of all twenty-four operational domains lands: it reads
-- history other domains own, projects from it, and never re-models the subject it is projecting about.
--
-- The contract's defining rule — every forecast carries confidence intervals, assumptions and uncertainty, and
-- is reproducible and versioned — is structural in this schema rather than procedural.
--
-- A run stores its inputs, not references to them. series_key/series_version, model_key/model_version, method,
-- the resolved parameters, horizon, confidence_levels and assumptions are all columns or JSONB on forecast_run,
-- because a foreign key resolves to today's answer and reproducibility is a claim about the day the run was
-- made. digest is the hash of exactly those inputs; canonical is the string it was taken over, kept beside it so
-- a disagreement between a recomputation and the record is a diff rather than a mystery. digest is indexed but
-- deliberately NOT unique: a superseded run and the fresh run answering the same question share it, and the
-- application prefers the live one.
--
-- Versions are what make "these inputs" identifiable later. observation_series.version advances on every change
-- to the readings or the declared cycle; forecast_model.version is 0 while a model is a draft and is minted on
-- publication; scenario.version identifies the lever set; strategic_plan.version identifies the objective set a
-- review's frozen variance was computed against. Each is the number a downstream record pins.
--
-- Ordered children live inside their aggregate as JSONB — observation_series.observations, forecast_run.points
-- and assumptions, backtest.scored, scenario.levers, simulation_run.points, strategic_plan.objectives, progress
-- and reviews — because every invariant worth having across them is unenforceable from a row that can be
-- written on its own. A reading written independently would move the history a run pinned without moving the
-- version that says it moved; a lever written independently would move what a simulation claimed to be a
-- departure from; a review recomputed on read would rewrite what the institution actually saw at the time.
--
-- A key does not identify a forecast model; a key and a version do, so the unique is on (tenant_id, model_key,
-- version) and there is none on model_key alone — revising a published model opens a new draft beside the one
-- runs are pinning. Series, scenarios and plans are keyed once per organization: unique on (tenant_id,
-- organization_id, <key>), because two series claiming to measure the same thing is how a forecast comes to
-- depend on whichever one the caller happened to find.
--
-- strategic_plan.metric_keys is a normalized projection of the objectives' metric keys with a GIN index over
-- it. When a series takes a correction, every plan tracking that metric is reviewing itself on figures that
-- have since moved, and asking which plans named the metric is the only way to find them; a JSONB scan of
-- objectives would answer the same question without an index behind it.
--
-- Types follow the data: every version, period, horizon and count is INTEGER, confidence_levels and
-- fallback_periods are INTEGER[], the measured totals and error figures are DOUBLE PRECISION, invalidation
-- drift codes / varied assumption keys / unapplied lever keys / metric keys are TEXT[], every ISO stamp the
-- domain owns (closed_at, published_at, retired_at, produced_at, superseded_at, invalidated_at, ran_at,
-- activated_at, closed_at) is TEXT, and created_at/updated_at stay platform TIMESTAMP columns. source_domain
-- and subject_ref are TEXT: they name a record in another domain and are never re-modelled here.
--
-- Only two of the seven tables carry deleted_at. A series is the measured history and a run, a backtest, a
-- simulation and a plan are what was projected, scored, explored and committed to — the fourth rule is worth
-- nothing if the record of a forecast can be quietly taken away when it turns out badly. Each has a way out
-- that leaves the history intact: withdrawn, closed, superseded, invalidated, archived, abandoned. A draft
-- model and a draft scenario are things an institution is still assembling, and both have a lifecycle exit —
-- retired, archived — for once they have been relied on.

-- ---------------------------------------------------------------------------------
CREATE TABLE "observation_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "series_key" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "subject_ref" TEXT,
    "grain" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "cycle_length" INTEGER,
    "unit" TEXT,
    "observations" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "observation_series_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "observation_series_tenant_id_organization_id_series_key_key" ON "observation_series"("tenant_id", "organization_id", "series_key");
CREATE INDEX "observation_series_tenant_id_idx" ON "observation_series"("tenant_id");
CREATE INDEX "observation_series_tenant_id_organization_id_idx" ON "observation_series"("tenant_id", "organization_id");
CREATE INDEX "observation_series_tenant_id_metric_key_idx" ON "observation_series"("tenant_id", "metric_key");
CREATE INDEX "observation_series_tenant_id_status_idx" ON "observation_series"("tenant_id", "status");
CREATE INDEX "observation_series_tenant_id_source_domain_subject_ref_idx" ON "observation_series"("tenant_id", "source_domain", "subject_ref");
ALTER TABLE "observation_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "observation_series" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "observation_series"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "forecast_model" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "model_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "method" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "confidence_levels" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "forecast_model_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "forecast_model_tenant_id_model_key_version_key" ON "forecast_model"("tenant_id", "model_key", "version");
CREATE INDEX "forecast_model_tenant_id_idx" ON "forecast_model"("tenant_id");
CREATE INDEX "forecast_model_tenant_id_organization_id_idx" ON "forecast_model"("tenant_id", "organization_id");
CREATE INDEX "forecast_model_tenant_id_model_key_idx" ON "forecast_model"("tenant_id", "model_key");
CREATE INDEX "forecast_model_tenant_id_status_idx" ON "forecast_model"("tenant_id", "status");
ALTER TABLE "forecast_model" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_model" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "forecast_model"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "forecast_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "series_key" TEXT NOT NULL,
    "series_version" INTEGER NOT NULL,
    "model_id" UUID NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "horizon" INTEGER NOT NULL,
    "confidence_levels" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "points" JSONB NOT NULL DEFAULT '[]',
    "uncertainty" JSONB NOT NULL,
    "fallback_periods" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "digest" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "produced_by_user_id" UUID,
    "produced_at" TEXT NOT NULL,
    "superseded_by_run_id" UUID,
    "superseded_at" TEXT,
    "invalidated_at" TEXT,
    "invalidation_drift" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "forecast_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "forecast_run_tenant_id_idx" ON "forecast_run"("tenant_id");
CREATE INDEX "forecast_run_tenant_id_organization_id_idx" ON "forecast_run"("tenant_id", "organization_id");
CREATE INDEX "forecast_run_tenant_id_digest_idx" ON "forecast_run"("tenant_id", "digest");
CREATE INDEX "forecast_run_tenant_id_series_id_idx" ON "forecast_run"("tenant_id", "series_id");
CREATE INDEX "forecast_run_tenant_id_model_id_idx" ON "forecast_run"("tenant_id", "model_id");
CREATE INDEX "forecast_run_tenant_id_status_idx" ON "forecast_run"("tenant_id", "status");
ALTER TABLE "forecast_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "forecast_run"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "backtest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "series_key" TEXT NOT NULL,
    "series_version" INTEGER NOT NULL,
    "model_id" UUID NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "holdout_size" INTEGER NOT NULL,
    "training_count" INTEGER NOT NULL,
    "first_holdout_period" INTEGER NOT NULL,
    "last_holdout_period" INTEGER NOT NULL,
    "scored" JSONB NOT NULL DEFAULT '[]',
    "scores" JSONB NOT NULL,
    "baseline_mean_absolute_error" DOUBLE PRECISION NOT NULL,
    "publishable" BOOLEAN NOT NULL DEFAULT false,
    "ran_by_user_id" UUID,
    "ran_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "backtest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "backtest_tenant_id_idx" ON "backtest"("tenant_id");
CREATE INDEX "backtest_tenant_id_organization_id_idx" ON "backtest"("tenant_id", "organization_id");
CREATE INDEX "backtest_tenant_id_series_id_idx" ON "backtest"("tenant_id", "series_id");
CREATE INDEX "backtest_tenant_id_model_id_idx" ON "backtest"("tenant_id", "model_id");
CREATE INDEX "backtest_tenant_id_series_id_model_id_idx" ON "backtest"("tenant_id", "series_id", "model_id");
ALTER TABLE "backtest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backtest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "backtest"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "scenario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scenario_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "levers" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TEXT,
    "archived_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scenario_tenant_id_organization_id_scenario_key_key" ON "scenario"("tenant_id", "organization_id", "scenario_key");
CREATE INDEX "scenario_tenant_id_idx" ON "scenario"("tenant_id");
CREATE INDEX "scenario_tenant_id_organization_id_idx" ON "scenario"("tenant_id", "organization_id");
CREATE INDEX "scenario_tenant_id_status_idx" ON "scenario"("tenant_id", "status");
ALTER TABLE "scenario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scenario" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "scenario"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "simulation_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "scenario_key" TEXT NOT NULL,
    "scenario_version" INTEGER NOT NULL,
    "forecast_run_id" UUID NOT NULL,
    "forecast_run_digest" TEXT NOT NULL,
    "series_key" TEXT NOT NULL,
    "series_version" INTEGER NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "horizon" INTEGER NOT NULL,
    "levers" JSONB NOT NULL DEFAULT '[]',
    "varied_assumption_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "points" JSONB NOT NULL DEFAULT '[]',
    "total_baseline" DOUBLE PRECISION NOT NULL,
    "total_scenario" DOUBLE PRECISION NOT NULL,
    "total_delta" DOUBLE PRECISION NOT NULL,
    "peak_delta" DOUBLE PRECISION NOT NULL,
    "inherited_uncertainty" TEXT NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "unapplied_lever_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'completed',
    "superseded_by_run_id" UUID,
    "superseded_at" TEXT,
    "ran_by_user_id" UUID,
    "ran_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "simulation_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "simulation_run_tenant_id_idx" ON "simulation_run"("tenant_id");
CREATE INDEX "simulation_run_tenant_id_organization_id_idx" ON "simulation_run"("tenant_id", "organization_id");
CREATE INDEX "simulation_run_tenant_id_scenario_id_idx" ON "simulation_run"("tenant_id", "scenario_id");
CREATE INDEX "simulation_run_tenant_id_forecast_run_id_idx" ON "simulation_run"("tenant_id", "forecast_run_id");
CREATE INDEX "simulation_run_tenant_id_status_idx" ON "simulation_run"("tenant_id", "status");
ALTER TABLE "simulation_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "simulation_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "simulation_run"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "strategic_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_period" INTEGER NOT NULL,
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "metric_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "progress" JSONB NOT NULL DEFAULT '[]',
    "reviews" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activated_by_user_id" UUID,
    "activated_at" TEXT,
    "closed_by_user_id" UUID,
    "closed_at" TEXT,
    "abandonment_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "strategic_plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "strategic_plan_tenant_id_organization_id_plan_key_key" ON "strategic_plan"("tenant_id", "organization_id", "plan_key");
CREATE INDEX "strategic_plan_tenant_id_idx" ON "strategic_plan"("tenant_id");
CREATE INDEX "strategic_plan_tenant_id_organization_id_idx" ON "strategic_plan"("tenant_id", "organization_id");
CREATE INDEX "strategic_plan_tenant_id_status_idx" ON "strategic_plan"("tenant_id", "status");
-- GIN index over the normalized objective metric keys: `metric_keys @> ARRAY[$key]`
-- (Prisma `has`) finds every plan tracking a metric whose series has just moved.
CREATE INDEX "strategic_plan_metric_keys_idx" ON "strategic_plan" USING GIN ("metric_keys");
ALTER TABLE "strategic_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "strategic_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "strategic_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
