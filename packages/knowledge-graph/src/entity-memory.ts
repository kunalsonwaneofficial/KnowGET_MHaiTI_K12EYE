import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EntityMemoryView } from "./knowledge-view";

/**
 * The digital memory of an entity — a re-derivable read model, one per knowledge entity, that the refresh spine
 * maintains from the graph: how connected the entity is (degree, over the live edges), how much still stands
 * about it (assertion counts) and how confident that body of assertion is on aggregate. It is never authored;
 * every field is computed by the pure engines, so it can be rebuilt from the entities, relationships and
 * assertions at any time. It is the descriptive summary the later intelligence domains (P2-D26+) read first.
 */
export interface EntityMemory {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly entityId: Uuid;
  readonly outDegree: number;
  readonly inDegree: number;
  readonly degree: number;
  readonly assertionCount: number;
  readonly groundedAssertionCount: number;
  readonly aggregateConfidence: number;
  readonly refreshedAt: ISODateString;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateEntityMemoryParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly entityId: Uuid;
  readonly view: EntityMemoryView;
}

/** Create an entity memory from a freshly computed view (the spine's first refresh for an entity). */
export function createEntityMemory(params: CreateEntityMemoryParams): EntityMemory {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    entityId: params.entityId,
    ...params.view,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh an existing entity memory with a newly computed view — re-derivation, keeping identity. */
export function refreshEntityMemory(existing: EntityMemory, view: EntityMemoryView): EntityMemory {
  const now = nowIso();
  return { ...existing, ...view, refreshedAt: now, updatedAt: now };
}
