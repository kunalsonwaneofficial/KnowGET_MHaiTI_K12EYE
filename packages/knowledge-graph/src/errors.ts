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
