-- Procurement, Inventory & Assets Platform (P2-D15). Eight tenant-owned tables: supplier,
-- inventory_item, stock_movement, purchase_requisition, purchase_order, asset, asset_maintenance and
-- inventory_position. Every table is tenant-isolated by FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (both USING and WITH CHECK, fail-closed on an unset tenant). Money is
-- engineered as integer minor units: scalar amounts (item standard cost, asset acquisition/salvage,
-- maintenance cost, inventory stock value) are BIGINT; amounts embedded in structured data (a
-- requisition's lines, a purchase order's lines) live inside non-null JSONB matching the Prisma schema.
-- Quantities, reorder levels and versions are INTEGER; below-reorder is BOOLEAN; date-only and
-- ISO-timestamp domain values (occurred/expected/issued/acquisition/scheduled/performed/retired/
-- disposed/refreshed stamps) are TEXT. Uniqueness mirrors the domain: supplier code, item sku, order
-- number, asset tag per tenant, one position per item — all tenant-scoped. Organizations (P2-D01-M01)
-- and employees (P2-D12) are referenced by id, not duplicated here.

-- ---------------------------------------------------------------------------------
CREATE TABLE "supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_tenant_id_code_key" ON "supplier"("tenant_id", "code");
CREATE INDEX "supplier_tenant_id_idx" ON "supplier"("tenant_id");
CREATE INDEX "supplier_tenant_id_organization_id_idx" ON "supplier"("tenant_id", "organization_id");
ALTER TABLE "supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "supplier"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "inventory_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit_of_measure" TEXT NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "standard_cost_minor" BIGINT,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_item_tenant_id_sku_key" ON "inventory_item"("tenant_id", "sku");
CREATE INDEX "inventory_item_tenant_id_idx" ON "inventory_item"("tenant_id");
CREATE INDEX "inventory_item_tenant_id_organization_id_idx" ON "inventory_item"("tenant_id", "organization_id");
ALTER TABLE "inventory_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "inventory_item"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "stock_movement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "occurred_at" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movement_tenant_id_idx" ON "stock_movement"("tenant_id");
CREATE INDEX "stock_movement_tenant_id_item_id_idx" ON "stock_movement"("tenant_id", "item_id");
CREATE INDEX "stock_movement_tenant_id_organization_id_idx" ON "stock_movement"("tenant_id", "organization_id");
ALTER TABLE "stock_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_movement"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "purchase_requisition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT,
    "currency" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "purchase_requisition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_requisition_tenant_id_idx" ON "purchase_requisition"("tenant_id");
CREATE INDEX "purchase_requisition_tenant_id_requester_id_idx" ON "purchase_requisition"("tenant_id", "requester_id");
CREATE INDEX "purchase_requisition_tenant_id_organization_id_idx" ON "purchase_requisition"("tenant_id", "organization_id");
ALTER TABLE "purchase_requisition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_requisition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "purchase_requisition"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "requisition_id" UUID,
    "expected_date" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issued_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_order_tenant_id_number_key" ON "purchase_order"("tenant_id", "number");
CREATE INDEX "purchase_order_tenant_id_idx" ON "purchase_order"("tenant_id");
CREATE INDEX "purchase_order_tenant_id_supplier_id_idx" ON "purchase_order"("tenant_id", "supplier_id");
CREATE INDEX "purchase_order_tenant_id_organization_id_idx" ON "purchase_order"("tenant_id", "organization_id");
ALTER TABLE "purchase_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "purchase_order"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "custodian_id" UUID,
    "location" TEXT,
    "acquisition_cost_minor" BIGINT NOT NULL,
    "salvage_value_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "acquisition_date" TEXT NOT NULL,
    "useful_life_months" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_service',
    "retired_at" TEXT,
    "disposed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_tenant_id_asset_tag_key" ON "asset"("tenant_id", "asset_tag");
CREATE INDEX "asset_tenant_id_idx" ON "asset"("tenant_id");
CREATE INDEX "asset_tenant_id_organization_id_idx" ON "asset"("tenant_id", "organization_id");
CREATE INDEX "asset_tenant_id_custodian_id_idx" ON "asset"("tenant_id", "custodian_id");
ALTER TABLE "asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "asset_maintenance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "scheduled_date" TEXT,
    "performed_date" TEXT,
    "cost_minor" BIGINT,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_maintenance_tenant_id_idx" ON "asset_maintenance"("tenant_id");
CREATE INDEX "asset_maintenance_tenant_id_asset_id_idx" ON "asset_maintenance"("tenant_id", "asset_id");
CREATE INDEX "asset_maintenance_tenant_id_organization_id_idx" ON "asset_maintenance"("tenant_id", "organization_id");
ALTER TABLE "asset_maintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asset_maintenance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "asset_maintenance"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "inventory_position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "on_hand_quantity" INTEGER NOT NULL DEFAULT 0,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "issued_quantity" INTEGER NOT NULL DEFAULT 0,
    "adjustment_quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "below_reorder" BOOLEAN NOT NULL DEFAULT false,
    "stock_value_minor" BIGINT,
    "currency" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "refreshed_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "inventory_position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_position_tenant_id_item_id_key" ON "inventory_position"("tenant_id", "item_id");
CREATE INDEX "inventory_position_tenant_id_idx" ON "inventory_position"("tenant_id");
CREATE INDEX "inventory_position_tenant_id_organization_id_idx" ON "inventory_position"("tenant_id", "organization_id");
ALTER TABLE "inventory_position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_position" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "inventory_position"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
