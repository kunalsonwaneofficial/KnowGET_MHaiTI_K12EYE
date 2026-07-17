import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { AuditWriter } from "./audit-writer";
import { DatabaseHealthIndicator } from "./database-health";
import { dataProbeRepository } from "./probe-repository";
import { PrismaService } from "./prisma-service";
import { withTenant } from "./tenancy";

// These integration tests require a live PostgreSQL (with the migrations
// applied). They run in CI (which provisions Postgres) and are skipped when
// DATABASE_URL is not set.
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe.skipIf(!DATABASE_URL)("Enterprise Data Platform (integration)", () => {
  let service: PrismaService;

  beforeAll(async () => {
    service = new PrismaService();
    await service.connect();
  });

  afterAll(async () => {
    await service.disconnect();
  });

  beforeEach(async () => {
    // TRUNCATE bypasses RLS (table-level, owner) — reset fixtures.
    await service.client.$executeRawUnsafe('TRUNCATE "data_probe"');
    await service.client.$executeRawUnsafe('TRUNCATE "audit_log"');
  });

  it("reports database health as up", async () => {
    const result = await new DatabaseHealthIndicator(service).check();
    expect(result.status).toBe("up");
  });

  it("performs CRUD + pagination through the generic repository", async () => {
    await withTenant(service, TENANT_A, async (tx) => {
      const repo = dataProbeRepository(tx.dataProbe);
      const created = await repo.create({ tenantId: TENANT_A, name: "alpha", value: "1" });
      expect(created.id).toMatch(/[0-9a-f-]{36}/);

      const found = await repo.findById(created.id);
      expect(found?.name).toBe("alpha");

      await repo.update(created.id, { value: "2" });
      expect((await repo.findById(created.id))?.value).toBe("2");

      await repo.create({ tenantId: TENANT_A, name: "beta" });
      const page = await repo.findMany({ page: { page: 1, pageSize: 1 } });
      expect(page.totalItems).toBe(2);
      expect(page.totalPages).toBe(2);
      expect(page.items).toHaveLength(1);
    });
  });

  it("soft-deletes and restores", async () => {
    await withTenant(service, TENANT_A, async (tx) => {
      const repo = dataProbeRepository(tx.dataProbe);
      const row = await repo.create({ tenantId: TENANT_A, name: "temp" });

      await repo.softDelete(row.id);
      expect((await repo.findMany()).totalItems).toBe(0);
      expect((await repo.findMany({ includeDeleted: true })).totalItems).toBe(1);

      await repo.restore(row.id);
      expect((await repo.findMany()).totalItems).toBe(1);
    });
  });

  it("isolates tenants via Row-Level Security", async () => {
    await withTenant(service, TENANT_A, (tx) =>
      dataProbeRepository(tx.dataProbe).create({ tenantId: TENANT_A, name: "a" }),
    );
    await withTenant(service, TENANT_B, (tx) =>
      dataProbeRepository(tx.dataProbe).create({ tenantId: TENANT_B, name: "b" }),
    );

    const seenByA = await withTenant(service, TENANT_A, (tx) =>
      dataProbeRepository(tx.dataProbe).findMany(),
    );
    expect(seenByA.totalItems).toBe(1);
    expect(seenByA.items[0]?.tenantId).toBe(TENANT_A);
  });

  it("rolls back a failed transaction", async () => {
    await expect(
      withTenant(service, TENANT_A, async (tx) => {
        await dataProbeRepository(tx.dataProbe).create({ tenantId: TENANT_A, name: "doomed" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const count = await withTenant(service, TENANT_A, (tx) =>
      dataProbeRepository(tx.dataProbe).count(),
    );
    expect(count).toBe(0);
  });

  it("writes platform audit entries", async () => {
    await new AuditWriter(service).write({
      action: "created",
      entityType: "data_probe",
      entityId: "x",
      data: { field: "value" },
    });
    const rows = await service.client.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("created");
  });
});
