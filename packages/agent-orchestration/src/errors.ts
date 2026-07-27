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

/**
 * A human gate was raised over something no human decision could change. Authorization has exactly three
 * outcomes, and only one of them is a question: `allowed` needs no approval, and `denied` is a *grant* failure
 * that no approval can rescue. Raising a request in either case would put a person in front of a decision that
 * has already been made — and the approver, seeing a real prompt, would reasonably believe their answer mattered.
 * A gate that appears to be enforceable but is not is worse than no gate at all.
 */
export class ApprovalNotRequiredError extends PlatformError {
  constructor(agentId: string, capabilityKey: string, outcome: string) {
    super(
      `Authorization for "${capabilityKey}" resolved to "${outcome}", so there is nothing to approve`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { agentId, capabilityKey, outcome },
      },
    );
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

/**
 * The grant was already spent. A human decision authorizes one act; a grant that could be spent twice would turn
 * a single "yes" into a standing licence, so the second attempt fails rather than quietly succeeding.
 */
export class ApprovalAlreadySpentError extends PlatformError {
  constructor(id: string, consumedByInvocationId: string | null) {
    super(`Approval request "${id}" was already spent`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, consumedByInvocationId },
    });
  }
}

/** The grant cannot be spent because a human never let it through (it is pending, refused, or expired). */
export class ApprovalNotGrantedError extends PlatformError {
  constructor(id: string, decision: string) {
    super(`Approval request "${id}" is "${decision}", not "approved"`, {
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

// --- Reasoning sessions ----------------------------------------------------------

/** The requested reasoning session does not exist in the current tenant. */
export class ReasoningSessionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Reasoning session "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * A session tried to claim a plan its own agent did not draft. The session-to-plan link is the whole of "this is
 * why the agent proposed that", so a session claiming another agent's plan would not merely be untidy — it would
 * attach one agent's reasoning to another agent's actions, and the audit trail would read as an explanation.
 */
export class PlanAgentMismatchError extends PlatformError {
  constructor(executionPlanId: string, sessionAgentId: string, planAgentId: string) {
    super(`Execution plan "${executionPlanId}" was not drafted by this session's agent`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { executionPlanId, sessionAgentId, planAgentId },
    });
  }
}

/** A session must say what it was reasoning about. */
export class EmptySessionPurposeError extends PlatformError {
  constructor() {
    super("A reasoning session must state the question it is reasoning about", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A session must say what it settled on when it concludes. */
export class EmptySessionConclusionError extends PlatformError {
  constructor() {
    super("A concluded reasoning session must state what it settled on", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The attempted session lifecycle transition is not allowed from its current status. */
export class InvalidSessionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A reasoning session cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * Something tried to add to a session that has already ended. A reasoning record that can be extended after the
 * fact is not a record of reasoning — it is a document, and it would say whatever the last writer wanted.
 */
export class SessionClosedError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Reasoning session "${id}" is "${status}" and can no longer be added to`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * A session was concluded while some of what it concluded rested on nothing. Concluding is the moment the
 * session's reasoning is claimed to be sound, so it is the moment the claim is checked.
 */
export class UngroundedSessionError extends PlatformError {
  constructor(id: string, ungroundedTraceIds: readonly string[]) {
    super(
      `Reasoning session "${id}" has ${ungroundedTraceIds.length} conclusion(s) resting on nothing`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, ungroundedTraceIds },
      },
    );
  }
}

// --- Reasoning traces ------------------------------------------------------------

/** The requested reasoning step does not exist in this session. */
export class ReasoningTraceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Reasoning trace "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A recorded step must say something. */
export class EmptyTraceStatementError extends PlatformError {
  constructor() {
    super("A reasoning step must carry a statement", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A retrieval step brought nothing back from the knowledge graph. A retrieval that cites no graph reference has
 * not retrieved institutional knowledge; it has asserted something, and the session should say so.
 */
export class UnsourcedRetrievalError extends PlatformError {
  constructor() {
    super("A retrieval step must cite at least one knowledge-graph reference", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A non-retrieval step tried to bring knowledge in. Knowledge enters a session through retrieval and nowhere
 * else, which is what "knowledge retrieval originates from D25" means once it is a rule rather than a sentence.
 */
export class KnowledgeOutsideRetrievalError extends PlatformError {
  constructor(kind: string) {
    super(`A "${kind}" step cannot cite knowledge-graph references; only a retrieval may`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { kind },
    });
  }
}

/** A step cited evidence that is not in this session. Evidence is what the session itself recorded earlier. */
export class UnknownEvidenceError extends PlatformError {
  constructor(traceId: string) {
    super(`Reasoning step "${traceId}" is not in this session and cannot be cited as evidence`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { traceId },
    });
  }
}

/**
 * A conclusion was recorded that rests on nothing. An inference or a decision citing no earlier step is the
 * failure mode the whole reasoning model exists to make impossible, so it is refused at the point of recording.
 */
export class UngroundedConclusionError extends PlatformError {
  constructor(kind: string) {
    super(`A "${kind}" step must rest on at least one earlier step in the session`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { kind },
    });
  }
}
