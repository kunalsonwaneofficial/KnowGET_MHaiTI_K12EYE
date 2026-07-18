import { PlatformError } from "@knowget/exceptions";

/** The requested governance body does not exist in the current tenant. */
export class GovernanceBodyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Governance body "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A governance body must have a non-empty name. */
export class EmptyGovernanceBodyNameError extends PlatformError {
  constructor() {
    super("A governance body must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested governance-body lifecycle transition is not permitted. */
export class InvalidGovernanceBodyTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition governance body from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The organization a governance body governs does not exist in the tenant. */
export class OrganizationNotFoundForGovernanceError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach governance to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The parent governance body referenced during nesting does not exist. */
export class ParentGovernanceBodyNotFoundError extends PlatformError {
  constructor(parentBodyId: string) {
    super(`Parent governance body "${parentBodyId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { parentBodyId },
    });
  }
}

/** A governance body cannot be its own parent, nor form a cycle. */
export class GovernanceHierarchyError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      ...(details ? { details } : {}),
    });
  }
}
