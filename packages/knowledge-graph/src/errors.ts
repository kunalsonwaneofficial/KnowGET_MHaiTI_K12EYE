import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) that owns an ontology / graph record does not exist. */
export class OrganizationNotFoundForKnowledgeError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the knowledge record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

// --- Entity type (ontology) ------------------------------------------------------

/** The requested entity type does not exist in the current tenant. */
export class EntityTypeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Entity type "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An entity type must carry a non-empty key. */
export class EmptyEntityTypeKeyError extends PlatformError {
  constructor() {
    super("An entity type must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An entity type must carry a non-empty label. */
export class EmptyEntityTypeLabelError extends PlatformError {
  constructor() {
    super("An entity type must have a non-empty label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An entity type with this key already exists — type keys are one per tenant. */
export class DuplicateEntityTypeError extends PlatformError {
  constructor(key: string) {
    super(`An entity type with key "${key}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The attempted entity-type lifecycle transition is not allowed from its current status. */
export class InvalidEntityTypeTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An entity type cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Relationship type (ontology) ------------------------------------------------

/** The requested relationship type does not exist in the current tenant. */
export class RelationshipTypeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Relationship type "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A relationship type must carry a non-empty key (its own or an endpoint entity-type key). */
export class EmptyRelationshipTypeKeyError extends PlatformError {
  constructor() {
    super("A relationship type must have a non-empty key and endpoint type keys", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A relationship type must carry a non-empty label. */
export class EmptyRelationshipTypeLabelError extends PlatformError {
  constructor() {
    super("A relationship type must have a non-empty label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A relationship type with this key already exists — type keys are one per tenant. */
export class DuplicateRelationshipTypeError extends PlatformError {
  constructor(key: string) {
    super(`A relationship type with key "${key}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** A relationship type references an endpoint entity type that is not registered in the tenant. */
export class UnknownEntityTypeForRelationshipError extends PlatformError {
  constructor(entityTypeKey: string) {
    super(`Entity type "${entityTypeKey}" is not registered; cannot define a relationship on it`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { entityTypeKey },
    });
  }
}

/** The attempted relationship-type lifecycle transition is not allowed from its current status. */
export class InvalidRelationshipTypeTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A relationship type cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Knowledge entity (node) -----------------------------------------------------

/** The requested knowledge entity does not exist in the current tenant. */
export class KnowledgeEntityNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Knowledge entity "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A knowledge entity must name the domain record it represents (entity type + source domain + source ref). */
export class EmptyEntitySourceError extends PlatformError {
  constructor() {
    super("A knowledge entity must have an entity type, a source domain and a source ref", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The entity type a node or relationship references is not registered (or not usable) in the tenant. */
export class UnknownEntityTypeError extends PlatformError {
  constructor(entityTypeKey: string) {
    super(`Entity type "${entityTypeKey}" is not a registered, usable type in this tenant`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { entityTypeKey },
    });
  }
}

/** A node already represents this domain record — one entity per (tenant, source domain, source ref). */
export class DuplicateKnowledgeEntityError extends PlatformError {
  constructor(sourceDomain: string, sourceRef: string) {
    super(`A knowledge entity already represents ${sourceDomain}:${sourceRef} in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { sourceDomain, sourceRef },
    });
  }
}

/** The attempted knowledge-entity lifecycle transition is not allowed from its current status. */
export class InvalidKnowledgeEntityTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A knowledge entity cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A node cannot be merged into itself. */
export class SelfMergeError extends PlatformError {
  constructor(id: string) {
    super(`A knowledge entity cannot be merged into itself ("${id}")`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

/** The canonical target of a merge does not exist (or is not an active node) in the tenant. */
export class MergeTargetNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Merge target "${id}" not found or not active`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Semantic relationship (edge) ------------------------------------------------

/** The requested semantic relationship does not exist in the current tenant. */
export class SemanticRelationshipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Semantic relationship "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A semantic relationship must carry a type key and both endpoints. */
export class EmptyRelationshipEndpointsError extends PlatformError {
  constructor() {
    super("A semantic relationship must have a type key and both endpoints", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A semantic relationship connects two distinct entities — no self-edges. */
export class SelfRelationshipError extends PlatformError {
  constructor(entityId: string) {
    super(`A semantic relationship cannot connect an entity to itself ("${entityId}")`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { entityId },
    });
  }
}

/** The relationship's validity window is invalid (blank start, or an end at/before the start). */
export class InvalidRelationshipWindowError extends PlatformError {
  constructor(validFrom: string, validTo: string | null) {
    super(`Invalid relationship window: from "${validFrom}" to "${validTo ?? "open"}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { validFrom, validTo },
    });
  }
}

/** The relationship type is not registered (or not usable) in the tenant. */
export class UnknownRelationshipTypeError extends PlatformError {
  constructor(relationshipTypeKey: string) {
    super(`Relationship type "${relationshipTypeKey}" is not a registered, usable type`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { relationshipTypeKey },
    });
  }
}

/** An endpoint of a relationship is not an active knowledge entity in the tenant. */
export class UnknownRelationshipEndpointError extends PlatformError {
  constructor(entityId: string, end: "source" | "target") {
    super(`The ${end} entity "${entityId}" is not an active knowledge entity`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { entityId, end },
    });
  }
}

/** An endpoint's entity type does not match what the relationship type requires (the ontology grammar). */
export class EndpointTypeMismatchError extends PlatformError {
  constructor(end: "source" | "target", expected: string, actual: string) {
    super(
      `The ${end} entity is a "${actual}", but the relationship type requires a "${expected}"`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { end, expected, actual },
      },
    );
  }
}

/** The attempted semantic-relationship lifecycle transition is not allowed from its current status. */
export class InvalidSemanticRelationshipTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A semantic relationship cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Assertion (evidence chain) --------------------------------------------------

/** The requested assertion does not exist in the current tenant. */
export class AssertionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Assertion "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An assertion must carry a subject, a predicate and a value. */
export class EmptyAssertionError extends PlatformError {
  constructor() {
    super("An assertion must have a subject, a predicate and a value", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A derived/inferred assertion must cite at least one antecedent — it may not stand on nothing. */
export class UngroundedAssertionError extends PlatformError {
  constructor(method: string) {
    super(`A "${method}" assertion must cite the assertions it was derived from`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { method },
    });
  }
}

/** A grounded (observed/declared) assertion must name where it came from. */
export class MissingEvidenceSourceError extends PlatformError {
  constructor(method: string) {
    super(`A "${method}" assertion must name its evidence source`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { method },
    });
  }
}

/** A cited antecedent (`derivedFrom`) is not a standing assertion in the tenant — the chain would dangle. */
export class UnknownDerivedFromError extends PlatformError {
  constructor(assertionId: string) {
    super(`Cited antecedent "${assertionId}" is not a standing assertion`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { assertionId },
    });
  }
}

/** The subject an assertion is about (entity or relationship) does not exist in the tenant. */
export class UnknownAssertionSubjectError extends PlatformError {
  constructor(subjectKind: string, subjectId: string) {
    super(`The ${subjectKind} subject "${subjectId}" does not exist`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { subjectKind, subjectId },
    });
  }
}

/** The attempted assertion lifecycle transition is not allowed from its current status. */
export class InvalidAssertionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An assertion cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
