import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyRelationshipEndpointsError,
  InvalidRelationshipWindowError,
  InvalidSemanticRelationshipTransitionError,
  SelfRelationshipError,
} from "./errors";
import { normalizeTypeKey } from "./entity-type";
import type { RelationshipStatus } from "./knowledge-value";

/**
 * A semantic relationship — a directed edge in the graph, typed by the ontology (`relationshipTypeKey`) and
 * running from one knowledge entity to another. It is **time-aware** (a `validFrom`/`validTo` window; an open
 * `validTo` never ends) and **versioned** (a `version`, and `supersedesId` pointing at the prior version it
 * replaced) — the two halves of the graph's digital memory. Its lifecycle is `asserted → superseded | retracted`:
 * a new version supersedes the old (the record is kept, not overwritten); a withdrawal retracts it. The engines
 * read this shape directly ({@link RelationshipView}); the temporal engine resolves which edges were live when.
 */
export interface SemanticRelationship {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly relationshipTypeKey: string;
  readonly sourceEntityId: Uuid;
  readonly targetEntityId: Uuid;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly version: number;
  readonly supersedesId: Uuid | null;
  readonly status: RelationshipStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSemanticRelationshipParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly relationshipTypeKey: string;
  readonly sourceEntityId: Uuid;
  readonly targetEntityId: Uuid;
  readonly validFrom?: string;
  readonly validTo?: string | null;
}

/** Validate a window: an end (if any) must not precede the start. Returns the normalized [from, to]. */
function validateWindow(validFrom: string, validTo: string | null): [string, string | null] {
  const from = validFrom.trim();
  if (from.length === 0) {
    throw new InvalidRelationshipWindowError(validFrom, validTo);
  }
  const to = validTo?.trim() || null;
  if (to !== null) {
    const f = Date.parse(from);
    const t = Date.parse(to);
    if (Number.isNaN(f) || Number.isNaN(t) || t <= f) {
      throw new InvalidRelationshipWindowError(from, to);
    }
  }
  return [from, to];
}

/**
 * Create a semantic relationship (version 1, status `asserted`). Endpoints required and distinct; type key
 * normalized; window validated (`validFrom` defaults to now, `validTo` open). The caller (service) has already
 * checked the type is registered and the endpoints exist with matching types.
 */
export function createSemanticRelationship(
  params: CreateSemanticRelationshipParams,
): SemanticRelationship {
  const relationshipTypeKey = normalizeTypeKey(params.relationshipTypeKey);
  if (relationshipTypeKey.length === 0 || !params.sourceEntityId || !params.targetEntityId) {
    throw new EmptyRelationshipEndpointsError();
  }
  if (params.sourceEntityId === params.targetEntityId) {
    throw new SelfRelationshipError(params.sourceEntityId);
  }
  const now = nowIso();
  const [validFrom, validTo] = validateWindow(params.validFrom ?? now, params.validTo ?? null);
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    relationshipTypeKey,
    sourceEntityId: params.sourceEntityId,
    targetEntityId: params.targetEntityId,
    validFrom,
    validTo,
    version: 1,
    supersedesId: null,
    status: "asserted",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  rel: SemanticRelationship,
  patch: Partial<SemanticRelationship>,
): SemanticRelationship => ({ ...rel, ...patch, updatedAt: nowIso() });

/** Close an asserted relationship's window by setting its end (`validTo`); the edge stays asserted. */
export function closeRelationship(
  rel: SemanticRelationship,
  validTo: string,
): SemanticRelationship {
  if (rel.status !== "asserted") {
    throw new InvalidSemanticRelationshipTransitionError(rel.status, "closed");
  }
  const [, to] = validateWindow(rel.validFrom, validTo);
  return touch(rel, { validTo: to });
}

/** Retract an asserted relationship (`asserted → retracted`, terminal) — a withdrawal, not a new version. */
export function retractRelationship(rel: SemanticRelationship): SemanticRelationship {
  if (rel.status !== "asserted") {
    throw new InvalidSemanticRelationshipTransitionError(rel.status, "retracted");
  }
  return touch(rel, { status: "retracted" });
}

/** Mark an asserted relationship superseded (`asserted → superseded`) — used when a successor replaces it. */
export function markSuperseded(rel: SemanticRelationship): SemanticRelationship {
  if (rel.status !== "asserted") {
    throw new InvalidSemanticRelationshipTransitionError(rel.status, "superseded");
  }
  return touch(rel, { status: "superseded" });
}

/**
 * Build the successor version of a relationship (a new asserted edge, `version + 1`, `supersedesId` the
 * current). Same endpoints and type; the window may be revised. Pair with {@link markSuperseded} on the current
 * edge — the service does both so the prior version is preserved, not overwritten.
 */
export function supersedeRelationship(
  current: SemanticRelationship,
  patch: { validFrom?: string; validTo?: string | null } = {},
): SemanticRelationship {
  if (current.status !== "asserted") {
    throw new InvalidSemanticRelationshipTransitionError(current.status, "superseded-by");
  }
  const now = nowIso();
  const [validFrom, validTo] = validateWindow(
    patch.validFrom ?? now,
    patch.validTo !== undefined ? patch.validTo : current.validTo,
  );
  return {
    id: newUuid(),
    tenantId: current.tenantId,
    organizationId: current.organizationId,
    relationshipTypeKey: current.relationshipTypeKey,
    sourceEntityId: current.sourceEntityId,
    targetEntityId: current.targetEntityId,
    validFrom,
    validTo,
    version: current.version + 1,
    supersedesId: current.id,
    status: "asserted",
    createdAt: now,
    updatedAt: now,
  };
}

/** Whether the edge is a live assertion (asserted). */
export const isRelationshipLive = (rel: SemanticRelationship): boolean => rel.status === "asserted";
