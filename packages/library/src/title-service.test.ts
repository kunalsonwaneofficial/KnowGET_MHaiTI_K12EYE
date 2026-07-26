import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { InMemoryTitleRepository, type OrganizationDirectory } from "./ports";
import { TitleService } from "./title-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (known = true) => {
  const repository = new InMemoryTitleRepository();
  const service = new TitleService({ repository, organizations: orgDir(known) });
  return { repository, service };
};

const input = {
  tenantId,
  organizationId,
  title: "Clean Code",
  type: "book" as const,
  isbn: "ISBN-1",
};

describe("TitleService.catalog", () => {
  it("catalogs a title when the org exists and the ISBN is free", async () => {
    const { service } = setup();
    const t = await service.catalog(input);
    expect(t.status).toBe("active");
    expect(await service.getByIsbn(tenantId, "ISBN-1")).toMatchObject({ id: t.id });
  });

  it("rejects an unknown org and a duplicate ISBN", async () => {
    await expect(setup(false).service.catalog(input)).rejects.toThrow(/Organization/);
    const { service } = setup();
    await service.catalog(input);
    await expect(service.catalog({ ...input, title: "Other" })).rejects.toThrow(/already in use/);
  });

  it("allows titles without an ISBN (no false collision)", async () => {
    const { service } = setup();
    await service.catalog({ tenantId, organizationId, title: "Journal A", type: "journal" });
    await service.catalog({ tenantId, organizationId, title: "Journal B", type: "journal" });
    expect(await service.list(tenantId)).toHaveLength(2);
  });
});

describe("TitleService lifecycle & metadata", () => {
  it("withdraws, restores, and re-checks ISBN uniqueness on metadata change", async () => {
    const { service } = setup();
    const t = await service.catalog(input);
    const other = await service.catalog({
      tenantId,
      organizationId,
      title: "Other",
      type: "book",
      isbn: "ISBN-2",
    });
    expect((await service.withdraw(tenantId, t.id)).status).toBe("withdrawn");
    expect((await service.restore(tenantId, t.id)).status).toBe("active");
    await expect(service.setMetadata(tenantId, other.id, { isbn: "ISBN-1" })).rejects.toThrow(
      /already in use/,
    );
  });
});
