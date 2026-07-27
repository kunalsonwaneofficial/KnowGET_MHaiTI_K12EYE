-- Institutional Decision Intelligence, Workflow Orchestration & Autonomous Operations (P2-D27). Six
-- tenant-owned tables: decision_recommendation, decision_record, workflow_definition, workflow_instance,
-- automation_rule and automation_run. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This is the
-- decision layer of the intelligence core (Program E), built on the AI runtime P2-D26 laid down: this contract
-- decides what should be done and whether it may be done unattended, and reaches the institution only through
-- catalogued capabilities — nothing here names a table, a query or a connection.
--
-- Three rules of the contract are structural in this schema rather than procedural.
--
-- First, only low-risk actions may execute unattended. The gate's verdict is taken before a firing exists and
-- is stored on it — automation_run.disposition with automation_run.reasons (TEXT[], stable codes) — and the
-- referral queue is exactly the rows in status 'awaiting_approval', which is why approved_by_user_id and
-- rejected_by_user_id are columns rather than an audit-log lookup. decision_record carries the same pair
-- (autonomy_reasons, disposition) for a decision a person took.
--
-- Second, a recommendation ships with its evidence chain. decision_recommendation.evidence (JSONB) holds the
-- citations — source, ref, strength, what each rests on — inside the aggregate, and confidence is derived from
-- that chain's weakest link, never asserted. A decision snapshots what it rested on in evidence_ids (TEXT[])
-- and confidence_at_decision, because the chain may grow afterwards and the grounds a decision was taken on
-- may not.
--
-- Third, automation carries a way back. compensation_state on both decision_record and automation_run is
-- derived by the reversal engine from the action and how far execution got, and 'available' is precisely the
-- outstanding-compensation sweep — hence the index on (tenant_id, compensation_state) on both tables. The
-- compensating capability itself is named inside the action JSONB and checked against the D26 catalog when the
-- reversal is claimed.
--
-- A workflow key does not identify a workflow; a key and a version do, because revising a published process
-- creates a new draft beside it rather than editing the one cases are running under. So the unique is on
-- (tenant_id, key, version) and there is no unique on key alone. Ordered children live inside their aggregate
-- as JSONB — workflow_definition.stages, workflow_instance.stage_runs, automation_rule.conditions,
-- automation_run.observed_facts — because every invariant worth having across them (a sound dependency graph,
-- a stage that may only begin once its predecessors settled) is unenforceable from a row that can be written on
-- its own. observed_facts holds only the operands of the comparisons the rule made, never the whole signal
-- payload: a firing has to be explainable months later, and the honest minimum for that is what was compared.
--
-- Types follow the data: version, workflow_version and the confidence scores are INTEGER, reasons /
-- autonomy_reasons / evidence_ids are TEXT[], every ISO stamp the domain owns (resolved_at, expires_at,
-- decided_at, published_at, started_at, fired_at, settled_at, compensated_at and the rest) is TEXT, and
-- created_at/updated_at stay platform TIMESTAMP columns. subject_id is TEXT rather than UUID throughout: it is
-- the opaque id of a record in another domain, named but never re-modelled here.
--
-- The model is DecisionRecommendation rather than Recommendation because P2-D11 already owns `recommendation` —
-- a learner-scoped suggestion, a different thing about a different subject.
--
-- Four of the six tables have no delete path anywhere above them. A recommendation is the record of what was
-- proposed (and a rejected one the record that somebody looked and said no), a decision of what was chosen, a
-- case of what was done about one subject stage by stage, and a run of what the platform did while nobody was
-- watching. Only definitions carry deleted_at: a draft workflow version and an editable rule are things an
-- institution maintains, and both have a lifecycle exit — retired — for once they have been in use.

-- ---------------------------------------------------------------------------------
CREATE TABLE "decision_recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "subject_domain" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "impact_band" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "requires_human_judgement" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "proposed_by_user_id" UUID,
    "raised_by_rule_id" UUID,
    "resolved_by_user_id" UUID,
    "resolved_at" TEXT,
    "resolution_note" TEXT,
    "superseded_by_id" UUID,
    "expires_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "decision_recommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decision_recommendation_tenant_id_idx" ON "decision_recommendation"("tenant_id");
CREATE INDEX "decision_recommendation_tenant_id_organization_id_idx" ON "decision_recommendation"("tenant_id", "organization_id");
CREATE INDEX "decision_recommendation_tenant_id_status_idx" ON "decision_recommendation"("tenant_id", "status");
CREATE INDEX "decision_recommendation_tenant_id_subject_domain_subject_id_idx" ON "decision_recommendation"("tenant_id", "subject_domain", "subject_id");
ALTER TABLE "decision_recommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "decision_recommendation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "decision_recommendation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "decision_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "disposition" TEXT NOT NULL,
    "decided_by_user_id" UUID,
    "decided_at" TEXT NOT NULL,
    "decision_note" TEXT,
    "confidence_at_decision" INTEGER NOT NULL DEFAULT 0,
    "risk_level_at_decision" TEXT NOT NULL,
    "impact_band_at_decision" TEXT NOT NULL,
    "evidence_ids" TEXT[],
    "autonomy_reasons" TEXT[],
    "action" JSONB,
    "execution_outcome" TEXT NOT NULL DEFAULT 'not_started',
    "execution_ref" TEXT,
    "execution_requested_at" TEXT,
    "execution_settled_at" TEXT,
    "execution_error" TEXT,
    "compensation_state" TEXT NOT NULL DEFAULT 'not_required',
    "compensation_ref" TEXT,
    "compensated_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "decision_record_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decision_record_tenant_id_idx" ON "decision_record"("tenant_id");
CREATE INDEX "decision_record_tenant_id_organization_id_idx" ON "decision_record"("tenant_id", "organization_id");
CREATE INDEX "decision_record_tenant_id_recommendation_id_idx" ON "decision_record"("tenant_id", "recommendation_id");
CREATE INDEX "decision_record_tenant_id_compensation_state_idx" ON "decision_record"("tenant_id", "compensation_state");
ALTER TABLE "decision_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "decision_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "decision_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "workflow_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "trigger_signal_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "stages" JSONB NOT NULL DEFAULT '[]',
    "published_at" TEXT,
    "published_by_user_id" UUID,
    "retired_at" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "workflow_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_definition_tenant_id_key_version_key" ON "workflow_definition"("tenant_id", "key", "version");
CREATE INDEX "workflow_definition_tenant_id_idx" ON "workflow_definition"("tenant_id");
CREATE INDEX "workflow_definition_tenant_id_organization_id_idx" ON "workflow_definition"("tenant_id", "organization_id");
CREATE INDEX "workflow_definition_tenant_id_key_idx" ON "workflow_definition"("tenant_id", "key");
CREATE INDEX "workflow_definition_tenant_id_status_idx" ON "workflow_definition"("tenant_id", "status");
CREATE INDEX "workflow_definition_tenant_id_trigger_signal_key_idx" ON "workflow_definition"("tenant_id", "trigger_signal_key");
ALTER TABLE "workflow_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "workflow_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "workflow_instance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "workflow_key" TEXT NOT NULL,
    "workflow_version" INTEGER NOT NULL,
    "subject_domain" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggered_by_user_id" UUID,
    "triggered_by_rule_id" UUID,
    "recommendation_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stage_runs" JSONB NOT NULL DEFAULT '[]',
    "started_at" TEXT NOT NULL,
    "settled_at" TEXT,
    "failure_stage_key" TEXT,
    "failure_error" TEXT,
    "cancelled_by_user_id" UUID,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "workflow_instance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_instance_tenant_id_idx" ON "workflow_instance"("tenant_id");
CREATE INDEX "workflow_instance_tenant_id_organization_id_idx" ON "workflow_instance"("tenant_id", "organization_id");
CREATE INDEX "workflow_instance_tenant_id_workflow_id_idx" ON "workflow_instance"("tenant_id", "workflow_id");
CREATE INDEX "workflow_instance_tenant_id_status_idx" ON "workflow_instance"("tenant_id", "status");
CREATE INDEX "workflow_instance_tenant_id_subject_domain_subject_id_idx" ON "workflow_instance"("tenant_id", "subject_domain", "subject_id");
ALTER TABLE "workflow_instance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_instance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "workflow_instance"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "automation_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "signal_key" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "action" JSONB NOT NULL,
    "autonomy_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_user_id" UUID,
    "activated_at" TEXT,
    "activated_by_user_id" UUID,
    "paused_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "automation_rule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_rule_tenant_id_key_key" ON "automation_rule"("tenant_id", "key");
CREATE INDEX "automation_rule_tenant_id_idx" ON "automation_rule"("tenant_id");
CREATE INDEX "automation_rule_tenant_id_organization_id_idx" ON "automation_rule"("tenant_id", "organization_id");
CREATE INDEX "automation_rule_tenant_id_status_idx" ON "automation_rule"("tenant_id", "status");
CREATE INDEX "automation_rule_tenant_id_signal_key_status_idx" ON "automation_rule"("tenant_id", "signal_key", "status");
ALTER TABLE "automation_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "automation_rule"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "automation_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "signal_key" TEXT NOT NULL,
    "subject_domain" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "recommendation_id" UUID,
    "action" JSONB NOT NULL,
    "autonomy_mode" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "reasons" TEXT[],
    "observed_facts" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'gated',
    "approved_by_user_id" UUID,
    "approved_at" TEXT,
    "approval_note" TEXT,
    "rejected_by_user_id" UUID,
    "rejected_at" TEXT,
    "rejection_reason" TEXT,
    "execution_ref" TEXT,
    "execution_requested_at" TEXT,
    "execution_error" TEXT,
    "compensation_state" TEXT NOT NULL DEFAULT 'not_required',
    "compensation_ref" TEXT,
    "compensated_at" TEXT,
    "fired_at" TEXT NOT NULL,
    "settled_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "automation_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_run_tenant_id_idx" ON "automation_run"("tenant_id");
CREATE INDEX "automation_run_tenant_id_organization_id_idx" ON "automation_run"("tenant_id", "organization_id");
CREATE INDEX "automation_run_tenant_id_rule_id_idx" ON "automation_run"("tenant_id", "rule_id");
CREATE INDEX "automation_run_tenant_id_status_idx" ON "automation_run"("tenant_id", "status");
CREATE INDEX "automation_run_tenant_id_compensation_state_idx" ON "automation_run"("tenant_id", "compensation_state");
CREATE INDEX "automation_run_tenant_id_subject_domain_subject_id_idx" ON "automation_run"("tenant_id", "subject_domain", "subject_id");
ALTER TABLE "automation_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_run" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "automation_run"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
