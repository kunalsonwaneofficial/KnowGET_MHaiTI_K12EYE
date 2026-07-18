import { PlatformError } from "@knowget/exceptions";

/** The requested relationship does not exist in the current tenant. */
export class RelationshipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Relationship "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A person cannot be related to themselves. */
export class SelfRelationshipError extends PlatformError {
  constructor(personId: string) {
    super("A person cannot be related to themselves", {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}

/** An equivalent active relationship already exists between the two people. */
export class DuplicateRelationshipError extends PlatformError {
  constructor(kind: string) {
    super(`An active "${kind}" relationship already exists between these people`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { kind },
    });
  }
}

/** The requested relationship status transition is not permitted. */
export class InvalidRelationshipStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition relationship from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A person referenced by the relationship does not exist in the tenant. */
export class PersonNotFoundForRelationshipError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found; cannot create a relationship for it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}
