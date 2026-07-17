import type { CorrelationId, ISODateString, Uuid } from "@knowget/types";
import type { AuditMetadata } from "./entity";

/** The "who/when" used to stamp audit metadata. */
export interface AuditActor {
  readonly now: ISODateString;
  readonly actorId?: Uuid;
  readonly correlationId?: CorrelationId;
}

/** Produce audit metadata for a newly created entity. */
export function stampCreate(actor: AuditActor): AuditMetadata {
  return {
    createdAt: actor.now,
    updatedAt: actor.now,
    createdBy: actor.actorId,
    updatedBy: actor.actorId,
    correlationId: actor.correlationId,
  };
}

/** Produce audit metadata for an updated entity, preserving creation fields. */
export function stampUpdate(existing: AuditMetadata, actor: AuditActor): AuditMetadata {
  return {
    ...existing,
    updatedAt: actor.now,
    updatedBy: actor.actorId ?? existing.updatedBy,
    correlationId: actor.correlationId ?? existing.correlationId,
  };
}
