-- Multi-tenancy: enable Row-Level Security on the tenant-owned fixture table.
-- FORCE applies RLS even to the table owner, so isolation cannot be bypassed by
-- the application role.
ALTER TABLE "data_probe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_probe" FORCE ROW LEVEL SECURITY;

-- Rows are visible and insertable only for the tenant set on the session via
-- set_config('app.current_tenant', <uuid>, true). When unset, current_setting
-- returns NULL and the predicate is false — fail-closed isolation.
CREATE POLICY "tenant_isolation" ON "data_probe"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
