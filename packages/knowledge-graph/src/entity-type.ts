import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyEntityTypeKeyError,
  EmptyEntityTypeLabelError,
  InvalidEntityTypeTransitionError,
} from "./errors";
import type { TypeStatus } from "./knowledge-value";

/**
 * An entity type in the ontology — the class of a knowledge node (e.g. `person`, `organization`, `student`,
 * `course`). It carries a tenant-unique `key` (the stable identifier relationships and entities reference), a
 * human `label`, and runs `draft → active → deprecated`; a deprecated type stays for the memory it explains but
 * takes no new entities. The ontology is extensible: a tenant registers the types its graph needs. Types are
 * tenant-scoped, attributed to the owning organization node (P2-D01-M01).
 */
export interface EntityType {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly status: TypeStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateEntityTypeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly label: string;
  readonly description?: string | null;
}

/** Normalize an entity-type key: trimmed, lower-cased. The canonical form entities/relationships reference. */
export const normalizeTypeKey = (key: string): string => key.trim().toLowerCase();

/** Create an entity type (status `draft`). Key and label required; key normalized. */
export function createEntityType(params: CreateEntityTypeParams): EntityType {
  const key = normalizeTypeKey(params.key);
  if (key.length === 0) {
    throw new EmptyEntityTypeKeyError();
  }
  const label = params.label.trim();
  if (label.length === 0) {
    throw new EmptyEntityTypeLabelError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    label,
    description: params.description?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (type: EntityType, patch: Partial<EntityType>): EntityType => ({
  ...type,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the type is still editable — before it is deprecated. */
const isConfigurable = (type: EntityType): boolean => type.status !== "deprecated";

/** Relabel / redescribe an entity type; not allowed once deprecated. */
export function describeEntityType(
  type: EntityType,
  patch: { label?: string; description?: string | null },
): EntityType {
  if (!isConfigurable(type)) {
    throw new InvalidEntityTypeTransitionError(type.status, "described");
  }
  const next: { label?: string; description?: string | null } = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length === 0) {
      throw new EmptyEntityTypeLabelError();
    }
    next.label = label;
  }
  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }
  return touch(type, next);
}

/** Activate a draft entity type (`draft → active`). */
export function activateEntityType(type: EntityType): EntityType {
  if (type.status !== "draft") {
    throw new InvalidEntityTypeTransitionError(type.status, "active");
  }
  return touch(type, { status: "active" });
}

/** Deprecate an entity type (`draft`/`active → deprecated`, terminal). */
export function deprecateEntityType(type: EntityType): EntityType {
  if (type.status === "deprecated") {
    throw new InvalidEntityTypeTransitionError(type.status, "deprecated");
  }
  return touch(type, { status: "deprecated" });
}

/** Whether the entity type may host new entities (draft or active). */
export const isEntityTypeUsable = (type: EntityType): boolean => type.status !== "deprecated";
