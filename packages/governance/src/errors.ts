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

/** The requested committee does not exist in the current tenant. */
export class CommitteeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Committee "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A committee must have a non-empty name. */
export class EmptyCommitteeNameError extends PlatformError {
  constructor() {
    super("A committee must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The person is already a member of the committee. */
export class DuplicateCommitteeMemberError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" is already a member of this committee`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The person is not a member of the committee. */
export class CommitteeMemberNotFoundError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" is not a member of this committee`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** A committee may have at most one chairperson and one secretary. */
export class CommitteeRoleConflictError extends PlatformError {
  constructor(role: string) {
    super(`This committee already has a ${role}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { role },
    });
  }
}

/** The requested committee lifecycle transition is not permitted. */
export class InvalidCommitteeTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition committee from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A person referenced by a committee does not exist in the tenant. */
export class PersonNotFoundForGovernanceError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}
