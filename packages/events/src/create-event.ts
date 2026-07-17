import { newUuid, nowIso } from "@knowget/shared";
import type { DomainEvent, EventMetadata } from "@knowget/types";

/**
 * Build a well-formed domain event, filling in default metadata (a fresh event
 * id, the current timestamp and schema version 1) while allowing overrides such
 * as `tenantId`, `correlationId` and `causationId`.
 */
export function createEvent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  metadata: Partial<EventMetadata> = {},
): DomainEvent<TType, TPayload> {
  return {
    type,
    payload,
    metadata: {
      eventId: newUuid(),
      occurredAt: nowIso(),
      version: 1,
      ...metadata,
    },
  };
}
