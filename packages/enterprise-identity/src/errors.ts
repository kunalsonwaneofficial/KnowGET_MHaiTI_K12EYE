import { PlatformError } from "@knowget/exceptions";

/** The requested identity account does not exist in the current tenant. */
export class IdentityAccountNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Identity account "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** No person exists (in the tenant) to link the identity account to. */
export class PersonNotFoundForIdentityError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found; cannot provision an identity for it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The identifier is already used by another account in the tenant. */
export class IdentifierInUseError extends PlatformError {
  constructor(type: string, value: string) {
    super(`The ${type} "${value}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { type, value },
    });
  }
}

/** The account already carries the given identifier. */
export class DuplicateIdentifierError extends PlatformError {
  constructor(type: string, value: string) {
    super(`This account already has the ${type} "${value}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { type, value },
    });
  }
}

/** The requested account status transition is not permitted. */
export class InvalidIdentityStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition identity account from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The requested change would violate an account invariant. */
export class CannotModifyIdentityAccountError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot modify identity account: ${reason}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { reason },
    });
  }
}
