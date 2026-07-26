import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AlumniEvent,
  cancelEvent,
  closeEvent,
  completeEvent,
  type CreateAlumniEventParams,
  createAlumniEvent,
  openEvent,
  renameEvent,
  scheduleEvent,
  setEventCapacity,
  setEventType,
  setEventWindow,
} from "./alumni-event";
import type { EventType } from "./alumni-value";
import {
  eventCancelled,
  eventCapacitySet,
  eventClosed,
  eventCompleted,
  eventCreated,
  eventOpened,
  eventRenamed,
  eventScheduled,
  eventTypeSet,
  eventWindowSet,
} from "./alumni-events";
import {
  DuplicateEventCodeError,
  EventNotFoundError,
  OrganizationNotFoundForAlumniError,
} from "./errors";
import type { AlumniEventRepository, OrganizationDirectory } from "./ports";

export interface AlumniEventServiceDeps {
  readonly repository: AlumniEventRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for alumni events. Creates an event (validating the organization and a unique code per
 * tenant), edits its name / type / capacity / window, and drives `draft → scheduled → open → closed →
 * completed | cancelled`, publishing the event lifecycle events. Registrations are the separate aggregate,
 * taken only while the event is open.
 */
export class AlumniEventService {
  private readonly repository: AlumniEventRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AlumniEventServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAlumniEventParams): Promise<AlumniEvent> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAlumniError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateEventCodeError(input.code.trim());
    }
    const event = createAlumniEvent(input);
    await this.repository.save(event);
    await this.emit(eventCreated(event));
    return event;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AlumniEvent> {
    const updated = renameEvent(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(eventRenamed(updated));
    return updated;
  }

  async setType(tenantId: TenantId, id: Uuid, type: EventType): Promise<AlumniEvent> {
    const updated = setEventType(await this.require(tenantId, id), type);
    await this.repository.save(updated);
    await this.emit(eventTypeSet(updated));
    return updated;
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number): Promise<AlumniEvent> {
    const updated = setEventCapacity(await this.require(tenantId, id), capacity);
    await this.repository.save(updated);
    await this.emit(eventCapacitySet(updated));
    return updated;
  }

  async setWindow(
    tenantId: TenantId,
    id: Uuid,
    startsOn: string | null,
    endsOn: string | null,
  ): Promise<AlumniEvent> {
    const updated = setEventWindow(await this.require(tenantId, id), startsOn, endsOn);
    await this.repository.save(updated);
    await this.emit(eventWindowSet(updated));
    return updated;
  }

  async schedule(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const updated = scheduleEvent(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(eventScheduled(updated));
    return updated;
  }

  async open(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const updated = openEvent(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(eventOpened(updated));
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const updated = closeEvent(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(eventClosed(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const updated = completeEvent(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(eventCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const updated = cancelEvent(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(eventCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<AlumniEvent> {
    const event = await this.repository.findByCode(tenantId, code);
    if (!event) {
      throw new EventNotFoundError(code);
    }
    return event;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniEvent[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AlumniEvent> {
    const event = await this.repository.findById(tenantId, id);
    if (!event) {
      throw new EventNotFoundError(id);
    }
    return event;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
