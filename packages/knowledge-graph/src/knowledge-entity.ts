import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyEntitySourceError,
  InvalidKnowledgeEntityTransitionError,
  SelfMergeError,
} from "./errors";
import { normalizeTypeKey } from "./entity-type";
import type { EntityStatus } from "./knowledge-value";

/**
 * A knowledge entity — a node in the graph, with a global id and an entity type from the ontology. It
 * *represents* a record that lives in an operational domain (a person, an organization, a student, a course):
 * `sourceDomain` + `sourceRef` name that record; the graph never re-models it, only references it. One node per
 * (tenant, source domain, source record). Its lifecycle is `active → merged | archived`: `merged` is identity
 * resolution — the node was found to be the same real thing as another and points at the canonical twin
 * (`mergedIntoId`), the digital memory keeping the merge rather than deleting the node; `archived` retires it.
 */
export interface KnowledgeEntity {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly entityTypeKey: string;
  readonly sourceDomain: string;
  readonly sourceRef: string;
  readonly label: string | null;
  readonly status: EntityStatus;
  readonly mergedIntoId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateKnowledgeEntityParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly entityTypeKey: string;
  readonly sourceDomain: string;
  readonly sourceRef: string;
  readonly label?: string | null;
}

/** Normalize a source-domain key: trimmed, lower-cased (e.g. `Person` → `person`). */
export const normalizeSourceDomain = (domain: string): string => domain.trim().toLowerCase();

/**
 * Create a knowledge entity (status `active`). Entity-type key is normalized; source domain and record ref are
 * required (a node grounds in a domain record). The caller (service) has already checked the type is registered.
 */
export function createKnowledgeEntity(params: CreateKnowledgeEntityParams): KnowledgeEntity {
  const entityTypeKey = normalizeTypeKey(params.entityTypeKey);
  const sourceDomain = normalizeSourceDomain(params.sourceDomain);
  const sourceRef = params.sourceRef.trim();
  if (entityTypeKey.length === 0 || sourceDomain.length === 0 || sourceRef.length === 0) {
    throw new EmptyEntitySourceError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    entityTypeKey,
    sourceDomain,
    sourceRef,
    label: params.label?.trim() || null,
    status: "active",
    mergedIntoId: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (entity: KnowledgeEntity, patch: Partial<KnowledgeEntity>): KnowledgeEntity => ({
  ...entity,
  ...patch,
  updatedAt: nowIso(),
});

/** Relabel an active entity's display hint; not allowed once merged or archived. */
export function relabelKnowledgeEntity(
  entity: KnowledgeEntity,
  label: string | null,
): KnowledgeEntity {
  if (entity.status !== "active") {
    throw new InvalidKnowledgeEntityTransitionError(entity.status, "relabeled");
  }
  return touch(entity, { label: label?.trim() || null });
}

/**
 * Merge an active entity into a canonical twin (`active → merged`, terminal). Identity resolution: this node is
 * the same real thing as `intoId`; it retires pointing at the canonical. Cannot merge a node into itself, nor
 * merge one that is already merged or archived.
 */
export function mergeKnowledgeEntity(entity: KnowledgeEntity, intoId: Uuid): KnowledgeEntity {
  if (entity.status !== "active") {
    throw new InvalidKnowledgeEntityTransitionError(entity.status, "merged");
  }
  if (intoId === entity.id) {
    throw new SelfMergeError(entity.id);
  }
  return touch(entity, { status: "merged", mergedIntoId: intoId });
}

/** Archive an active entity (`active → archived`, terminal). */
export function archiveKnowledgeEntity(entity: KnowledgeEntity): KnowledgeEntity {
  if (entity.status !== "active") {
    throw new InvalidKnowledgeEntityTransitionError(entity.status, "archived");
  }
  return touch(entity, { status: "archived" });
}

/** The canonical id for this node — its merge target if merged, otherwise itself. */
export const canonicalIdOf = (entity: KnowledgeEntity): Uuid => entity.mergedIntoId ?? entity.id;

/** Whether the node is live in the graph (active — not merged away or archived). */
export const isKnowledgeEntityActive = (entity: KnowledgeEntity): boolean =>
  entity.status === "active";
