import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isEventOpen } from "./alumni-event";
import {
  cancelRegistration,
  type EventRegistration,
  isRegistrationConfirmed,
  markAttended,
  markNoShow,
  registerForEvent,
  reinstateRegistration,
} from "./event-registration";
import {
  registrationAttended,
  registrationCancelled,
  registrationNoShow,
  registrationRegistered,
  registrationReinstated,
} from "./alumni-events";
import {
  AlumniProfileNotFoundError,
  DuplicateRegistrationError,
  EventNotFoundError,
  EventNotOpenError,
  RegistrationNotFoundError,
} from "./errors";
import type {
  AlumniEventRepository,
  AlumniProfileRepository,
  EventRegistrationRepository,
} from "./ports";

export interface RegisterForEventInput {
  readonly tenantId: TenantId;
  readonly eventId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly registeredOn: string;
}

export interface EventRegistrationServiceDeps {
  readonly repository: EventRegistrationRepository;
  readonly alumniEvents: AlumniEventRepository;
  readonly profiles: AlumniProfileRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for event registrations. Registers an alumni profile for an open event (validating the
 * event and the profile, deriving the organization from the event), maintaining **one registration row per
 * (event, alumnus)** — a returning registrant whose prior registration was cancelled is reinstated rather
 * than duplicated — and drives attendance / no-show / cancellation, publishing the registration events.
 */
export class EventRegistrationService {
  private readonly repository: EventRegistrationRepository;
  private readonly alumniEvents: AlumniEventRepository;
  private readonly profiles: AlumniProfileRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EventRegistrationServiceDeps) {
    this.repository = deps.repository;
    this.alumniEvents = deps.alumniEvents;
    this.profiles = deps.profiles;
    this.events = deps.events;
  }

  async register(input: RegisterForEventInput): Promise<EventRegistration> {
    const event = await this.alumniEvents.findById(input.tenantId, input.eventId);
    if (!event) {
      throw new EventNotFoundError(input.eventId);
    }
    if (!isEventOpen(event)) {
      throw new EventNotOpenError(input.eventId);
    }
    if (!(await this.profiles.findById(input.tenantId, input.alumniProfileId))) {
      throw new AlumniProfileNotFoundError(input.alumniProfileId);
    }
    const existing = await this.repository.findByEventAndAlumnus(
      input.tenantId,
      input.eventId,
      input.alumniProfileId,
    );
    if (existing) {
      if (isRegistrationConfirmed(existing)) {
        throw new DuplicateRegistrationError(input.eventId, input.alumniProfileId);
      }
      const reinstated = reinstateRegistration(existing, input.registeredOn);
      await this.repository.save(reinstated);
      await this.emit(registrationReinstated(reinstated));
      return reinstated;
    }
    const registration = registerForEvent({
      tenantId: input.tenantId,
      organizationId: event.organizationId,
      eventId: input.eventId,
      alumniProfileId: input.alumniProfileId,
      registeredOn: input.registeredOn,
    });
    await this.repository.save(registration);
    await this.emit(registrationRegistered(registration));
    return registration;
  }

  async markAttended(
    tenantId: TenantId,
    id: Uuid,
    respondedOn: string,
  ): Promise<EventRegistration> {
    const updated = markAttended(await this.require(tenantId, id), respondedOn);
    await this.repository.save(updated);
    await this.emit(registrationAttended(updated));
    return updated;
  }

  async markNoShow(tenantId: TenantId, id: Uuid, respondedOn: string): Promise<EventRegistration> {
    const updated = markNoShow(await this.require(tenantId, id), respondedOn);
    await this.repository.save(updated);
    await this.emit(registrationNoShow(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid, respondedOn: string): Promise<EventRegistration> {
    const updated = cancelRegistration(await this.require(tenantId, id), respondedOn);
    await this.repository.save(updated);
    await this.emit(registrationCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EventRegistration> {
    return this.require(tenantId, id);
  }

  async listForEvent(tenantId: TenantId, eventId: Uuid): Promise<EventRegistration[]> {
    return this.repository.listByEvent(tenantId, eventId);
  }

  async listForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<EventRegistration[]> {
    return this.repository.listByAlumnus(tenantId, alumniProfileId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EventRegistration> {
    const registration = await this.repository.findById(tenantId, id);
    if (!registration) {
      throw new RegistrationNotFoundError(id);
    }
    return registration;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
