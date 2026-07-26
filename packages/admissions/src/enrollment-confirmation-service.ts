import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type EnrollmentConfirmation, confirmEnrollment } from "./enrollment-confirmation";
import { isOfferAccepted } from "./offer";
import { enrollmentConfirmed } from "./admissions-events";
import {
  ApplicationNotFoundError,
  DuplicateEnrollmentConfirmationError,
  OfferNotAcceptedError,
  OfferNotFoundError,
} from "./errors";
import type {
  ApplicationRepository,
  EnrollmentConfirmationRepository,
  OfferRepository,
} from "./ports";

export interface ConfirmEnrollmentInput {
  readonly tenantId: TenantId;
  readonly offerId: Uuid;
  readonly confirmedOn: string;
  readonly studentId?: Uuid | null;
}

export interface EnrollmentConfirmationServiceDeps {
  readonly repository: EnrollmentConfirmationRepository;
  readonly offers: OfferRepository;
  readonly applications: ApplicationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for enrollment confirmations — the close of the admissions funnel. Confirms an
 * enrollment from an accepted offer (one confirmation per offer), deriving the organization, cycle, grade and
 * applicant from the offer and its application, and publishes `admissions.enrollment.confirmed` — the
 * hand-off signal Student Lifecycle (P2-D03) consumes to enrol the student. Confirmations are immutable, so
 * there is no update or delete.
 */
export class EnrollmentConfirmationService {
  private readonly repository: EnrollmentConfirmationRepository;
  private readonly offers: OfferRepository;
  private readonly applications: ApplicationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EnrollmentConfirmationServiceDeps) {
    this.repository = deps.repository;
    this.offers = deps.offers;
    this.applications = deps.applications;
    this.events = deps.events;
  }

  async confirm(input: ConfirmEnrollmentInput): Promise<EnrollmentConfirmation> {
    const offer = await this.offers.findById(input.tenantId, input.offerId);
    if (!offer) {
      throw new OfferNotFoundError(input.offerId);
    }
    if (!isOfferAccepted(offer)) {
      throw new OfferNotAcceptedError(input.offerId);
    }
    if (await this.repository.findByOffer(input.tenantId, input.offerId)) {
      throw new DuplicateEnrollmentConfirmationError(input.offerId);
    }
    const application = await this.applications.findById(input.tenantId, offer.applicationId);
    if (!application) {
      throw new ApplicationNotFoundError(offer.applicationId);
    }
    const confirmation = confirmEnrollment({
      tenantId: input.tenantId,
      organizationId: offer.organizationId,
      offerId: offer.id,
      applicationId: offer.applicationId,
      cycleId: offer.cycleId,
      applicantPersonId: application.applicantPersonId,
      gradeConfirmed: offer.gradeOffered,
      studentId: input.studentId ?? null,
      confirmedOn: input.confirmedOn,
    });
    await this.repository.save(confirmation);
    await this.emit(enrollmentConfirmed(confirmation));
    return confirmation;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EnrollmentConfirmation | null> {
    return this.repository.findById(tenantId, id);
  }

  async getByOffer(tenantId: TenantId, offerId: Uuid): Promise<EnrollmentConfirmation | null> {
    return this.repository.findByOffer(tenantId, offerId);
  }

  async listForCycle(tenantId: TenantId, cycleId: Uuid): Promise<EnrollmentConfirmation[]> {
    return this.repository.listByCycle(tenantId, cycleId);
  }

  async countForCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return this.repository.countByCycle(tenantId, cycleId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
