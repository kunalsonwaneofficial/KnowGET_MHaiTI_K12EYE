import type { CorrelationId, ISODateString, TenantId, Uuid } from "./brand";

/**
 * Metadata carried by every domain event. This is the foundation of the
 * event-driven integration model that Phase-1 (P1-M05) and Phase-3 (P3-D02)
 * build upon — every significant institutional fact becomes a governed event.
 */
export interface EventMetadata {
  readonly eventId: Uuid;
  readonly occurredAt: ISODateString;
  readonly tenantId?: TenantId;
  readonly correlationId?: CorrelationId;
  readonly causationId?: Uuid;
  /** Schema version of the event payload, for forward/backward compatibility. */
  readonly version: number;
}

/**
 * Base shape of a domain event. Concrete events narrow `type` and `payload`.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}
