import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeCollectionUtilization, computeTitleAvailability } from "./availability";
import {
  type CollectionProfile,
  type CollectionProfileCounts,
  createCollectionProfile,
  refreshCollectionProfile,
} from "./collection-profile";
import type { Copy } from "./copy";
import { CollectionProfileNotFoundError, OrganizationNotFoundForLibraryError } from "./errors";
import { isLoanOverdue } from "./loan";
import { collectionRefreshed } from "./library-events";
import type { CollectionMemberView } from "./library-view";
import type {
  CollectionProfileRepository,
  CopyRepository,
  DigitalAssetRepository,
  LoanRepository,
  OrganizationDirectory,
  ReservationRepository,
  TitleRepository,
} from "./ports";
import { isReservationOpen } from "./reservation";

export interface CollectionProfileServiceDeps {
  readonly repository: CollectionProfileRepository;
  readonly organizations: OrganizationDirectory;
  readonly titles: TitleRepository;
  readonly copies: CopyRepository;
  readonly digitalAssets: DigitalAssetRepository;
  readonly loans: LoanRepository;
  readonly reservations: ReservationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

const memberViewFor = (copies: readonly Copy[]): CollectionMemberView => {
  const availability = computeTitleAvailability(copies);
  return {
    copyCount: availability.totalCopies,
    availableCount: availability.availableCopies,
    onLoanCount: availability.onLoanCount,
  };
};

/**
 * Application service for the collection profile — the descriptive read model. `refresh` reconciles an
 * organization's catalog, holdings, digital assets and circulation (as of a date) through the pure
 * engines and creates or version-bumps the one profile per organization. It is always derived, never
 * posted to directly. Publishes the refresh event.
 */
export class CollectionProfileService {
  private readonly repository: CollectionProfileRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly titles: TitleRepository;
  private readonly copies: CopyRepository;
  private readonly digitalAssets: DigitalAssetRepository;
  private readonly loans: LoanRepository;
  private readonly reservations: ReservationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CollectionProfileServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.titles = deps.titles;
    this.copies = deps.copies;
    this.digitalAssets = deps.digitalAssets;
    this.loans = deps.loans;
    this.reservations = deps.reservations;
    this.events = deps.events;
  }

  async refresh(
    tenantId: TenantId,
    organizationId: Uuid,
    asOfDate: string,
  ): Promise<CollectionProfile> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForLibraryError(organizationId);
    }
    const titles = await this.titles.listByOrganization(tenantId, organizationId);
    const copies = await this.copies.listByOrganization(tenantId, organizationId);
    const byTitle = new Map<string, Copy[]>();
    for (const copy of copies) {
      const group = byTitle.get(copy.titleId) ?? [];
      group.push(copy);
      byTitle.set(copy.titleId, group);
    }
    const members = [...byTitle.values()].map(memberViewFor);
    const utilization = computeCollectionUtilization(members);
    const lostCount = copies.filter((c) => c.status === "lost").length;

    const digitalAssets = await this.digitalAssets.listByOrganization(tenantId, organizationId);
    const loans = await this.loans.listByOrganization(tenantId, organizationId);
    const reservations = await this.reservations.listByOrganization(tenantId, organizationId);

    const counts: CollectionProfileCounts = {
      titleCount: titles.length,
      copyCount: utilization.copyCount,
      availableCount: utilization.availableCount,
      onLoanCount: utilization.onLoanCount,
      lostCount,
      digitalAssetCount: digitalAssets.filter((a) => a.status === "active").length,
      activeLoanCount: loans.filter((l) => l.status === "active").length,
      overdueLoanCount: loans.filter((l) => isLoanOverdue(l, asOfDate)).length,
      openReservationCount: reservations.filter(isReservationOpen).length,
      utilizationPercent: utilization.utilizationPercent,
    };

    const existing = await this.repository.findByOrganization(tenantId, organizationId);
    const profile = existing
      ? refreshCollectionProfile(existing, counts)
      : createCollectionProfile({ tenantId, organizationId, counts });
    await this.repository.save(profile);
    await this.emit(collectionRefreshed(profile));
    return profile;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CollectionProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new CollectionProfileNotFoundError(id);
    }
    return profile;
  }

  async getForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CollectionProfile | null> {
    return this.repository.findByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<CollectionProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
