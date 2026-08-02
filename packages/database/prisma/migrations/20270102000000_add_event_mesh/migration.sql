-- Event Mesh, Streaming & Messaging (P3-D02). Eight tenant-owned tables: event_type_definition, event_stream,
-- stream_binding, mesh_subscription, subscription_checkpoint, mesh_message, dead_letter and replay_request.
-- Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both
-- USING and WITH CHECK, fail-closed on an unset tenant). Thirty-one contracts came before this one. The last of
-- them recorded what an institution's work is allowed to look like from outside; this one records what that work
-- says to itself — which facts a capability publishes, in what shape, on which ordered channel, to which
-- consumers, how far each of them has got, what could not be delivered, and what was deliberately sent again.
--
-- The platform already had an in-process bus and a transactional outbox in @knowget/events, and it keeps both.
-- What it did not have was the institution's own account of any of it. A stream nobody declared, a consumer
-- nobody registered, a shape nobody published and a failure nobody recorded are all invisible the moment the
-- process that knew about them restarts. Every table here exists because some question an operator asks at two
-- in the morning — what is this consumer behind on, what did it fail on, was that stretch of history sent twice
-- — has no answer anywhere in a mesh that keeps its state in memory.
--
-- THREE UNIQUES ARE PARTIAL, which is why they are here and not in the Prisma schema (like RLS, a migration-only
-- database feature). Each is argued, because in every case the total alternative looks simpler and is wrong.
--
-- At most one binding may carry a stream: UNIQUE (tenant_id, stream_key) WHERE status = 'active'. This is what
-- keeps a stream single-writer and therefore what makes its sequence a sequence — two brokers both believing
-- they own the ordering produce two positions numbered the same, and the constraint on mesh_message below then
-- refuses the second message rather than the second broker, which is the wrong end to discover it at. The domain
-- checks it too and the two are not redundant: the domain check is a read followed by a write, and the interval
-- between them is exactly a rolling deployment. It is partial rather than total because declared, draining and
-- retired bindings all keep their rows, and a migration from one backbone to another is precisely the interval
-- in which two bindings exist on one stream — one draining, one active — which a total unique would forbid.
--
-- One undecided dead letter per message per consumer: UNIQUE (tenant_id, subscription_id, message_id) WHERE
-- status = 'open'. Partial is the whole point rather than a concession. Two failures of one message separated by
-- a settlement are two rows, because they are two events and collapsing them would erase the fact that somebody
-- looked at the first one and decided something; a total unique would either overwrite that decision or refuse
-- the second failure, and both lose the only history this table exists to keep. But a consumer restarted every
-- ninety seconds against a message it will never process would otherwise open a thousand rows describing one
-- broken projector, and a worklist in that state is one nobody reads. So while nothing has been decided a repeat
-- failure is the same undecided work item: the domain hands the open record back unchanged, and this index is
-- what makes that hold when two delivery workers race each other to record it.
--
-- One running replay per consumer: UNIQUE (tenant_id, subscription_id) WHERE status = 'running'. Of the three
-- this is the one whose absence is hardest to detect afterwards. Two replays into one consumer interleave two
-- stretches of history in an order neither requester asked for, and a consumer written to read a stream forwards
-- cannot tell it is being handed two. Nothing errors while it happens. Both runs report themselves complete, and
-- what is left is a projection built from a sequence of facts that never occurred in that order, with no failure
-- recorded anywhere to explain it. The domain refuses the second start; this index is what makes the refusal
-- hold when two operators press the button at the same moment. It is partial because every other status may
-- repeat freely — a consumer may hold a hundred completed replays, several rejected and one requested.
--
-- TWO UNIQUES ARE TOTAL ON mesh_message, and between them they carry everything the mesh promises about a fact
-- it has accepted. (tenant_id, event_id) is the deduplication ledger: a producer that retries after a timeout it
-- never learned the outcome of publishes the same event twice, and this constraint is what makes the second
-- attempt a no-op instead of a second fact. It is total rather than scoped to a retention window because an
-- event id means one occurrence for the life of the institution, and a window would make republishing a
-- two-month-old event succeed quietly. (tenant_id, stream_key, sequence) is what makes a sequence a sequence:
-- allocating the next position is a read followed by a write, and two publishers that both read the same head
-- both decide to write the same number. The domain cannot see that happen and the database can. Losing that race
-- is not an error a caller should ever be shown, so the adapter re-reads the head and retries rather than
-- surfacing it — which is only sound because this constraint exists to lose the race against.
--
-- THE REMAINING UNIQUES ARE TOTAL and each holds across every terminal status. (tenant_id, event_type_key,
-- version) freezes a published shape, so a change is a new row beside this one rather than an edit to it: a
-- consumer written against version N holds a dependency it cannot see being rewritten, and a version number that
-- could be reissued would make every such dependency a lie the consumer has no way to detect. (tenant_id,
-- stream_key) and (tenant_id, subscription_key) hold retired streams and retired subscriptions included, because
-- a message, a binding, a checkpoint, a dead letter and a replay all resolve one or the other through its key
-- long after the thing itself stopped carrying anything, and reissuing a key under a new meaning is how those
-- records come to disagree about what was published where and to whom. (tenant_id, stream_key, transport) holds
-- for the same reason one step down: re-declaring a stream on a backbone it was once bound to is how a drained
-- migration silently becomes a double delivery. (tenant_id, subscription_id, partition) is the whole of
-- subscription_checkpoint's integrity — a consumer with two checkpoints on one partition has two answers to the
-- only question that table exists to answer, and whichever a dispatch happens to read decides whether an event
-- is delivered twice or not at all. It carries an explicit name, subscription_checkpoint_partition_key, because
-- the generated one is exactly sixty-three characters and PostgreSQL truncates identifiers at sixty-three: a
-- name sitting on the limit is one column rename away from silently becoming a different index in the database
-- than the one the schema describes.
--
-- event_stream.event_type_keys is TEXT[] and deliberately carries no GIN index, which the gateway migration
-- established for webhook_subscription.event_types and which is repeated here because the shape is identical and
-- the temptation is the same. Under FORCE RLS the tenant predicate arrives as a security qual, and PostgreSQL
-- will not evaluate a qual whose operator is not leakproof ahead of one — doing so would let the qual read a row
-- the policy has not yet admitted. Array containment (@>) and overlap (&&) are both non-leakproof, so on a
-- policy-protected table a containment test can never become an index condition; it is always demoted to a
-- filter applied after the policy has passed the row. A GIN index here would cost write amplification on every
-- stream write, be read zero times, and leave the schema looking as though the accepts-this-type read were
-- served when it is not. What serves it instead is cardinality: an institution declares streams in the tens, so
-- the whole set is a page or two and the read completes without consulting an index at all. Giving event types a
-- table of their own would make the qual a leakproof equality, and would also make a row able to widen a
-- stream's acceptance without the stream being rewritten — which is the invariant the column exists to keep.
--
-- Children live inside their aggregate rather than in tables of their own, and here both are JSONB.
-- event_type_definition.schema_fields is the declared shape of a payload, and a field row that could be inserted
-- on its own would change an event's shape without the definition being rewritten, which is precisely the change
-- the compatibility engine exists to judge. It is a small closed set of seven field types rather than a JSON
-- Schema document because the engine has to answer whether a consumer written against version N can read version
-- N+1, and that question is decidable only over a decidable schema language. mesh_subscription.filter is the
-- same argument in the more dangerous direction: a predicate row inserted on its own would narrow a consumer's
-- interest without the subscription being rewritten, and a consumer that silently stops being offered a class of
-- event looks exactly like a class of event that stopped happening.
--
-- Every ISO instant is TEXT in fixed-width ISO-8601 with milliseconds and a trailing Z, normalised on write by
-- the domain's fixedWidthInstant, and here that is load-bearing rather than a convention. mesh_message
-- .recorded_at is range-compared in the database by both the replay window count and the retention sweep;
-- replay_request.from_instant and to_instant are the bounds compared against it; dead_letter.failed_at is the
-- worklist's sort key. ISO-8601 admits several spellings of one moment — a missing millisecond field, an offset
-- instead of Z — whose lexical order is not their chronological order, the deployment collation is C.UTF-8 so
-- byte order is code-point order, and fixed width is therefore what makes a text btree a chronological index. A
-- window whose bounds sort differently from the messages inside it selects the wrong messages, and it does so
-- without erroring. created_at and updated_at stay platform TIMESTAMP columns, as everywhere else.
--
-- Relations are by id and there are no foreign keys, following the platform's practice across all forty-two
-- migrations before this one. subscription_checkpoint.subscription_id, dead_letter.subscription_id,
-- dead_letter.message_id, dead_letter.replay_id and replay_request.subscription_id all name rows the domain
-- resolves and the directory ports validate. event_type_definition.superseded_by_version is an integer rather
-- than a reference for a sharper reason than practice: it names the version a producer should move to, and at
-- the moment a deprecation is announced that version may legitimately not exist yet.
--
-- Nullability carries meaning rather than tidiness. subscription_checkpoint.position_moved_at is NOT NULL and
-- set when the checkpoint opens, because lag is measured from it and a NULL would make a consumer that has never
-- committed indistinguishable from one that committed at an unknown time, which are opposite diagnoses.
-- reset_at, reset_by and reset_reason are nullable together: a rewind re-delivers everything after the new
-- position to a system that has already acted on it, so it is not a smaller number written over the old one but
-- a recorded act with a person and a sentence attached. mesh_message.payload is nullable because a stream
-- keeping none or digest retention holds no payload at all, and payload_forgotten_at records an erasure
-- performed under a data-protection request — which is why forgetting is a column rather than a delete: the fact
-- that an event occurred is not erased when its contents are. replay_request.message_count is the estimate the
-- approver was shown and delivered_count is what the run reported, and they are separate columns because a run
-- that delivered a different number than was approved is the single most useful thing this table can tell an
-- investigator. dead_letter.replay_id is nullable because only one of the two endings populates it.
--
-- stream_binding.transport_ref is a reference into configuration or the secret store and never a broker
-- credential, for the reason the gateway's credential_ref columns exist: a column that has ever held a secret
-- has to be treated as compromised forever, so rotating one is a write to the vault and an updated_at here.
-- mesh_message.payload_digest is a digest and never a payload, and the two columns coexist because a stream that
-- keeps digests can still answer whether two events carried the same content without keeping either.
--
-- Every index traces to a read the domain actually performs, and the ones deliberately absent are worth stating.
-- (tenant_id, organization_id, status) serves the three institution-scoped lifecycle reads — carried event
-- types, publishable streams and carrying bindings. (tenant_id, stream_key, status) on mesh_subscription serves
-- both stream-scoped reads, every subscription on a stream and the deliverable subset a dispatch fans out to,
-- which is the only mesh read on a hot path. (tenant_id, stream_key, partition, sequence) answers the head of a
-- partition, and (tenant_id, stream_key, recorded_at) answers the replay window count, the replay window listing
-- and the retention sweep. (tenant_id, organization_id, status, failed_at) carries the dead-letter worklist
-- including its ordering, which is oldest failure first because that is the one that has been costing the
-- institution longest. There is no (tenant_id, stream_key) index on stream_binding and no (tenant_id,
-- subscription_id) index on subscription_checkpoint, because in both cases a unique above already leads with
-- those columns; and dead_letter's (tenant_id, subscription_id, message_id) index is the total counterpart the
-- partial unique cannot serve — the by-message read has to find settled records too — and it covers the
-- by-subscription read as a prefix.
--
-- No table here carries a deleted_at and none declares a delete. A definition is retired, a stream is retired, a
-- binding is drained and retired, a subscription is paused and retired, a dead letter is replayed or discarded,
-- a replay is completed, failed, rejected or cancelled. mesh_message is the table that grows without bound and
-- it is still not swept away: what the retention sweep removes is the payload, by setting it NULL and stamping
-- payload_forgotten_at, and the envelope stays. A mesh that deleted its own messages could not answer the one
-- question it is asked most often after an incident, which is whether the fact was ever published at all.

-- ---------------------------------------------------------------------------------
CREATE TABLE "event_type_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "compatibility_mode" TEXT NOT NULL DEFAULT 'backward',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schema_fields" JSONB NOT NULL DEFAULT '[]',
    "published_at" TEXT,
    "published_by" UUID,
    "deprecated_at" TEXT,
    "retire_at" TEXT,
    "superseded_by_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "event_type_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_type_definition_tenant_id_event_type_key_version_key" ON "event_type_definition"("tenant_id", "event_type_key", "version");
CREATE INDEX "event_type_definition_tenant_id_idx" ON "event_type_definition"("tenant_id");
CREATE INDEX "event_type_definition_tenant_id_organization_id_idx" ON "event_type_definition"("tenant_id", "organization_id");
CREATE INDEX "event_type_definition_tenant_id_organization_id_status_idx" ON "event_type_definition"("tenant_id", "organization_id", "status");
CREATE INDEX "event_type_definition_tenant_id_event_type_key_idx" ON "event_type_definition"("tenant_id", "event_type_key");
ALTER TABLE "event_type_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_type_definition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "event_type_definition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "event_stream" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stream_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ordering" TEXT NOT NULL DEFAULT 'partition',
    "partition_count" INTEGER NOT NULL DEFAULT 8,
    "partition_key_path" TEXT,
    "retention" TEXT NOT NULL DEFAULT 'digest',
    "retention_seconds" INTEGER NOT NULL DEFAULT 2592000,
    "event_type_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "activated_at" TEXT,
    "activated_by" UUID,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "event_stream_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_stream_tenant_id_stream_key_key" ON "event_stream"("tenant_id", "stream_key");
CREATE INDEX "event_stream_tenant_id_idx" ON "event_stream"("tenant_id");
CREATE INDEX "event_stream_tenant_id_organization_id_idx" ON "event_stream"("tenant_id", "organization_id");
CREATE INDEX "event_stream_tenant_id_organization_id_status_idx" ON "event_stream"("tenant_id", "organization_id", "status");
ALTER TABLE "event_stream" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_stream" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "event_stream"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "stream_binding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stream_key" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'outbox',
    "transport_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'declared',
    "activated_at" TEXT,
    "activated_by" UUID,
    "draining_since" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "stream_binding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stream_binding_tenant_id_stream_key_transport_key" ON "stream_binding"("tenant_id", "stream_key", "transport");
CREATE UNIQUE INDEX "stream_binding_active_key" ON "stream_binding"("tenant_id", "stream_key") WHERE "status" = 'active';
CREATE INDEX "stream_binding_tenant_id_idx" ON "stream_binding"("tenant_id");
CREATE INDEX "stream_binding_tenant_id_organization_id_idx" ON "stream_binding"("tenant_id", "organization_id");
CREATE INDEX "stream_binding_tenant_id_organization_id_status_idx" ON "stream_binding"("tenant_id", "organization_id", "status");
ALTER TABLE "stream_binding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stream_binding" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stream_binding"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "mesh_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "consumer_group" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "semantics" TEXT NOT NULL DEFAULT 'at_least_once',
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "filter" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "activated_at" TEXT,
    "activated_by" UUID,
    "paused_at" TEXT,
    "retired_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "mesh_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mesh_subscription_tenant_id_subscription_key_key" ON "mesh_subscription"("tenant_id", "subscription_key");
CREATE INDEX "mesh_subscription_tenant_id_idx" ON "mesh_subscription"("tenant_id");
CREATE INDEX "mesh_subscription_tenant_id_organization_id_idx" ON "mesh_subscription"("tenant_id", "organization_id");
CREATE INDEX "mesh_subscription_tenant_id_stream_key_status_idx" ON "mesh_subscription"("tenant_id", "stream_key", "status");
ALTER TABLE "mesh_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mesh_subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "mesh_subscription"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "subscription_checkpoint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "committed_position" INTEGER NOT NULL,
    "position_moved_at" TEXT NOT NULL,
    "reset_at" TEXT,
    "reset_by" UUID,
    "reset_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "subscription_checkpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_checkpoint_partition_key" ON "subscription_checkpoint"("tenant_id", "subscription_id", "partition");
CREATE INDEX "subscription_checkpoint_tenant_id_idx" ON "subscription_checkpoint"("tenant_id");
CREATE INDEX "subscription_checkpoint_tenant_id_organization_id_idx" ON "subscription_checkpoint"("tenant_id", "organization_id");
ALTER TABLE "subscription_checkpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_checkpoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "subscription_checkpoint"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "mesh_message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stream_key" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "partition_count" INTEGER NOT NULL,
    "partition_key" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type_key" TEXT NOT NULL,
    "event_type_version" INTEGER NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "producer_key" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "causation_id" UUID,
    "trace_id" TEXT NOT NULL,
    "occurred_at" TEXT NOT NULL,
    "recorded_at" TEXT NOT NULL,
    "retention" TEXT NOT NULL DEFAULT 'digest',
    "payload_digest" TEXT,
    "payload" JSONB,
    "payload_forgotten_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "mesh_message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mesh_message_tenant_id_event_id_key" ON "mesh_message"("tenant_id", "event_id");
CREATE UNIQUE INDEX "mesh_message_tenant_id_stream_key_sequence_key" ON "mesh_message"("tenant_id", "stream_key", "sequence");
CREATE INDEX "mesh_message_tenant_id_idx" ON "mesh_message"("tenant_id");
CREATE INDEX "mesh_message_tenant_id_organization_id_idx" ON "mesh_message"("tenant_id", "organization_id");
CREATE INDEX "mesh_message_tenant_id_stream_key_partition_sequence_idx" ON "mesh_message"("tenant_id", "stream_key", "partition", "sequence");
CREATE INDEX "mesh_message_tenant_id_stream_key_recorded_at_idx" ON "mesh_message"("tenant_id", "stream_key", "recorded_at");
ALTER TABLE "mesh_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mesh_message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "mesh_message"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "dead_letter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "message_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type_key" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "trace_id" TEXT NOT NULL,
    "failed_at" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "settled_at" TEXT,
    "settled_by" UUID,
    "discard_reason" TEXT,
    "replay_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "dead_letter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dead_letter_open_message_key" ON "dead_letter"("tenant_id", "subscription_id", "message_id") WHERE "status" = 'open';
CREATE INDEX "dead_letter_tenant_id_idx" ON "dead_letter"("tenant_id");
CREATE INDEX "dead_letter_tenant_id_organization_id_idx" ON "dead_letter"("tenant_id", "organization_id");
CREATE INDEX "dead_letter_tenant_id_organization_id_status_failed_at_idx" ON "dead_letter"("tenant_id", "organization_id", "status", "failed_at");
CREATE INDEX "dead_letter_tenant_id_subscription_id_message_id_idx" ON "dead_letter"("tenant_id", "subscription_id", "message_id");
ALTER TABLE "dead_letter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dead_letter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dead_letter"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "replay_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "from_instant" TEXT NOT NULL,
    "to_instant" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TEXT,
    "message_count" INTEGER,
    "started_at" TEXT,
    "settled_at" TEXT,
    "settled_by" UUID,
    "settlement_reason" TEXT,
    "delivered_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "replay_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "replay_request_running_key" ON "replay_request"("tenant_id", "subscription_id") WHERE "status" = 'running';
CREATE INDEX "replay_request_tenant_id_idx" ON "replay_request"("tenant_id");
CREATE INDEX "replay_request_tenant_id_organization_id_idx" ON "replay_request"("tenant_id", "organization_id");
CREATE INDEX "replay_request_tenant_id_subscription_id_idx" ON "replay_request"("tenant_id", "subscription_id");
ALTER TABLE "replay_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "replay_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "replay_request"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
