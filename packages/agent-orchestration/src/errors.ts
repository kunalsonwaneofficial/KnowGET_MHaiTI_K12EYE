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

// --- Execution plans -------------------------------------------------------------

/** The requested execution plan does not exist in the current tenant. */
export class ExecutionPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Execution plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A plan must say what it is for. A plan with no goal cannot be inspected by a human, which is the point of it. */
export class EmptyPlanGoalError extends PlatformError {
  constructor() {
    super("An execution plan must state the goal it pursues", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The attempted plan lifecycle transition is not allowed from its current status. */
export class InvalidPlanTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An execution plan cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * The plan was submitted with something structurally wrong with it. Carries every issue inspection found, not
 * just the first, because a plan is fixed by an author who wants the whole list.
 */
export class UnsoundPlanError extends PlatformError {
  constructor(issues: readonly { readonly stepId: string | null; readonly code: string }[]) {
    super(`This execution plan is not sound: ${issues.map((issue) => issue.code).join(", ")}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { issues },
    });
  }
}

/**
 * Execution was attempted on a plan that is waiting for a human. This is the enforceable approval gate: not a
 * warning, not a policy an executor is trusted to honour, but a refusal from the plan itself.
 */
export class PlanApprovalRequiredError extends PlatformError {
  constructor(id: string) {
    super(`Execution plan "${id}" cannot start until a human has approved it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The plan still has steps that have not settled, so it cannot be declared finished. */
export class PlanNotSettledError extends PlatformError {
  constructor(id: string, outstanding: number) {
    super(`Execution plan "${id}" still has ${outstanding} step(s) outstanding`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, outstanding },
    });
  }
}

// --- Plan steps ------------------------------------------------------------------

/** The requested step is not part of this plan. */
export class PlanStepNotFoundError extends PlatformError {
  constructor(stepId: string) {
    super(`Step "${stepId}" is not part of this execution plan`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { stepId },
    });
  }
}

/** The attempted step lifecycle transition is not allowed from its current status. */
export class InvalidStepTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A plan step cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * A step declared a dependency on something that is not a step of this plan. Refused when the step is added,
 * so a plan cannot be *built* with a dangling edge — the inspection engine still checks, because a plan can also
 * arrive from a store or an import.
 */
export class UnknownStepDependencyError extends PlatformError {
  constructor(dependencyId: string) {
    super(`Step dependency "${dependencyId}" is not a step of this execution plan`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { dependencyId },
    });
  }
}

/** A step cannot begin while something it waits on has not succeeded. */
export class StepDependencyNotMetError extends PlatformError {
  constructor(stepId: string, dependencyId: string) {
    super(`Step "${stepId}" waits on "${dependencyId}", which has not succeeded`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { stepId, dependencyId },
    });
  }
}

/** A step cannot be removed while another step waits on it. */
export class StepDependedUponError extends PlatformError {
  constructor(stepId: string, dependentStepId: string) {
    super(`Step "${stepId}" cannot be removed while step "${dependentStepId}" waits on it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { stepId, dependentStepId },
    });
  }
}

// --- Human approval --------------------------------------------------------------

/** The requested approval does not exist in the current tenant. */
export class ApprovalRequestNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Approval request "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An approval request must name what it is about. */
export class EmptyApprovalSubjectError extends PlatformError {
  constructor() {
    super("An approval request must name the plan or invocation it is about", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A decision was recorded without saying who made it. An anonymous approval is not an approval: the whole value
 * of the human gate is that a named person is accountable for what came through it.
 */
export class AnonymousApprovalDecisionError extends PlatformError {
  constructor() {
    super("An approval decision must record the person who made it", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The request has already been decided; a decision is made once and stands. */
export class ApprovalAlreadyDecidedError extends PlatformError {
  constructor(id: string, decision: string) {
    super(`Approval request "${id}" was already "${decision}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, decision },
    });
  }
}

// --- Tool invocation -------------------------------------------------------------

/** The requested invocation does not exist in the current tenant. */
export class ToolInvocationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Tool invocation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * The runtime refused to create an invocation because authorization did not open. Carries the decision's stable
 * reason codes, so the caller learns whether a grant is missing (nothing will fix that but a grant) or a human
 * has yet to approve.
 */
export class InvocationNotAuthorizedError extends PlatformError {
  constructor(agentId: string, capabilityKey: string, reasons: readonly string[]) {
    super(`Agent "${agentId}" is not authorized to invoke "${capabilityKey}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 403,
      isOperational: true,
      details: { agentId, capabilityKey, reasons },
    });
  }
}

/**
 * An approval was offered for a different agent or a different capability. Approvals are not transferable: one
 * that could be spent on anything would be a hole straight through the human gate.
 */
export class ApprovalSubjectMismatchError extends PlatformError {
  constructor(approvalRequestId: string, expected: string, actual: string) {
    super(`Approval request "${approvalRequestId}" does not cover "${expected}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { approvalRequestId, expected, actual },
    });
  }
}

/** The attempted invocation lifecycle transition is not allowed from its current status. */
export class InvalidInvocationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A tool invocation cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * An invocation was marked compensated when nothing about it can be compensated — either it changed nothing
 * (`reversible`) or nothing can undo it (`irreversible`). The runtime does not record undo that did not happen.
 */
export class InvocationNotCompensatableError extends PlatformError {
  constructor(id: string, reversibility: string) {
    super(`Invocation "${id}" is "${reversibility}" and cannot be compensated`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, reversibility },
    });
  }
}
