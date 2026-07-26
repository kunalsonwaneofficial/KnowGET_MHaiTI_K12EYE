import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { CirculationPolicyService } from "./circulation-policy-service";
import { CollectionProfileService } from "./collection-profile-service";
import { CopyService } from "./copy-service";
import { DigitalAssetService } from "./digital-asset-service";
import { LibraryMemberService } from "./library-member-service";
import { LoanService } from "./loan-service";
import {
  InMemoryCirculationPolicyRepository,
  InMemoryCollectionProfileRepository,
  InMemoryCopyRepository,
  InMemoryDigitalAssetRepository,
  InMemoryLibraryMemberRepository,
  InMemoryLoanRepository,
  InMemoryReservationRepository,
  InMemoryTitleRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";
import { ReservationService } from "./reservation-service";
import { TitleService } from "./title-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const personId = "aa000000-0000-0000-0000-000000000001" as Uuid;

const orgDir: OrganizationDirectory = {
  async exists() {
    return true;
  },
};
const personDir: PersonDirectory = {
  async exists() {
    return true;
  },
};

describe("library end-to-end spine", () => {
  it("runs policy → catalog → member → loan → reservation → collection profile", async () => {
    const events: DomainEvent[] = [];
    const bus = {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    };

    const titleRepo = new InMemoryTitleRepository();
    const copyRepo = new InMemoryCopyRepository();
    const digitalRepo = new InMemoryDigitalAssetRepository();
    const memberRepo = new InMemoryLibraryMemberRepository();
    const loanRepo = new InMemoryLoanRepository();
    const reservationRepo = new InMemoryReservationRepository();
    const policyRepo = new InMemoryCirculationPolicyRepository();
    const profileRepo = new InMemoryCollectionProfileRepository();

    const titles = new TitleService({ repository: titleRepo, organizations: orgDir, events: bus });
    const copies = new CopyService({ repository: copyRepo, titles: titleRepo, events: bus });
    const digital = new DigitalAssetService({
      repository: digitalRepo,
      organizations: orgDir,
      events: bus,
    });
    const members = new LibraryMemberService({
      repository: memberRepo,
      organizations: orgDir,
      persons: personDir,
      events: bus,
    });
    const loans = new LoanService({
      repository: loanRepo,
      copies: copyRepo,
      members: memberRepo,
      events: bus,
    });
    const reservations = new ReservationService({
      repository: reservationRepo,
      titles: titleRepo,
      members: memberRepo,
      events: bus,
    });
    const policies = new CirculationPolicyService({
      repository: policyRepo,
      organizations: orgDir,
      events: bus,
    });
    const collection = new CollectionProfileService({
      repository: profileRepo,
      organizations: orgDir,
      titles: titleRepo,
      copies: copyRepo,
      digitalAssets: digitalRepo,
      loans: loanRepo,
      reservations: reservationRepo,
      events: bus,
    });

    // 1. Circulation policy: draft, then activate.
    const policy = await policies.draft({
      tenantId,
      organizationId,
      name: "Default",
      defaultRule: { loanPeriodDays: 14, borrowingLimit: 3, renewalLimit: 2, holdShelfDays: 3 },
    });
    await policies.activate(tenantId, policy.id);
    const terms = await policies.resolveTermsForMember(tenantId, organizationId, "student");
    expect(terms.loanPeriodDays).toBe(14);

    // 2. Catalog a title with two copies and a digital asset.
    const title = await titles.catalog({
      tenantId,
      organizationId,
      title: "Clean Code",
      type: "book",
    });
    const copy = await copies.accession({ tenantId, titleId: title.id, barcode: "BC-1" });
    await copies.accession({ tenantId, titleId: title.id, barcode: "BC-2" });
    await digital.catalog({
      tenantId,
      organizationId,
      title: "E-Book",
      format: "ebook",
      accessModel: "open",
    });

    // 3. Register a member.
    const member = await members.register({
      tenantId,
      organizationId,
      personId,
      membershipNumber: "M-1",
      category: "student",
      joinedOn: "2026-01-01",
    });

    // 4. Issue a loan (resolved terms), renew it, then return it.
    const loan = await loans.issue({
      tenantId,
      copyId: copy.id,
      memberId: member.id,
      issueDate: "2026-01-01",
      loanPeriodDays: terms.loanPeriodDays,
      renewalLimit: terms.renewalLimit,
      borrowingLimit: terms.borrowingLimit,
    });
    expect((await copies.getById(tenantId, copy.id)).status).toBe("on_loan");
    await loans.renew(tenantId, loan.id);
    await loans.returnItem(tenantId, loan.id, "2026-01-10");
    expect((await copies.getById(tenantId, copy.id)).status).toBe("available");

    // 5. Reservation: place, ready, fulfil.
    const reservation = await reservations.place({
      tenantId,
      titleId: title.id,
      memberId: member.id,
      requestedOn: "2026-01-11",
    });
    await reservations.markReady(tenantId, reservation.id, "2026-01-12", "2026-01-15");
    expect((await reservations.fulfill(tenantId, reservation.id)).status).toBe("fulfilled");

    // 6. Collection profile reflects the catalog and circulation.
    const profile = await collection.refresh(tenantId, organizationId, "2026-01-20");
    expect(profile.titleCount).toBe(1);
    expect(profile.copyCount).toBe(2);
    expect(profile.availableCount).toBe(2); // the loan was returned
    expect(profile.digitalAssetCount).toBe(1);
    expect(profile.activeLoanCount).toBe(0);

    // 7. The whole spine published domain events.
    const types = new Set(events.map((e) => e.type));
    expect(types.has("library.policy.activated")).toBe(true);
    expect(types.has("library.title.cataloged")).toBe(true);
    expect(types.has("library.copy.accessioned")).toBe(true);
    expect(types.has("library.digital.cataloged")).toBe(true);
    expect(types.has("library.member.registered")).toBe(true);
    expect(types.has("library.loan.issued")).toBe(true);
    expect(types.has("library.loan.returned")).toBe(true);
    expect(types.has("library.reservation.fulfilled")).toBe(true);
    expect(types.has("library.collection.refreshed")).toBe(true);
  });
});
