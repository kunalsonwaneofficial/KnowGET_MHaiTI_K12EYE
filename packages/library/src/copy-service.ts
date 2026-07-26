import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeTitleAvailability } from "./availability";
import {
  type AccessionCopyParams,
  accessionCopy,
  type Copy,
  markCopyLost,
  setCopyCondition,
  setCopyLocation,
  withdrawCopy,
} from "./copy";
import {
  CopyNotFoundError,
  CopyOnLoanError,
  DuplicateBarcodeError,
  TitleNotActiveError,
  TitleNotFoundError,
} from "./errors";
import { isTitleActive } from "./title";
import type { CopyRepository, TitleRepository } from "./ports";
import { copyAccessioned, copyLost, copyWithdrawn } from "./library-events";
import type { CopyCondition } from "./library-value";
import type { TitleAvailability } from "./library-view";

/** The service accession input — the organization is derived from the title, not supplied. */
export type AccessionCopyInput = Omit<AccessionCopyParams, "organizationId">;

export interface CopyServiceDeps {
  readonly repository: CopyRepository;
  readonly titles: TitleRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for physical copies. Accessions a copy under an active title (deriving the
 * organization from the title and enforcing a unique barcode), edits its location/condition, marks it lost
 * or withdrawn, and answers a title's availability via the pure engine. Loans issue and return copies (the
 * loan service drives those transitions). Publishes the copy events.
 */
export class CopyService {
  private readonly repository: CopyRepository;
  private readonly titles: TitleRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CopyServiceDeps) {
    this.repository = deps.repository;
    this.titles = deps.titles;
    this.events = deps.events;
  }

  async accession(input: AccessionCopyInput): Promise<Copy> {
    const title = await this.titles.findById(input.tenantId, input.titleId);
    if (!title) {
      throw new TitleNotFoundError(input.titleId);
    }
    if (!isTitleActive(title)) {
      throw new TitleNotActiveError(input.titleId);
    }
    if (await this.repository.findByBarcode(input.tenantId, input.barcode.trim())) {
      throw new DuplicateBarcodeError(input.barcode.trim());
    }
    const copy = accessionCopy({ ...input, organizationId: title.organizationId });
    await this.repository.save(copy);
    await this.emit(copyAccessioned(copy));
    return copy;
  }

  async setLocation(tenantId: TenantId, id: Uuid, location: string | null): Promise<Copy> {
    return this.mutate(tenantId, id, (c) => setCopyLocation(c, location));
  }

  async setCondition(tenantId: TenantId, id: Uuid, condition: CopyCondition): Promise<Copy> {
    return this.mutate(tenantId, id, (c) => setCopyCondition(c, condition));
  }

  async markLost(tenantId: TenantId, id: Uuid): Promise<Copy> {
    const copy = await this.require(tenantId, id);
    // An on-loan copy can only be lost through the loan (LoanService.markLost), which reconciles the loan
    // and the copy together; losing it here would leave the loan active and the item double-counted.
    if (copy.status === "on_loan") {
      throw new CopyOnLoanError(id);
    }
    const updated = markCopyLost(copy);
    await this.repository.save(updated);
    await this.emit(copyLost(updated));
    return updated;
  }

  async withdraw(tenantId: TenantId, id: Uuid): Promise<Copy> {
    const updated = withdrawCopy(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(copyWithdrawn(updated));
    return updated;
  }

  async availabilityForTitle(tenantId: TenantId, titleId: Uuid): Promise<TitleAvailability> {
    const copies = await this.repository.listByTitle(tenantId, titleId);
    return computeTitleAvailability(copies);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Copy> {
    return this.require(tenantId, id);
  }

  async getByBarcode(tenantId: TenantId, barcode: string): Promise<Copy> {
    const copy = await this.repository.findByBarcode(tenantId, barcode);
    if (!copy) {
      throw new CopyNotFoundError(barcode);
    }
    return copy;
  }

  async listForTitle(tenantId: TenantId, titleId: Uuid): Promise<Copy[]> {
    return this.repository.listByTitle(tenantId, titleId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Copy[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (copy: Copy) => Copy): Promise<Copy> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Copy> {
    const copy = await this.repository.findById(tenantId, id);
    if (!copy) {
      throw new CopyNotFoundError(id);
    }
    return copy;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
