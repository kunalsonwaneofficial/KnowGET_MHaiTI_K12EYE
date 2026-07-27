-- Institutional Knowledge Graph, Semantic Intelligence & Digital Memory (P2-D25). Six tenant-owned tables:
-- entity_type, relationship_type, knowledge_entity, semantic_relationship, assertion and entity_memory. Every
-- table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard tenant_isolation policy (both USING and
-- WITH CHECK, fail-closed on an unset tenant). This is the first contract of the intelligence core (Program E):
-- the semantic layer the later intelligence domains build on. An extensible ontology registers the entity and
-- relationship types; knowledge entities carry global ids and reference the domain records they represent
-- (organization, person, student … referenced by id, never re-modelled); semantic relationships are directed,
-- versioned and time-aware (valid_from/valid_to, a version and supersedes_id — the digital memory keeps prior
-- versions); assertions are the evidence chain (method + confidence + evidence source + derived_from, an array
-- of antecedent assertion ids); entity_memory is the re-derivable per-entity read model. Types follow the data:
-- version, confidence and every degree/count are INTEGER; derived_from is UUID[]; every date/ISO stamp and every
-- key, label, status, method, tier and value is TEXT. LLMs, agents, vector embeddings and RAG are deferred out
-- of this contract into the later intelligence domains (P2-D26+). Uniqueness is DB-backed: type key per tenant;
-- one node per (tenant, source domain, source ref); one memory per (tenant, entity).

-- ---------------------------------------------------------------------------------
CREATE TABLE "entity_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "entity_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "entity_type_tenant_id_key_key" ON "entity_type"("tenant_id", "key");
CREATE INDEX "entity_type_tenant_id_idx" ON "entity_type"("tenant_id");
CREATE INDEX "entity_type_tenant_id_organization_id_idx" ON "entity_type"("tenant_id", "organization_id");
ALTER TABLE "entity_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entity_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "entity_type"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "relationship_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source_entity_type_key" TEXT NOT NULL,
    "target_entity_type_key" TEXT NOT NULL,
    "cardinality" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "relationship_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "relationship_type_tenant_id_key_key" ON "relationship_type"("tenant_id", "key");
CREATE INDEX "relationship_type_tenant_id_idx" ON "relationship_type"("tenant_id");
CREATE INDEX "relationship_type_tenant_id_organization_id_idx" ON "relationship_type"("tenant_id", "organization_id");
ALTER TABLE "relationship_type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_type" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "relationship_type"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "knowledge_entity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_type_key" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "merged_into_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "knowledge_entity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_entity_tenant_id_source_domain_source_ref_key" ON "knowledge_entity"("tenant_id", "source_domain", "source_ref");
CREATE INDEX "knowledge_entity_tenant_id_idx" ON "knowledge_entity"("tenant_id");
CREATE INDEX "knowledge_entity_tenant_id_entity_type_key_idx" ON "knowledge_entity"("tenant_id", "entity_type_key");
ALTER TABLE "knowledge_entity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_entity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "knowledge_entity"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "semantic_relationship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relationship_type_key" TEXT NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "valid_from" TEXT NOT NULL,
    "valid_to" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'asserted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "semantic_relationship_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "semantic_relationship_tenant_id_idx" ON "semantic_relationship"("tenant_id");
CREATE INDEX "semantic_relationship_tenant_id_source_entity_id_idx" ON "semantic_relationship"("tenant_id", "source_entity_id");
CREATE INDEX "semantic_relationship_tenant_id_target_entity_id_idx" ON "semantic_relationship"("tenant_id", "target_entity_id");
ALTER TABLE "semantic_relationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "semantic_relationship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "semantic_relationship"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "assertion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "predicate" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "evidence_source" TEXT,
    "evidence_ref" TEXT,
    "derived_from" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "asserted_on" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'asserted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "assertion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assertion_tenant_id_idx" ON "assertion"("tenant_id");
CREATE INDEX "assertion_tenant_id_subject_kind_subject_id_idx" ON "assertion"("tenant_id", "subject_kind", "subject_id");
ALTER TABLE "assertion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assertion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assertion"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "entity_memory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "out_degree" INTEGER NOT NULL DEFAULT 0,
    "in_degree" INTEGER NOT NULL DEFAULT 0,
    "degree" INTEGER NOT NULL DEFAULT 0,
    "assertion_count" INTEGER NOT NULL DEFAULT 0,
    "grounded_assertion_count" INTEGER NOT NULL DEFAULT 0,
    "aggregate_confidence" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "entity_memory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "entity_memory_tenant_id_entity_id_key" ON "entity_memory"("tenant_id", "entity_id");
CREATE INDEX "entity_memory_tenant_id_idx" ON "entity_memory"("tenant_id");
CREATE INDEX "entity_memory_tenant_id_organization_id_idx" ON "entity_memory"("tenant_id", "organization_id");
ALTER TABLE "entity_memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entity_memory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "entity_memory"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
