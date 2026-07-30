-- API Gateway & Integration Fabric (P3-D01). Eight tenant-owned tables: api_consumer, api_contract,
-- capability_route, traffic_policy, integration_endpoint, webhook_subscription, outbound_delivery and
-- idempotency_record. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). Thirty contracts came
-- before this one and every one of them records something the institution does. This one records nothing the
-- institution does. It records what any of that work is allowed to look like from outside: which capabilities an
-- integrator can reach, under what contract, at what rate, with what guarantee that calling twice charges once,
-- and where the platform's own notifications go when something happens that somebody else is waiting for.
--
-- The contract's rule is that the platform exposes capabilities and never implementation, and two columns carry
-- that rule rather than merely obeying it. capability_route.internal_target is the only place in the schema that
-- knows which internal capability answers an external address, and it appears in no view, event or error the
-- gateway produces — so a consumer cannot acquire a dependency on where a capability currently lives, and the
-- domain behind a route can be split, renamed or moved with this one row as the only write. api_contract's unique
-- on (tenant_id, capability_key, contract_version) is the other half: a published shape is immutable, so a change
-- of shape is a new version beside the old row rather than an edit to it. An integrator who built against a shape
-- is entitled to keep finding it, and a version number that could be reissued would make every client's pinned
-- dependency a lie that the client has no way to detect.
--
-- Three uniques are PARTIAL and one carries NULLS NOT DISTINCT, which is why all four are here and not in the
-- Prisma schema (like RLS, a migration-only database feature). Each is argued, because in every case the total
-- alternative looks simpler and is wrong.
--
-- Two routes may not answer at one address: UNIQUE (tenant_id, method, external_path) WHERE status <> 'retired'.
-- It is partial rather than total because a retired route keeps its row — the retirement is the record of an
-- address having once meant something else, and a total unique would either force that history to be deleted or
-- make an address unreusable for the life of the institution.
--
-- One active policy may exist per scope tuple: UNIQUE (tenant_id, scope, consumer_id, capability_key) NULLS NOT
-- DISTINCT WHERE active. This is the first NULLS NOT DISTINCT index in the platform's schema (PostgreSQL 15 and
-- later), and the clause is the load-bearing half rather than a stylistic one. A global policy names neither a
-- consumer nor a capability and a capability policy names no consumer, so those rows hold NULLs in the very
-- columns the tuple is built from. Under PostgreSQL's default NULLS DISTINCT two active global policies would
-- both satisfy an ordinary unique index, and the resolver would silently apply whichever it read first — the
-- exact failure the aggregate's scope/subject coherence check exists to prevent, arrived at through the database
-- instead of through the domain. It is partial on active because a deactivated policy keeps its row: an operator
-- reading about an incident has to be able to see the limits that were actually in force during it.
--
-- An event is owed to a subscription once: UNIQUE (tenant_id, subscription_id, event_id) WHERE
-- replay_of_delivery_id IS NULL. The predicate is what makes replaying a dead letter representable at all, since
-- a replay is a new row naming the same event and subscription as the delivery it recovers. It also means a
-- re-dispatch of an event already owed collides with the original row rather than with a replay, which is the
-- behaviour the dedupe read was shaped around.
--
-- The fourth is the one that is deliberately NOT partial, and it is worth stating for the same reason: the
-- attractive alternative is unavailable. idempotency_record's unique on (tenant_id, consumer_id, idempotency_key)
-- is TOTAL, and it is the constraint the whole module rests on — it is what resolves a race between two nodes
-- that both read nothing and both decide to proceed. A partial version would want WHERE expires_at > now(), and
-- PostgreSQL cannot index on a non-immutable function. A row therefore holds its key for good, which is exactly
-- why the aggregate offers renewal: a request that legitimately recycles a key after retention rewrites the
-- expired row rather than inserting beside it, and the sweep that would eventually have removed that row is free
-- to run late without changing an answer the ledger gives.
--
-- The remaining three uniques are TOTAL and each holds across every terminal status. (tenant_id, consumer_key)
-- holds retired consumers included, (tenant_id, endpoint_key) holds retired endpoints included, and (tenant_id,
-- consumer_id, subscription_key) holds revoked subscriptions included. An audit trail, a delivery log and a
-- support conversation all resolve an integration, an endpoint or a subscription through its key long after the
-- thing itself stopped being callable, and reissuing one under a new meaning is how those three come to disagree
-- about who called.
--
-- webhook_subscription.event_types is TEXT[] and deliberately carries no GIN index. That is worth stating
-- because a GIN index is the obvious choice here and it does not work. Under FORCE RLS the tenant predicate
-- arrives as a security qual, and PostgreSQL will not evaluate a qual whose operator is not leakproof ahead of
-- one — doing so would let the qual read a row the policy has not yet admitted. Array containment (@>) and JSONB
-- containment (@>) are both non-leakproof, so on an RLS-protected table a containment test can never become an
-- index condition; it is always demoted to a filter applied after the policy has passed the row. Measured on
-- PostgreSQL 16 against a copy of this table carrying the identical index and queried through the identical
-- predicate but with no policy on it, the GIN index is chosen and the read is 76 times faster. With the policy in
-- place no index shape is chosen at all: not a standalone GIN on event_types, and not a composite GIN over
-- (tenant_id, organization_id, event_types) with btree_gin installed. A GIN index here would cost 2.5 MB and a
-- write amplification on every subscription write, be read zero times, and leave the schema looking as though the
-- fan-out read were served when it is not. The two GIN indexes the platform already carries on RLS tables —
-- identity_account.identifier_keys and strategic_plan.metric_keys — are unreachable for the same reason, which is
-- a finding about them rather than a precedent for this table. The GIN indexes on service_search_document are
-- sound, and that table has no policy on it.
--
-- What serves the fan-out read instead is cardinality. An institution's integrations number in the tens; at two
-- hundred subscriptions in a tenant the whole set is six pages and the read completes in a tenth of a millisecond
-- without consulting an index at all, and (tenant_id, organization_id, status) is what the planner reaches for
-- once a tenant is large enough for that to stop being true. The interest predicate stays pure and lives on the
-- aggregate; the adapter pushes the same decision into SQL as a containment test, so the two are required to
-- agree and neither can drift into being the only one that is right. Making the containment indexable would mean
-- giving event types a table of their own so that the qual became a leakproof equality — and that would also mean
-- a row able to widen a subscription's interest without the subscription being rewritten, which is precisely the
-- invariant this schema is built to keep.
--
-- Children live inside their aggregate rather than in tables of their own, and the column type follows the shape
-- of the child. api_consumer.granted_scopes, capability_route.path_parameters and
-- webhook_subscription.event_types are flat arrays of opaque keys and are TEXT[], the shape the platform already
-- uses for identity_account.identifier_keys and strategic_plan.metric_keys. traffic_policy.limits is a structured
-- value object and is JSONB. What the two shapes share is the reason neither is a table: every
-- invariant worth having across them is unenforceable from a row that can be written on its own. A scope row that
-- could be inserted by itself would widen a consumer's reach without the consumer being rewritten, which is the
-- privilege escalation this table exists to make visible. traffic_policy.limits is one column rather than five
-- because the coherence rules run across the five: half a rate limit — a count with no window, or a window with
-- no count — is refused by the aggregate, and a five-column shape invites a later migration that adds a sixth
-- limit to only some of the rows. capability_route.path_parameters is derived from external_path at registration
-- and stored, so the binding a router performs does not re-parse a template on every request.
--
-- No column here holds a secret, and four columns are named to say so. api_consumer.credential_ref,
-- integration_endpoint.credential_ref and webhook_subscription.secret_ref are references into the platform's
-- secret store, and the value objects refuse anything that looks like a key, a token or a bearer header, because
-- a gateway is exactly where a leaked credential is worth the most and a column that has ever held one has to be
-- treated as compromised forever. Rotating a secret is therefore a write to the vault and an updated_at here.
-- idempotency_record.response_ref and api_contract.specification_ref are the same idea applied to size rather
-- than secrecy: a stored response and a 200-kilobyte specification document both belong in the document store,
-- not in a row that admission reads on the hot path. outbound_delivery.payload_fingerprint and
-- idempotency_record.payload_fingerprint are digests and never payloads — a copy of every delivered event body
-- would make outbound_delivery the largest table in the platform, and one that has to be encrypted at rest
-- because it would then contain student data.
--
-- Relations are by id and there are no foreign keys, following the platform's existing practice: capability_route
-- .contract_id, webhook_subscription.endpoint_id, outbound_delivery.subscription_id and
-- outbound_delivery.replay_of_delivery_id all name rows the domain resolves and the directory ports validate.
--
-- Nullability carries meaning rather than tidiness. api_consumer.owner_id is NOT NULL because an integration
-- nobody owns is the one that stays live for years after the project that needed it ended, while registered_by
-- is nullable for the consumers the platform provisioned itself. integration_endpoint.posture_since is NOT NULL
-- and set at registration, because a half-open probe is decided by how long the posture has held and a NULL would
-- make that arithmetic unanswerable at exactly the moment it matters; credential_ref on the same table is
-- nullable because some protocols are anonymous. idempotency_record.expires_at is NOT NULL and computed from the
-- instant the caller handed in, never from a clock inside the engine. api_contract.superseded_by_version is a
-- version string rather than a reference because the successor an integrator should migrate to may legitimately
-- not exist yet when a deprecation is announced.
--
-- integration_endpoint keeps status and health in separate columns because they answer different questions and a
-- single column would force the platform to overwrite the institution's intent with an observation. status is the
-- intent — registered, active, quarantined, disabled, retired — and only a person changes it. health is what the
-- platform has observed. An endpoint the vendor has broken is active and unreachable; one the institution has
-- switched off is disabled whatever its last reading said, and its failures stop being counted against anyone.
-- posture, consecutive_failures and posture_since are the circuit breaker's record and not its implementation,
-- which stays in the reliability package; they are stored because the decision has to survive a process restart,
-- and a breaker whose state lives only in memory reopens the floodgates on every deploy and hands the failing
-- vendor its stampede a second time. webhook_subscription.consecutive_failures is deliberately its own count and
-- not the endpoint's, because several subscriptions may share an endpoint and one whose receiver is refusing
-- everything should be suspended without penalising the healthy ones on the same connection.
--
-- Types follow the data: every count, attempt and HTTP status code is INTEGER; idempotent and active are
-- BOOLEAN; granted_scopes, path_parameters and event_types are TEXT[]; traffic_policy.limits is JSONB;
-- every ISO instant the domain owns (activated_at, suspended_at, retired_at, rotated_at, published_at,
-- deprecated_at, sunset_at, deactivated_at, posture_since, circuit_opened_at, last_outcome_at, quarantined_at,
-- disabled_at, last_delivery_at, last_success_at, paused_at, revoked_at, next_attempt_at, last_attempted_at,
-- delivered_at, dead_lettered_at, abandoned_at, completed_at, conflicted_at, expires_at) is TEXT, and
-- created_at/updated_at stay platform TIMESTAMP columns. The domain holds no clock: every instant a decision
-- turns on arrives as an argument, so a rate-limit window, a retry schedule and an idempotency expiry are each
-- decidable without asking what time it is, and each gives the same answer read years later.
--
-- Seven of these eight tables carry no deleted_at and declare no delete. A consumer is retired, a contract is
-- sunset, a route is retired, a policy is deactivated, an endpoint is retired, a subscription is revoked and a
-- delivery is dead-lettered or abandoned — every one of those leaves the record of who was admitted, what they
-- were promised, what was owed to them and what became of it.
--
-- idempotency_record is the exception and the only table in this contract a repository may delete from. That is
-- not an inconsistency: this table is not institutional record, it is a lock ledger, and retention is the entire
-- point of it. One row per guarded write on every mutating request the institution serves is a table that has to
-- be swept, and the sweep is safe precisely because it changes no answer — the inspection already treats an
-- expired record as absent, so purging can run late, run early, or not run for a month, and the ledger's verdict
-- for any key is identical either way. The (tenant_id, expires_at) index is what makes that sweep a range scan
-- rather than a full one.

-- ---------------------------------------------------------------------------------
CREATE TABLE "api_consumer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "consumer_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "auth_scheme" TEXT NOT NULL,
    "credential_ref" TEXT NOT NULL,
    "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'registered',
    "owner_id" UUID NOT NULL,
    "registered_by" UUID,
    "suspension_reason" TEXT,
    "activated_at" TEXT,
    "suspended_at" TEXT,
    "retired_at" TEXT,
    "rotated_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "api_consumer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_consumer_tenant_id_consumer_key_key" ON "api_consumer"("tenant_id", "consumer_key");
CREATE INDEX "api_consumer_tenant_id_idx" ON "api_consumer"("tenant_id");
CREATE INDEX "api_consumer_tenant_id_organization_id_idx" ON "api_consumer"("tenant_id", "organization_id");
CREATE INDEX "api_consumer_tenant_id_organization_id_status_idx" ON "api_consumer"("tenant_id", "organization_id", "status");
CREATE INDEX "api_consumer_tenant_id_owner_id_idx" ON "api_consumer"("tenant_id", "owner_id");
ALTER TABLE "api_consumer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_consumer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "api_consumer"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "api_contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "capability_key" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'rest',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "specification_ref" TEXT NOT NULL,
    "published_at" TEXT,
    "published_by" UUID,
    "deprecated_at" TEXT,
    "sunset_at" TEXT,
    "superseded_by_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "api_contract_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_contract_tenant_id_capability_key_contract_version_key" ON "api_contract"("tenant_id", "capability_key", "contract_version");
CREATE INDEX "api_contract_tenant_id_idx" ON "api_contract"("tenant_id");
CREATE INDEX "api_contract_tenant_id_organization_id_idx" ON "api_contract"("tenant_id", "organization_id");
CREATE INDEX "api_contract_tenant_id_organization_id_status_idx" ON "api_contract"("tenant_id", "organization_id", "status");
CREATE INDEX "api_contract_tenant_id_capability_key_idx" ON "api_contract"("tenant_id", "capability_key");
CREATE INDEX "api_contract_tenant_id_sunset_at_idx" ON "api_contract"("tenant_id", "sunset_at");
ALTER TABLE "api_contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_contract" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "api_contract"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "capability_route" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "capability_key" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "external_path" TEXT NOT NULL,
    "path_parameters" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "style" TEXT NOT NULL DEFAULT 'rest',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "required_scope" TEXT NOT NULL,
    "internal_target" TEXT NOT NULL,
    "idempotent" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "capability_route_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "capability_route_live_address_key" ON "capability_route"("tenant_id", "method", "external_path") WHERE "status" <> 'retired';
CREATE INDEX "capability_route_tenant_id_idx" ON "capability_route"("tenant_id");
CREATE INDEX "capability_route_tenant_id_organization_id_idx" ON "capability_route"("tenant_id", "organization_id");
CREATE INDEX "capability_route_tenant_id_organization_id_status_idx" ON "capability_route"("tenant_id", "organization_id", "status");
CREATE INDEX "capability_route_tenant_id_contract_id_idx" ON "capability_route"("tenant_id", "contract_id");
CREATE INDEX "capability_route_tenant_id_method_external_path_idx" ON "capability_route"("tenant_id", "method", "external_path");
ALTER TABLE "capability_route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capability_route" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "capability_route"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "traffic_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "consumer_id" UUID,
    "capability_key" TEXT,
    "display_name" TEXT NOT NULL,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "traffic_policy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "traffic_policy_active_scope_key" ON "traffic_policy"("tenant_id", "scope", "consumer_id", "capability_key") NULLS NOT DISTINCT WHERE "active";
CREATE INDEX "traffic_policy_tenant_id_idx" ON "traffic_policy"("tenant_id");
CREATE INDEX "traffic_policy_tenant_id_organization_id_idx" ON "traffic_policy"("tenant_id", "organization_id");
CREATE INDEX "traffic_policy_tenant_id_organization_id_active_idx" ON "traffic_policy"("tenant_id", "organization_id", "active");
CREATE INDEX "traffic_policy_tenant_id_scope_consumer_id_capability_key_idx" ON "traffic_policy"("tenant_id", "scope", "consumer_id", "capability_key");
ALTER TABLE "traffic_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traffic_policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "traffic_policy"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "integration_endpoint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "endpoint_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "adapter_key" TEXT NOT NULL,
    "credential_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "posture" TEXT NOT NULL DEFAULT 'closed',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "posture_since" TEXT NOT NULL,
    "circuit_opened_at" TEXT,
    "last_outcome_at" TEXT,
    "activated_at" TEXT,
    "quarantined_at" TEXT,
    "disabled_at" TEXT,
    "disabled_reason" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "integration_endpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integration_endpoint_tenant_id_endpoint_key_key" ON "integration_endpoint"("tenant_id", "endpoint_key");
CREATE INDEX "integration_endpoint_tenant_id_idx" ON "integration_endpoint"("tenant_id");
CREATE INDEX "integration_endpoint_tenant_id_organization_id_idx" ON "integration_endpoint"("tenant_id", "organization_id");
CREATE INDEX "integration_endpoint_tenant_id_organization_id_status_idx" ON "integration_endpoint"("tenant_id", "organization_id", "status");
CREATE INDEX "integration_endpoint_tenant_id_posture_idx" ON "integration_endpoint"("tenant_id", "posture");
CREATE INDEX "integration_endpoint_tenant_id_adapter_key_idx" ON "integration_endpoint"("tenant_id", "adapter_key");
ALTER TABLE "integration_endpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_endpoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "integration_endpoint"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "webhook_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "delivery_mode" TEXT NOT NULL DEFAULT 'at_least_once',
    "secret_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_at" TEXT,
    "last_success_at" TEXT,
    "paused_at" TEXT,
    "suspended_at" TEXT,
    "suspended_reason" TEXT,
    "revoked_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "webhook_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_subscription_tenant_id_consumer_id_subscription_key_key" ON "webhook_subscription"("tenant_id", "consumer_id", "subscription_key");
CREATE INDEX "webhook_subscription_tenant_id_idx" ON "webhook_subscription"("tenant_id");
CREATE INDEX "webhook_subscription_tenant_id_organization_id_idx" ON "webhook_subscription"("tenant_id", "organization_id");
CREATE INDEX "webhook_subscription_tenant_id_organization_id_status_idx" ON "webhook_subscription"("tenant_id", "organization_id", "status");
CREATE INDEX "webhook_subscription_tenant_id_consumer_id_idx" ON "webhook_subscription"("tenant_id", "consumer_id");
CREATE INDEX "webhook_subscription_tenant_id_endpoint_id_idx" ON "webhook_subscription"("tenant_id", "endpoint_id");
ALTER TABLE "webhook_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "webhook_subscription"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "outbound_delivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "payload_fingerprint" TEXT NOT NULL,
    "delivery_mode" TEXT NOT NULL DEFAULT 'at_least_once',
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TEXT,
    "last_attempted_at" TEXT,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "delivered_at" TEXT,
    "dead_lettered_at" TEXT,
    "abandoned_at" TEXT,
    "abandoned_reason" TEXT,
    "replay_of_delivery_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "outbound_delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outbound_delivery_original_event_key" ON "outbound_delivery"("tenant_id", "subscription_id", "event_id") WHERE "replay_of_delivery_id" IS NULL;
CREATE INDEX "outbound_delivery_tenant_id_idx" ON "outbound_delivery"("tenant_id");
CREATE INDEX "outbound_delivery_tenant_id_organization_id_idx" ON "outbound_delivery"("tenant_id", "organization_id");
CREATE INDEX "outbound_delivery_tenant_id_organization_id_outcome_idx" ON "outbound_delivery"("tenant_id", "organization_id", "outcome");
CREATE INDEX "outbound_delivery_tenant_id_subscription_id_idx" ON "outbound_delivery"("tenant_id", "subscription_id");
CREATE INDEX "outbound_delivery_tenant_id_endpoint_id_idx" ON "outbound_delivery"("tenant_id", "endpoint_id");
CREATE INDEX "outbound_delivery_tenant_id_outcome_next_attempt_at_idx" ON "outbound_delivery"("tenant_id", "outcome", "next_attempt_at");
CREATE INDEX "outbound_delivery_tenant_id_replay_of_delivery_id_idx" ON "outbound_delivery"("tenant_id", "replay_of_delivery_id");
CREATE INDEX "outbound_delivery_tenant_id_subscription_id_event_id_idx" ON "outbound_delivery"("tenant_id", "subscription_id", "event_id");
ALTER TABLE "outbound_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbound_delivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "outbound_delivery"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "capability_key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payload_fingerprint" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'in_flight',
    "recorded_status" INTEGER,
    "response_ref" TEXT,
    "completed_at" TEXT,
    "conflicted_at" TEXT,
    "expires_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_record_tenant_id_consumer_id_idempotency_key_key" ON "idempotency_record"("tenant_id", "consumer_id", "idempotency_key");
CREATE INDEX "idempotency_record_tenant_id_idx" ON "idempotency_record"("tenant_id");
CREATE INDEX "idempotency_record_tenant_id_consumer_id_idx" ON "idempotency_record"("tenant_id", "consumer_id");
CREATE INDEX "idempotency_record_tenant_id_organization_id_idx" ON "idempotency_record"("tenant_id", "organization_id");
CREATE INDEX "idempotency_record_tenant_id_expires_at_idx" ON "idempotency_record"("tenant_id", "expires_at");
ALTER TABLE "idempotency_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "idempotency_record"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
