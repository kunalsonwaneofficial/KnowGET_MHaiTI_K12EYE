import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyRelationshipTypeKeyError,
  EmptyRelationshipTypeLabelError,
  InvalidRelationshipTypeTransitionError,
} from "./errors";
import { normalizeTypeKey } from "./entity-type";
import type { Cardinality, TypeStatus } from "./knowledge-value";

/**
 * A relationship type in the ontology — the class of a semantic edge (e.g. `enrolled_in`, `guardian_of`,
 * `teaches`). It carries a tenant-unique `key`, a `label`, the entity-type keys it may connect
 * (`sourceEntityTypeKey → targetEntityTypeKey`) and a `cardinality`, and runs `draft → active → deprecated`.
 * The source/target constraints are the ontology's structural grammar: a `guardian_of` edge is `person → person`,
 * an `enrolled_in` edge is `student → course`. The type keys are validated against registered entity types when
 * the type is created. Tenant-scoped, attributed to the owning organization node (P2-D01-M01).
 */
export interface RelationshipType {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly label: string;
  readonly sourceEntityTypeKey: string;
  readonly targetEntityTypeKey: string;
  readonly cardinality: Cardinality;
  readonly description: string | null;
  readonly status: TypeStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateRelationshipTypeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly label: string;
  readonly sourceEntityTypeKey: string;
  readonly targetEntityTypeKey: string;
  readonly cardinality: Cardinality;
  readonly description?: string | null;
}

/** Create a relationship type (status `draft`). Key, label and both endpoint type keys required; keys normalized. */
export function createRelationshipType(params: CreateRelationshipTypeParams): RelationshipType {
  const key = normalizeTypeKey(params.key);
  if (key.length === 0) {
    throw new EmptyRelationshipTypeKeyError();
  }
  const label = params.label.trim();
  if (label.length === 0) {
    throw new EmptyRelationshipTypeLabelError();
  }
  const sourceEntityTypeKey = normalizeTypeKey(params.sourceEntityTypeKey);
  const targetEntityTypeKey = normalizeTypeKey(params.targetEntityTypeKey);
  if (sourceEntityTypeKey.length === 0 || targetEntityTypeKey.length === 0) {
    throw new EmptyRelationshipTypeKeyError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    label,
    sourceEntityTypeKey,
    targetEntityTypeKey,
    cardinality: params.cardinality,
    description: params.description?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (type: RelationshipType, patch: Partial<RelationshipType>): RelationshipType => ({
  ...type,
  ...patch,
  updatedAt: nowIso(),
});

const isConfigurable = (type: RelationshipType): boolean => type.status !== "deprecated";

/** Relabel / redescribe a relationship type; not allowed once deprecated. */
export function describeRelationshipType(
  type: RelationshipType,
  patch: { label?: string; description?: string | null },
): RelationshipType {
  if (!isConfigurable(type)) {
    throw new InvalidRelationshipTypeTransitionError(type.status, "described");
  }
  const next: { label?: string; description?: string | null } = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length === 0) {
      throw new EmptyRelationshipTypeLabelError();
    }
    next.label = label;
  }
  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }
  return touch(type, next);
}

/** Set the cardinality; not allowed once deprecated. */
export function setRelationshipCardinality(
  type: RelationshipType,
  cardinality: Cardinality,
): RelationshipType {
  if (!isConfigurable(type)) {
    throw new InvalidRelationshipTypeTransitionError(type.status, "cardinality-set");
  }
  return touch(type, { cardinality });
}

/** Activate a draft relationship type (`draft → active`). */
export function activateRelationshipType(type: RelationshipType): RelationshipType {
  if (type.status !== "draft") {
    throw new InvalidRelationshipTypeTransitionError(type.status, "active");
  }
  return touch(type, { status: "active" });
}

/** Deprecate a relationship type (`draft`/`active → deprecated`, terminal). */
export function deprecateRelationshipType(type: RelationshipType): RelationshipType {
  if (type.status === "deprecated") {
    throw new InvalidRelationshipTypeTransitionError(type.status, "deprecated");
  }
  return touch(type, { status: "deprecated" });
}

/** Whether the relationship type may host new relationships (draft or active). */
export const isRelationshipTypeUsable = (type: RelationshipType): boolean =>
  type.status !== "deprecated";
