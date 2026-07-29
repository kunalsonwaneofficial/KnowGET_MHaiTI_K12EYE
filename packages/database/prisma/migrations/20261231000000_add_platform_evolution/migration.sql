-- Platform Evolution, Institutional Learning & Continuous Improvement (P2-D30). Seven tenant-owned tables:
-- improvement_signal, improvement_initiative, governance_decision, lesson, improvement_cycle,
-- maturity_assessment and adoption_review. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the
-- standard tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). This is the
-- contract that closes the loop: twenty-nine contracts recorded what the institution does and one told
-- leadership how it is faring, and none of them records what the institution changed as a result, who agreed to
-- it, whether it worked, or what was learned when it did not.
--
-- The contract's two rules are structural here wherever a schema can carry a rule. Lessons feed institutional
-- memory; evolution always requires human governance. Nothing self-modifies and nothing self-deploys: an
-- initiative cannot reach approved, leave pilot, or be reverted, and a cycle cannot close, except behind a
-- settled gate on governance_decision, and every gate names the people who cast a ballot at it.
--
-- governance_decision is the load-bearing table of the contract and the one that would be easiest to get
-- subtly wrong. `initiative_id` names an improvement initiative at the approval, pilot_exit and reversion gates
-- and an improvement cycle at cycle_closure — one column either way, because the gate column says which kind of
-- record it names and nothing dereferences it blind. There is deliberately no foreign key: a gate outlives
-- neither subject, but pointing at two tables from one column is what a polymorphic reference is, and a
-- constraint that could only be declared against one of them would be a constraint that lies about the other.
-- `change_class` and `proposed_by` are COPIED from the subject at convocation rather than joined at read time,
-- so the quorum a gate faced and the ballot it must refuse stay true even if the subject is amended afterwards;
-- a gate whose recorded quorum could drift is not a record of a decision, it is a record of today's rules
-- applied to yesterday's vote.
--
-- One unique is PARTIAL, which is why it is here and not in the Prisma schema (like RLS, a migration-only DB
-- feature). One gate of a kind may stand open against a subject at a time:
-- UNIQUE (tenant_id, initiative_id, gate) WHERE outcome = 'pending'. Settled gates keep their row, because a
-- reversion convened after an earlier gate settled is a second decision and not a re-run of the first, and a
-- total unique would make the institution's second thoughts unrecordable.
--
-- The other five uniques are TOTAL, and each is total for the same reason stated differently. (tenant_id,
-- signal_key), (tenant_id, initiative_key) and (tenant_id, cycle_key) hold across every terminal status
-- including declined, withdrawn and abandoned, because a lineage trace resolves through a key and re-issuing
-- one under a new meaning is how a citation comes to point at the wrong thing. (tenant_id, lesson_key) holds
-- superseded lessons included: a lesson the institution has moved past stays readable exactly as it was, and a
-- reference written against the old conclusion still has to land. (tenant_id, assessment_key) holds published
-- assessments included, because a series that could reissue a key would let a later reading overwrite the
-- comparison it was supposed to be measured against. (tenant_id, initiative_id, review_period) is the adoption
-- review's identity — how far after adoption the institution looked — and a second look at the same distance
-- is a correction to the first rather than a new finding.
--
-- Ordered and bounded children live inside their aggregate as JSONB — improvement_signal.accounts and
-- .citations, governance_decision.ballots, improvement_initiative.originating_signal_ids, lesson.areas,
-- maturity_assessment.weights and .areas, adoption_review.benefits — because every invariant worth having
-- across them is unenforceable from a row that can be written on its own. A signal's derived priority is a
-- function of exactly its account list; a gate's counts are a function of exactly its ballot list; a maturity
-- index is a weighted mean over exactly its readings. Splitting any of those into a child table would let a
-- row arrive that changes the parent's derived answer without the parent being rewritten, and the stored answer
-- would be quietly wrong rather than visibly so.
--
-- Derived values are stored rather than recomputed on read, in three places, for one reason. improvement_signal
-- .priority, maturity_assessment.index / level / coverage and adoption_review.verdict / worst_band were decided
-- against platform constants — priority floors, coverage floors, variance bands — that can move between
-- releases. A recomputed value would silently rewrite what the institution was told at the time, which is
-- precisely the failure this contract exists to prevent: an improvement record whose history changes under it
-- cannot be used to judge whether improving worked.
--
-- Nullability carries meaning rather than tidiness. improvement_signal.raised_by is NULL for an anonymous
-- filing, which the intake engine then counts as unattributed and refuses to let corroborate.
-- adoption_review.worst_band is NULL rather than a band when nothing could be measured, which is why
-- benefits_measured and benefits_claimed are separate columns: a review that claimed four benefits and measured
-- none is inconclusive, and a reader who saw one count could not tell that from a review that claimed nothing.
-- lesson.retained_at_period is NULL until a lesson actually reaches memory, and review falls due by subtraction
-- from it. improvement_initiative.proposed_by and improvement_cycle.opened_by are NOT NULL, because the rule
-- that nobody approves their own proposal has nothing to check against without them.
--
-- Types follow the data: every period, ordinal, span and count is INTEGER; the maturity index and coverage and
-- the benefit ratios inside JSONB are DOUBLE PRECISION; self_evident, publishable and refused are BOOLEAN;
-- every ISO stamp the domain owns (triaged_at, settled_at, submitted_at, review_started_at, approved_at,
-- pilot_started_at, convoked_at, retained_at, superseded_at, execution_started_at, published_at, opened_at,
-- concluded_at) is TEXT, and created_at/updated_at stay platform TIMESTAMP columns. Every period is an ordinal
-- on the caller's grid and never a date: this domain holds no clock, so a pilot's length, a cycle's span and a
-- lesson's review standing are all subtraction, and they give the same answer read years later.
--
-- No table here carries deleted_at, and no repository declares a delete. A signal is triaged, merged or
-- declined; an initiative is rejected or withdrawn; a gate settles satisfied or refused; a lesson is superseded;
-- a cycle is closed or abandoned; an assessment is published; a review is concluded. Every one of those leaves
-- the record of what was raised, agreed, tried and learned — which is what makes the first rule worth anything,
-- because an institution that can delete the change that failed has not learned from it, it has only stopped
-- being able to say that it happened.

-- ---------------------------------------------------------------------------------
CREATE TABLE "improvement_signal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "signal_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'raised',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "corroboration" INTEGER NOT NULL DEFAULT 0,
    "repeat_accounts" INTEGER NOT NULL DEFAULT 0,
    "unattributed" INTEGER NOT NULL DEFAULT 0,
    "self_evident" BOOLEAN NOT NULL DEFAULT false,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "accounts" JSONB NOT NULL DEFAULT '[]',
    "raised_by" UUID,
    "triaged_at" TEXT,
    "triaged_by" UUID,
    "settled_at" TEXT,
    "settled_by" UUID,
    "merged_into_signal_id" UUID,
    "decline_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "improvement_signal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "improvement_signal_tenant_id_signal_key_key" ON "improvement_signal"("tenant_id", "signal_key");
CREATE INDEX "improvement_signal_tenant_id_idx" ON "improvement_signal"("tenant_id");
CREATE INDEX "improvement_signal_tenant_id_organization_id_idx" ON "improvement_signal"("tenant_id", "organization_id");
CREATE INDEX "improvement_signal_tenant_id_organization_id_status_idx" ON "improvement_signal"("tenant_id", "organization_id", "status");
CREATE INDEX "improvement_signal_tenant_id_priority_idx" ON "improvement_signal"("tenant_id", "priority");
CREATE INDEX "improvement_signal_tenant_id_merged_into_signal_id_idx" ON "improvement_signal"("tenant_id", "merged_into_signal_id");
ALTER TABLE "improvement_signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "improvement_signal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "improvement_signal"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "improvement_initiative" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "initiative_key" TEXT NOT NULL,
    "change_class" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "originating_signal_ids" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "proposed_by" UUID NOT NULL,
    "submitted_at" TEXT,
    "review_started_at" TEXT,
    "approved_at" TEXT,
    "pilot_started_at" TEXT,
    "pilot_started_period" INTEGER,
    "settled_at" TEXT,
    "settled_by" UUID,
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "improvement_initiative_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "improvement_initiative_tenant_id_initiative_key_key" ON "improvement_initiative"("tenant_id", "initiative_key");
CREATE INDEX "improvement_initiative_tenant_id_idx" ON "improvement_initiative"("tenant_id");
CREATE INDEX "improvement_initiative_tenant_id_organization_id_idx" ON "improvement_initiative"("tenant_id", "organization_id");
CREATE INDEX "improvement_initiative_tenant_id_organization_id_status_idx" ON "improvement_initiative"("tenant_id", "organization_id", "status");
CREATE INDEX "improvement_initiative_tenant_id_proposed_by_idx" ON "improvement_initiative"("tenant_id", "proposed_by");
ALTER TABLE "improvement_initiative" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "improvement_initiative" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "improvement_initiative"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "governance_decision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "gate" TEXT NOT NULL,
    "change_class" TEXT NOT NULL,
    "proposed_by" UUID NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "required" INTEGER NOT NULL,
    "affirmed" INTEGER NOT NULL DEFAULT 0,
    "outstanding" INTEGER NOT NULL,
    "conditional" INTEGER NOT NULL DEFAULT 0,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "deferrals" INTEGER NOT NULL DEFAULT 0,
    "ballots" JSONB NOT NULL DEFAULT '[]',
    "convoked_at" TEXT NOT NULL,
    "convoked_by" UUID,
    "settled_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "governance_decision_pkey" PRIMARY KEY ("id")
);
-- PARTIAL. One gate of a kind stands open against a subject at a time. Settled gates keep their row: a
-- reversion convened after an earlier gate settled is a second decision, not a re-run of the first.
CREATE UNIQUE INDEX "governance_decision_open_gate_key" ON "governance_decision"("tenant_id", "initiative_id", "gate") WHERE "outcome" = 'pending';
CREATE INDEX "governance_decision_tenant_id_idx" ON "governance_decision"("tenant_id");
CREATE INDEX "governance_decision_tenant_id_organization_id_idx" ON "governance_decision"("tenant_id", "organization_id");
CREATE INDEX "governance_decision_tenant_id_initiative_id_idx" ON "governance_decision"("tenant_id", "initiative_id");
CREATE INDEX "governance_decision_tenant_id_initiative_id_gate_idx" ON "governance_decision"("tenant_id", "initiative_id", "gate");
CREATE INDEX "governance_decision_tenant_id_outcome_idx" ON "governance_decision"("tenant_id", "outcome");
ALTER TABLE "governance_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "governance_decision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "governance_decision"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "lesson" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lesson_key" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "origin_ref" TEXT NOT NULL,
    "retention" TEXT NOT NULL DEFAULT 'provisional',
    "areas" JSONB NOT NULL DEFAULT '[]',
    "retained_at_period" INTEGER,
    "recorded_by" UUID,
    "retained_at" TEXT,
    "superseded_at" TEXT,
    "superseding_lesson_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_tenant_id_lesson_key_key" ON "lesson"("tenant_id", "lesson_key");
CREATE INDEX "lesson_tenant_id_idx" ON "lesson"("tenant_id");
CREATE INDEX "lesson_tenant_id_organization_id_idx" ON "lesson"("tenant_id", "organization_id");
CREATE INDEX "lesson_tenant_id_organization_id_retention_idx" ON "lesson"("tenant_id", "organization_id", "retention");
CREATE INDEX "lesson_tenant_id_origin_origin_ref_idx" ON "lesson"("tenant_id", "origin", "origin_ref");
ALTER TABLE "lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lesson"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "improvement_cycle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cycle_key" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'planned',
    "start_period" INTEGER NOT NULL,
    "end_period" INTEGER NOT NULL,
    "periods" INTEGER NOT NULL,
    "lessons_recorded" INTEGER NOT NULL DEFAULT 0,
    "opened_by" UUID NOT NULL,
    "execution_started_at" TEXT,
    "review_started_at" TEXT,
    "settled_at" TEXT,
    "settled_by" UUID,
    "abandonment_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "improvement_cycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "improvement_cycle_tenant_id_cycle_key_key" ON "improvement_cycle"("tenant_id", "cycle_key");
CREATE INDEX "improvement_cycle_tenant_id_idx" ON "improvement_cycle"("tenant_id");
CREATE INDEX "improvement_cycle_tenant_id_organization_id_idx" ON "improvement_cycle"("tenant_id", "organization_id");
CREATE INDEX "improvement_cycle_tenant_id_organization_id_stage_idx" ON "improvement_cycle"("tenant_id", "organization_id", "stage");
CREATE INDEX "improvement_cycle_tenant_id_start_period_end_period_idx" ON "improvement_cycle"("tenant_id", "start_period", "end_period");
ALTER TABLE "improvement_cycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "improvement_cycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "improvement_cycle"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "maturity_assessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assessment_key" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "weights" JSONB NOT NULL DEFAULT '[]',
    "areas" JSONB NOT NULL DEFAULT '[]',
    "publishable" BOOLEAN NOT NULL DEFAULT false,
    "index" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "areas_reported" INTEGER NOT NULL DEFAULT 0,
    "opened_by" UUID NOT NULL,
    "published_at" TEXT,
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "maturity_assessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "maturity_assessment_tenant_id_assessment_key_key" ON "maturity_assessment"("tenant_id", "assessment_key");
CREATE INDEX "maturity_assessment_tenant_id_idx" ON "maturity_assessment"("tenant_id");
CREATE INDEX "maturity_assessment_tenant_id_organization_id_idx" ON "maturity_assessment"("tenant_id", "organization_id");
CREATE INDEX "maturity_assessment_tenant_id_organization_id_period_idx" ON "maturity_assessment"("tenant_id", "organization_id", "period");
CREATE INDEX "maturity_assessment_tenant_id_published_at_idx" ON "maturity_assessment"("tenant_id", "published_at");
ALTER TABLE "maturity_assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maturity_assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "maturity_assessment"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "adoption_review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "review_period" INTEGER NOT NULL,
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "verdict" TEXT NOT NULL DEFAULT 'inconclusive',
    "worst_band" TEXT,
    "benefits_measured" INTEGER NOT NULL DEFAULT 0,
    "benefits_claimed" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TEXT NOT NULL,
    "opened_by" UUID NOT NULL,
    "concluded_at" TEXT,
    "concluded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "adoption_review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "adoption_review_tenant_id_initiative_id_review_period_key" ON "adoption_review"("tenant_id", "initiative_id", "review_period");
CREATE INDEX "adoption_review_tenant_id_idx" ON "adoption_review"("tenant_id");
CREATE INDEX "adoption_review_tenant_id_organization_id_idx" ON "adoption_review"("tenant_id", "organization_id");
CREATE INDEX "adoption_review_tenant_id_initiative_id_idx" ON "adoption_review"("tenant_id", "initiative_id");
CREATE INDEX "adoption_review_tenant_id_verdict_idx" ON "adoption_review"("tenant_id", "verdict");
CREATE INDEX "adoption_review_tenant_id_concluded_at_idx" ON "adoption_review"("tenant_id", "concluded_at");
ALTER TABLE "adoption_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_review" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "adoption_review"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
