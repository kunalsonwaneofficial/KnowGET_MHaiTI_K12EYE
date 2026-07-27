-- Enterprise AI Operating System, Agent Orchestration & Reasoning (P2-D26). Six tenant-owned tables:
-- agent_definition, tool_definition, execution_plan, approval_request, tool_invocation and reasoning_session.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both
-- USING and WITH CHECK, fail-closed on an unset tenant). This is the AI runtime of the intelligence core
-- (Program E), built on the semantic layer P2-D25 laid down: agents reach the institution only through
-- catalogued capabilities — nothing in this contract names a table, a query or a connection — and retrieved
-- knowledge only ever originates from the knowledge graph. External AI providers are reached through the
-- Phase-3 integration adapter (P3-D09); the AI OS never calls a provider directly, so no provider, credential
-- or model column appears here.
--
-- The agent registry carries its whole reach in granted_capability_keys (TEXT[]) — a grant is a key, checked
-- against the catalog on every invocation. The catalog carries the risk classification the authorization
-- engine reads (effect, risk_level, reversibility) and the compensation_key a rollback reaches for.
-- Execution plans and reasoning sessions keep their ordered children (steps, traces) inside the aggregate as
-- JSONB, loaded and saved whole: a step has no meaning outside the plan that sequences it, and a trace none
-- outside the session that reasoned it. Invocations record the authorization that let them exist, the approval
-- that unblocked them, the ordinal a rollback reverses by, and a stable failure_code — never a message, never a
-- payload. Types follow the data: ordinal is INTEGER, reasons and authorization_reasons are TEXT[], every ISO
-- stamp the domain owns (expires_at, decided_at, inspected_at, started_at, settled_at, concluded_at) is TEXT,
-- and created_at/updated_at stay platform TIMESTAMP columns.
--
-- approval_request.subject_id is TEXT rather than UUID on purpose: an invocation-level gate stands in front of
-- the composite agent:capability[:step] an approval is granted for, not in front of a row. That composite is
-- what makes an approval non-transferable.
--
-- Three of the six tables have no delete path anywhere above them: an approval is the record of who allowed
-- what, an invocation of what an agent did to an institution, and a session of why. None of the three is a
-- draft, so none is discardable.

-- ---------------------------------------------------------------------------------
CREATE TABLE "agent_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "autonomy_level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "granted_capability_keys" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "agent_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_definition_tenant_id_key_key" ON "agent_definition"("tenant_id", "key");
CREATE INDEX "agent_definition_tenant_id_idx" ON "agent_definition"("tenant_id");
CREATE INDEX "agent_definition_tenant_id_organization_id_idx" ON "agent_definition"("tenant_id", "organization_id");
CREATE INDEX "agent_definition_tenant_id_status_idx" ON "agent_definition"("tenant_id", "status");
ALTER TABLE "agent_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "agent_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "tool_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capability_domain" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "reversibility" TEXT NOT NULL,
    "compensation_key" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "tool_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tool_definition_tenant_id_key_key" ON "tool_definition"("tenant_id", "key");
CREATE INDEX "tool_definition_tenant_id_idx" ON "tool_definition"("tenant_id");
CREATE INDEX "tool_definition_tenant_id_organization_id_idx" ON "tool_definition"("tenant_id", "organization_id");
CREATE INDEX "tool_definition_tenant_id_capability_domain_idx" ON "tool_definition"("tenant_id", "capability_domain");
ALTER TABLE "tool_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tool_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "execution_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "reasoning_session_id" UUID,
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafted',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approval_request_id" UUID,
    "inspected_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "execution_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "execution_plan_tenant_id_idx" ON "execution_plan"("tenant_id");
CREATE INDEX "execution_plan_tenant_id_organization_id_idx" ON "execution_plan"("tenant_id", "organization_id");
CREATE INDEX "execution_plan_tenant_id_agent_id_idx" ON "execution_plan"("tenant_id", "agent_id");
CREATE INDEX "execution_plan_tenant_id_status_idx" ON "execution_plan"("tenant_id", "status");
ALTER TABLE "execution_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "execution_plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "execution_plan"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "approval_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "capability_key" TEXT,
    "reasons" TEXT[],
    "risk_level" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decided_by_user_id" UUID,
    "decided_at" TEXT,
    "decision_note" TEXT,
    "expires_at" TEXT,
    -- consumed_at + consumed_by_invocation_id make the gate single-use. A granted request authorizes an invocation
    -- only while consumed_at IS NULL; spending it stamps both. Nullable and unconstrained by a foreign key, because
    -- the invocation is written after the grant is spent (spend-then-record fails closed).
    "consumed_at" TEXT,
    "consumed_by_invocation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_request_tenant_id_idx" ON "approval_request"("tenant_id");
CREATE INDEX "approval_request_tenant_id_organization_id_idx" ON "approval_request"("tenant_id", "organization_id");
CREATE INDEX "approval_request_tenant_id_subject_subject_id_idx" ON "approval_request"("tenant_id", "subject", "subject_id");
CREATE INDEX "approval_request_tenant_id_decision_idx" ON "approval_request"("tenant_id", "decision");
ALTER TABLE "approval_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "approval_request"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "tool_invocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "plan_id" UUID,
    "step_id" UUID,
    "capability_key" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 1,
    "risk_level" TEXT NOT NULL,
    "reversibility" TEXT NOT NULL,
    "compensation_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'authorized',
    "authorization_outcome" TEXT NOT NULL,
    "authorization_reasons" TEXT[],
    "approval_request_id" UUID,
    "compensated_by_invocation_id" UUID,
    "failure_code" TEXT,
    "started_at" TEXT,
    "settled_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "tool_invocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_invocation_tenant_id_idx" ON "tool_invocation"("tenant_id");
CREATE INDEX "tool_invocation_tenant_id_organization_id_idx" ON "tool_invocation"("tenant_id", "organization_id");
CREATE INDEX "tool_invocation_tenant_id_agent_id_idx" ON "tool_invocation"("tenant_id", "agent_id");
CREATE INDEX "tool_invocation_tenant_id_plan_id_idx" ON "tool_invocation"("tenant_id", "plan_id");
CREATE INDEX "tool_invocation_tenant_id_capability_key_idx" ON "tool_invocation"("tenant_id", "capability_key");
ALTER TABLE "tool_invocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_invocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tool_invocation"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "reasoning_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "traces" JSONB NOT NULL DEFAULT '[]',
    "execution_plan_id" UUID,
    "conclusion" TEXT,
    "concluded_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "reasoning_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reasoning_session_tenant_id_idx" ON "reasoning_session"("tenant_id");
CREATE INDEX "reasoning_session_tenant_id_organization_id_idx" ON "reasoning_session"("tenant_id", "organization_id");
CREATE INDEX "reasoning_session_tenant_id_agent_id_idx" ON "reasoning_session"("tenant_id", "agent_id");
CREATE INDEX "reasoning_session_tenant_id_status_idx" ON "reasoning_session"("tenant_id", "status");
ALTER TABLE "reasoning_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reasoning_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reasoning_session"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
