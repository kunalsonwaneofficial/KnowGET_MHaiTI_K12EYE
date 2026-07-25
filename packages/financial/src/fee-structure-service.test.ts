import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateFeeStructureCodeError, OrganizationNotFoundForFinanceError } from "./errors";
import { feeStructureTotal } from "./fee-structure";
import { FeeStructureService } from "./fee-structure-service";
import { InMemoryFeeStructureRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: FeeStructureService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new FeeStructureService({
    repository: new InMemoryFeeStructureRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const createInput = (code = "STD-2025") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: "Standard 2025",
    currency: "INR",
    components: [{ key: "tuition", name: "Tuition", amountMinor: 500000 }],
  }) as const;

describe("FeeStructureService", () => {
  it("creates, enforces a unique code, and publishes an event", async () => {
    const { svc, events } = service();
    const fs = await svc.create(createInput());
    expect(fs.status).toBe("draft");
    expect(events.map((e) => e.type)).toEqual(["finance.fee_structure.created"]);
    await expect(svc.create(createInput("STD-2025"))).rejects.toBeInstanceOf(
      DuplicateFeeStructureCodeError,
    );
    expect((await svc.getByCode(TENANT, "STD-2025")).id).toBe(fs.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.create({
        ...createInput(),
        organizationId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForFinanceError);
  });

  it("edits components while draft then activates and archives, publishing lifecycle events", async () => {
    const { svc, events } = service();
    const fs = await svc.create(createInput());
    await svc.addComponent(TENANT, fs.id, {
      key: "transport",
      name: "Transport",
      amountMinor: 120000,
    });
    const active = await svc.activate(TENANT, fs.id);
    expect(active.components).toHaveLength(2);
    expect(feeStructureTotal(active).amountMinor).toBe(620000);
    await svc.archive(TENANT, fs.id);
    expect(events.map((e) => e.type)).toEqual([
      "finance.fee_structure.created",
      "finance.fee_structure.activated",
      "finance.fee_structure.archived",
    ]);
  });
});
