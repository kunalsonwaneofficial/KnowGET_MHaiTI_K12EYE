import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { CollectionProfileService } from "./collection-profile-service";
import { accessionCopy, issueCopy } from "./copy";
import { catalogDigitalAsset } from "./digital-asset";
import { issueLoan } from "./loan";
import {
  InMemoryCollectionProfileRepository,
  InMemoryCopyRepository,
  InMemoryDigitalAssetRepository,
  InMemoryLoanRepository,
  InMemoryReservationRepository,
  InMemoryTitleRepository,
  type OrganizationDirectory,
} from "./ports";
import { placeReservation } from "./reservation";
import { catalogTitle } from "./title";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async () => {
  const repository = new InMemoryCollectionProfileRepository();
  const titles = new InMemoryTitleRepository();
  const copies = new InMemoryCopyRepository();
  const digitalAssets = new InMemoryDigitalAssetRepository();
  const loans = new InMemoryLoanRepository();
  const reservations = new InMemoryReservationRepository();

  const title = catalogTitle({ tenantId, organizationId, title: "Clean Code", type: "book" });
  await titles.save(title);
  const c1 = accessionCopy({ tenantId, organizationId, titleId: title.id, barcode: "BC-1" });
  const c2 = issueCopy(
    accessionCopy({ tenantId, organizationId, titleId: title.id, barcode: "BC-2" }),
  );
  await copies.save(c1);
  await copies.save(c2);
  await loans.save(
    issueLoan({
      tenantId,
      organizationId,
      copyId: c2.id,
      titleId: title.id,
      memberId: "m1" as Uuid,
      issueDate: "2026-01-01",
      loanPeriodDays: 14,
      renewalLimit: 2,
    }),
  );
  await digitalAssets.save(
    catalogDigitalAsset({
      tenantId,
      organizationId,
      title: "E-Book",
      format: "ebook",
      accessModel: "open",
    }),
  );
  await reservations.save(
    placeReservation({
      tenantId,
      organizationId,
      titleId: title.id,
      memberId: "m2" as Uuid,
      requestedOn: "2026-01-01",
      queuePosition: 1,
    }),
  );

  const service = new CollectionProfileService({
    repository,
    organizations: orgDir(),
    titles,
    copies,
    digitalAssets,
    loans,
    reservations,
  });
  return { repository, service, title };
};

describe("CollectionProfileService.refresh", () => {
  it("reconciles catalog, holdings, digital and circulation as of a date", async () => {
    const { service } = await setup();
    const p = await service.refresh(tenantId, organizationId, "2026-02-01"); // past the 01-15 due date
    expect(p.titleCount).toBe(1);
    expect(p.copyCount).toBe(2);
    expect(p.availableCount).toBe(1);
    expect(p.onLoanCount).toBe(1);
    expect(p.activeLoanCount).toBe(1);
    expect(p.overdueLoanCount).toBe(1); // the loan is overdue on 02-01
    expect(p.digitalAssetCount).toBe(1);
    expect(p.openReservationCount).toBe(1);
    expect(p.utilizationPercent).toBe(50); // 1 on loan / 2 loanable
    expect(p.version).toBe(1);
  });

  it("version-bumps on a second refresh and shows no overdue before the due date", async () => {
    const { service } = await setup();
    await service.refresh(tenantId, organizationId, "2026-02-01");
    const p = await service.refresh(tenantId, organizationId, "2026-01-05"); // before due date
    expect(p.version).toBe(2);
    expect(p.overdueLoanCount).toBe(0);
  });

  it("rejects an unknown organization", async () => {
    const { repository, title } = await setup();
    const service = new CollectionProfileService({
      repository,
      organizations: orgDir(false),
      titles: new InMemoryTitleRepository(),
      copies: new InMemoryCopyRepository(),
      digitalAssets: new InMemoryDigitalAssetRepository(),
      loans: new InMemoryLoanRepository(),
      reservations: new InMemoryReservationRepository(),
    });
    expect(title.id).toBeDefined();
    await expect(service.refresh(tenantId, organizationId, "2026-01-01")).rejects.toThrow(
      /Organization/,
    );
  });
});
