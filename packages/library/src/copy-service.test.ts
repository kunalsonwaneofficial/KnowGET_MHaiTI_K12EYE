import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { issueCopy } from "./copy";
import { CopyService } from "./copy-service";
import { InMemoryCopyRepository, InMemoryTitleRepository } from "./ports";
import { catalogTitle, withdrawTitle } from "./title";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const titles = new InMemoryTitleRepository();
  const repository = new InMemoryCopyRepository();
  const service = new CopyService({ repository, titles });
  const title = catalogTitle({ tenantId, organizationId, title: "Clean Code", type: "book" });
  await titles.save(title);
  return { titles, repository, service, title };
};

describe("CopyService.accession", () => {
  it("accessions a copy under an active title, deriving the org", async () => {
    const { service, title } = await setup();
    const c = await service.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    expect(c.organizationId).toBe(organizationId);
    expect(c.status).toBe("available");
  });

  it("rejects an unknown/withdrawn title and a duplicate barcode", async () => {
    const { service, titles, title } = await setup();
    await expect(
      service.accession({ tenantId, titleId: "missing" as Uuid, barcode: "X" }),
    ).rejects.toThrow(/Title/);
    await service.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    await expect(
      service.accession({ tenantId, titleId: title.id, barcode: "BC-1" }),
    ).rejects.toThrow(/already in use/);
    await titles.save(withdrawTitle(title));
    await expect(
      service.accession({ tenantId, titleId: title.id, barcode: "BC-2" }),
    ).rejects.toThrow(/not active/);
  });
});

describe("CopyService.availabilityForTitle", () => {
  it("derives availability across the title's copies", async () => {
    const { service, title } = await setup();
    const a = await service.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    await service.accession({ tenantId, titleId: title.id, barcode: "BC-2" });
    await service.markLost(tenantId, a.id);
    const avail = await service.availabilityForTitle(tenantId, title.id);
    expect(avail.totalCopies).toBe(2);
    expect(avail.availableCopies).toBe(1);
    expect(avail.lostCount).toBe(1);
    expect(avail.isAvailable).toBe(true);
  });
});

describe("CopyService.markLost", () => {
  it("marks an available copy lost", async () => {
    const { service, title } = await setup();
    const c = await service.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    expect((await service.markLost(tenantId, c.id)).status).toBe("lost");
  });

  it("refuses to lose an on-loan copy directly — that must go through the loan", async () => {
    const { service, repository, title } = await setup();
    const c = await service.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    await repository.save(issueCopy(c)); // simulate the copy being out on loan
    await expect(service.markLost(tenantId, c.id)).rejects.toThrow(/on loan/);
    expect((await service.getById(tenantId, c.id)).status).toBe("on_loan"); // unchanged
  });
});
