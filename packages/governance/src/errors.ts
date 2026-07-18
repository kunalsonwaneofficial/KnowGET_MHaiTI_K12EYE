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

/** The requested policy does not exist in the current tenant. */
export class PolicyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Policy "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A policy must have a non-empty title. */
export class EmptyPolicyTitleError extends PlatformError {
  constructor() {
    super("A policy must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested policy lifecycle transition is not permitted. */
export class InvalidPolicyTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition policy from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Only a published policy can be acknowledged. */
export class PolicyNotPublishedError extends PlatformError {
  constructor(id: string) {
    super(`Policy "${id}" is not published and cannot be acknowledged`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested delegation does not exist in the current tenant. */
export class DelegationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Delegation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Authority cannot be delegated to oneself. */
export class SelfDelegationError extends PlatformError {
  constructor(personId: string) {
    super("Authority cannot be delegated to oneself", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { personId },
    });
  }
}

/** A delegation's monetary limit must be non-negative. */
export class InvalidMonetaryLimitError extends PlatformError {
  constructor(limit: number) {
    super("A delegation's monetary limit must be non-negative", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { limit },
    });
  }
}

/** A delegation's end date cannot precede its start date. */
export class InvalidDelegationPeriodError extends PlatformError {
  constructor(effectiveFrom: string, effectiveUntil: string) {
    super("A delegation's end date cannot precede its start date", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { effectiveFrom, effectiveUntil },
    });
  }
}

/** The requested delegation lifecycle transition is not permitted. */
export class InvalidDelegationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition delegation from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The requested resolution does not exist in the current tenant. */
export class ResolutionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Resolution "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A resolution must have a non-empty title. */
export class EmptyResolutionTitleError extends PlatformError {
  constructor() {
    super("A resolution must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested resolution lifecycle transition is not permitted. */
export class InvalidResolutionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition resolution from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Votes can only be cast while a resolution is open for voting. */
export class VotingNotOpenError extends PlatformError {
  constructor(id: string) {
    super(`Resolution "${id}" is not open for voting`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A voter may cast at most one vote on a resolution. */
export class DuplicateVoteError extends PlatformError {
  constructor(voterId: string) {
    super(`Voter "${voterId}" has already voted on this resolution`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { voterId },
    });
  }
}
