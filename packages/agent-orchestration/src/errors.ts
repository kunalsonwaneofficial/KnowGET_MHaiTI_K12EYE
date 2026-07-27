import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for the AI operating system. Every failure the runtime can produce is a typed,
 * operational error carrying a stable code, an HTTP status and structured details — never a bare string, and
 * never free text an API consumer has to parse.
 *
 * The refusals are the interesting ones. An agent that is not granted a capability, a plan that is not sound, an
 * invocation that has not been approved: these are not internal faults, they are the runtime enforcing its
 * contract, and they surface as 409/422 with the specifics an operator needs to fix them.
 */

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) that would own this AI record does not exist. */
export class OrganizationNotFoundForAgentError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the AI record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

// --- Agent registry --------------------------------------------------------------

/** The requested agent does not exist in the current tenant. */
export class AgentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Agent "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An agent must carry a non-empty key. */
export class EmptyAgentKeyError extends PlatformError {
  constructor() {
    super("An agent must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An agent must carry a non-empty name. */
export class EmptyAgentNameError extends PlatformError {
  constructor() {
    super("An agent must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An agent with this key already exists — agent keys are one per tenant. */
export class DuplicateAgentError extends PlatformError {
  constructor(key: string) {
    super(`An agent with key "${key}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The attempted agent lifecycle transition is not allowed from its current status. */
export class InvalidAgentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An agent cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The agent already holds this capability grant. */
export class CapabilityAlreadyGrantedError extends PlatformError {
  constructor(capabilityKey: string) {
    super(`This agent is already granted "${capabilityKey}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { capabilityKey },
    });
  }
}

/** The agent does not hold this capability grant, so there is nothing to revoke. */
export class CapabilityNotGrantedError extends PlatformError {
  constructor(capabilityKey: string) {
    super(`This agent is not granted "${capabilityKey}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { capabilityKey },
    });
  }
}

/**
 * The capability being granted, planned or invoked is not in the tenant's catalog. An agent's only invocation
 * surface is the catalog — a key that is not in it is not something the runtime can reach.
 */
export class UnknownCapabilityError extends PlatformError {
  constructor(capabilityKey: string) {
    super(`Capability "${capabilityKey}" is not registered in this tenant's catalog`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capabilityKey },
    });
  }
}

// --- Capability catalog ----------------------------------------------------------

/** The requested capability does not exist in the current tenant. */
export class ToolNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Capability "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A capability must carry a non-empty key. */
export class EmptyToolKeyError extends PlatformError {
  constructor() {
    super("A capability must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A capability must carry a non-empty name. */
export class EmptyToolNameError extends PlatformError {
  constructor() {
    super("A capability must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A capability must name the platform capability it routes to. This is the field that makes "agents invoke
 * capabilities, never databases directly" true of the catalog itself: every entry names a domain capability,
 * and there is nowhere to record a table, a query or a connection.
 */
export class EmptyCapabilityDomainError extends PlatformError {
  constructor() {
    super("A capability must name the platform capability domain it routes to", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * The compensation declaration contradicts the reversibility: a `compensatable` capability must name the
 * capability that undoes it, and a `reversible` or `irreversible` one must not — the first cannot be rolled
 * back, and the second cannot be rolled back at all.
 */
export class InvalidCompensationError extends PlatformError {
  constructor(reversibility: string, compensationKey: string | null) {
    super(
      compensationKey === null
        ? `A "${reversibility}" capability must name the capability that undoes it`
        : `A "${reversibility}" capability must not name a compensating capability`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { reversibility, compensationKey },
      },
    );
  }
}

/** A capability cannot undo itself. */
export class SelfCompensationError extends PlatformError {
  constructor(key: string) {
    super(`Capability "${key}" cannot be its own compensation`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { key },
    });
  }
}

/** A capability with this key already exists — capability keys are one per tenant. */
export class DuplicateToolError extends PlatformError {
  constructor(key: string) {
    super(`A capability with key "${key}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The attempted capability lifecycle transition is not allowed from its current status. */
export class InvalidToolTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A capability cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
