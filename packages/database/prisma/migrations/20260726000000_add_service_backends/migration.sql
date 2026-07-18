-- Distributed shared-service backends (TD-19): a global blob store and a global
-- full-text search index. Both are tenant-agnostic (their ports carry no tenant),
-- so neither is RLS-scoped; the tenant travels as a key prefix / a filterable field.

-- Blob storage: bytes in a bytea column, keyed globally.
CREATE TABLE "service_blob" (
    "key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_blob_pkey" PRIMARY KEY ("key")
);

-- Full-text search: text + JSONB filter fields, with a generated tsvector and a
-- GIN index for ranked matching (plainto_tsquery / ts_rank).
CREATE TABLE "service_search_document" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "service_search_document_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "service_search_document"
    ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;

CREATE INDEX "service_search_document_tsv_idx" ON "service_search_document" USING GIN ("tsv");
-- JSONB containment (`fields @> '{...}'`) exact-match filters are served by a GIN index.
CREATE INDEX "service_search_document_fields_idx" ON "service_search_document" USING GIN ("fields");
