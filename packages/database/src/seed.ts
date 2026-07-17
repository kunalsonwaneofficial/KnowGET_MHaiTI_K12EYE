import { AuditWriter } from "./audit-writer";
import { PrismaService } from "./prisma-service";
import { withTenant } from "./tenancy";

/** Seed a small amount of platform demonstration data (idempotent-ish). */
async function main(): Promise<void> {
  const service = new PrismaService();
  await service.connect();

  const demoTenant = "00000000-0000-4000-8000-000000000001";
  await withTenant(service, demoTenant, async (tx) => {
    await tx.dataProbe.create({
      data: { tenantId: demoTenant, name: "seed-probe-1", value: "hello" },
    });
    await tx.dataProbe.create({ data: { tenantId: demoTenant, name: "seed-probe-2" } });
  });

  await new AuditWriter(service).write({
    action: "seed",
    entityType: "platform",
    data: { note: "initial platform seed" },
  });

  console.log("Seed complete.");
  await service.disconnect();
}

void main();
