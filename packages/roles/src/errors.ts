import { PlatformError } from "@knowget/exceptions";

/** The requested role does not exist in the current tenant. */
export class RoleNotFoundError extends PlatformError {
  constructor(idOrName: string) {
    super(`Role "${idOrName}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { role: idOrName },
    });
  }
}

/** A role with the same name already exists in the tenant. */
export class DuplicateRoleError extends PlatformError {
  constructor(name: string) {
    super(`A role named "${name}" already exists`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { name },
    });
  }
}

/** A role name is required and must not be blank. */
export class RoleNameRequiredError extends PlatformError {
  constructor() {
    super("A role name is required", {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
    });
  }
}

/** System roles are protected from destructive changes. */
export class CannotModifySystemRoleError extends PlatformError {
  constructor(name: string, action: string) {
    super(`The system role "${name}" cannot be ${action}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { name, action },
    });
  }
}

/** The requested role status transition is not permitted. */
export class InvalidRoleStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition role from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
