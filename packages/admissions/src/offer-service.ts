import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isApplicationOffered } from "./application";
import {
  acceptOffer,
  declineOffer,
  expireOffer,
  extendOffer,
  type Offer,
  withdrawOffer,
} from "./offer";
import {
  offerAccepted,
  offerDeclined,
  offerExpired,
  offerExtended,
  offerWithdrawn,
} from "./admissions-events";
import {
  ApplicationNotFoundError,
  ApplicationNotInOfferStateError,
  OfferAlreadyExistsError,
  OfferNotFoundError,
} from "./errors";
import type { ApplicationRepository, OfferRepository } from "./ports";

export interface ExtendOfferInput {
  readonly tenantId: TenantId;
  readonly applicationId: Uuid;
  readonly extendedOn: string;
  readonly gradeOffered?: string;
  readonly respondBy?: string | null;
}

export interface OfferServiceDeps {
  readonly repository: OfferRepository;
  readonly applications: ApplicationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for admission offers. Extends an offer for an application that has reached the `offered`
 * state (one offer per application, its grade and cycle derived from the application), and drives
 * `extended → accepted | declined | expired | withdrawn`, publishing the offer events. Accepting an offer is
 * the bridge the enrollment-confirmation service builds on.
 */
export class OfferService {
  private readonly repository: OfferRepository;
  private readonly applications: ApplicationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: OfferServiceDeps) {
    this.repository = deps.repository;
    this.applications = deps.applications;
    this.events = deps.events;
  }

  async extend(input: ExtendOfferInput): Promise<Offer> {
    const application = await this.applications.findById(input.tenantId, input.applicationId);
    if (!application) {
      throw new ApplicationNotFoundError(input.applicationId);
    }
    if (!isApplicationOffered(application)) {
      throw new ApplicationNotInOfferStateError(input.applicationId);
    }
    if (await this.repository.findByApplication(input.tenantId, input.applicationId)) {
      throw new OfferAlreadyExistsError(input.applicationId);
    }
    const offer = extendOffer({
      tenantId: input.tenantId,
      organizationId: application.organizationId,
      applicationId: input.applicationId,
      cycleId: application.cycleId,
      gradeOffered: input.gradeOffered?.trim() || application.gradeApplyingFor,
      extendedOn: input.extendedOn,
      respondBy: input.respondBy ?? null,
    });
    await this.repository.save(offer);
    await this.emit(offerExtended(offer));
    return offer;
  }

  async accept(tenantId: TenantId, id: Uuid, respondedOn: string): Promise<Offer> {
    const updated = acceptOffer(await this.require(tenantId, id), respondedOn);
    await this.repository.save(updated);
    await this.emit(offerAccepted(updated));
    return updated;
  }

  async decline(tenantId: TenantId, id: Uuid, respondedOn: string): Promise<Offer> {
    const updated = declineOffer(await this.require(tenantId, id), respondedOn);
    await this.repository.save(updated);
    await this.emit(offerDeclined(updated));
    return updated;
  }

  async expire(tenantId: TenantId, id: Uuid): Promise<Offer> {
    const updated = expireOffer(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(offerExpired(updated));
    return updated;
  }

  async withdraw(tenantId: TenantId, id: Uuid): Promise<Offer> {
    const updated = withdrawOffer(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(offerWithdrawn(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Offer> {
    return this.require(tenantId, id);
  }

  async getByApplication(tenantId: TenantId, applicationId: Uuid): Promise<Offer | null> {
    return this.repository.findByApplication(tenantId, applicationId);
  }

  async listForCycle(tenantId: TenantId, cycleId: Uuid): Promise<Offer[]> {
    return this.repository.listByCycle(tenantId, cycleId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Offer> {
    const offer = await this.repository.findById(tenantId, id);
    if (!offer) {
      throw new OfferNotFoundError(id);
    }
    return offer;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
