import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { summarizeAccessActivity } from "./access";
import { type AccessEvent, type RecordAccessEventParams, recordAccessEvent } from "./access-event";
import type { AccessActivitySummary } from "./campus-security-view";
import { accessRecorded } from "./campus-security-events";
import type { AccessEventRepository } from "./ports";

export interface AccessEventServiceDeps {
  readonly repository: AccessEventRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for access events — the append-only door log. `record` appends a decided event (the
 * decision is produced upstream by the access engine, in the access-decision spine); the log is immutable,
 * so there is no edit or delete path. Also exposes the per-credential / per-zone history and the
 * granted/denied activity summary over the pure engine.
 */
export class AccessEventService {
  private readonly repository: AccessEventRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AccessEventServiceDeps) {
    this.repository = deps.repository;
    this.events = deps.events;
  }

  async record(input: RecordAccessEventParams): Promise<AccessEvent> {
    const event = recordAccessEvent(input);
    await this.repository.save(event);
    await this.emit(accessRecorded(event));
    return event;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AccessEvent | null> {
    return this.repository.findById(tenantId, id);
  }

  async listForCredential(tenantId: TenantId, credentialId: Uuid): Promise<AccessEvent[]> {
    return this.repository.listByCredential(tenantId, credentialId);
  }

  async listForZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessEvent[]> {
    return this.repository.listByZone(tenantId, zoneId);
  }

  /** The granted/denied activity summary for a zone, derived by the pure engine over its events. */
  async summarizeForZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessActivitySummary> {
    return summarizeAccessActivity(await this.repository.listByZone(tenantId, zoneId));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
