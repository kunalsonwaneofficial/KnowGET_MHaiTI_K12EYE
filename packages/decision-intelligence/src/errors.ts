import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for institutional decision intelligence. Every failure this contract can produce is a
 * typed, operational error carrying a stable code, an HTTP status and structured details — never a bare string,
 * and never free text an API consumer has to parse.
 *
 * Most of these are refusals rather than faults, and the refusals are where the contract's three rules become
 * unavoidable rather than merely intended:
 *
 * - {@link UngroundedRecommendationError} and {@link EvidenceRetractionUngroundsError} mean there is no code path
 *   that produces or preserves an *open* recommendation without a sound evidence chain underneath it. Rule two
 *   is not a validation someone remembered to call; it is the only way in and the only way to stay.
 * - {@link AutonomousDecisionAboveCeilingError} and {@link AutonomousDecisionWithoutEvidenceError} mean a record
 *   claiming the machine decided on its own cannot be written above the risk ceiling or without the evidence
 *   that justified it. Rule one is enforced at the record, not only at the gate that precedes it.
 * - {@link DecisionNotCompensatableError} means the way back cannot be *claimed* to have been taken unless it was
 *   genuinely available. Rule three refuses to be satisfied by a status update.
 *
 * A refusal here is a 409 or a 422 with the specifics an operator needs to fix it, because these are the platform
 * enforcing its contract — not something going wrong inside it.
 */

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) that would own this decision record does not exist. */
export class OrganizationNotFoundForDecisionError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the decision record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

// --- Recommendations -------------------------------------------------------------

/** The requested recommendation does not exist in the current tenant. */
export class RecommendationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Recommendation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A recommendation must say what it is recommending. */
export class EmptyRecommendationTitleError extends PlatformError {
  constructor() {
    super("A recommendation must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A recommendation must name what it is about. The subject is an opaque reference into an operational domain —
 * this contract never re-models the record it reasons about — but a reference to nothing is not a subject.
 */
export class EmptyRecommendationSubjectError extends PlatformError {
  constructor() {
    super("A recommendation must name the domain and record it is about", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * **Rule two, as a refusal.** A recommendation cannot be raised on an evidence chain that does not ground it.
 * The issue codes come straight from the evidence engine's inspection, so the caller is told exactly what is
 * wrong — no evidence at all, a support that resolves to nothing, a chain that loops, or a chain that never
 * reaches the knowledge graph.
 */
export class UngroundedRecommendationError extends PlatformError {
  constructor(issues: readonly string[]) {
    super(
      `A recommendation cannot be raised on an evidence chain that does not ground it (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { issues: [...issues] },
      },
    );
  }
}

/** The recommendation has already been answered, and an answered recommendation does not move again. */
export class RecommendationNotOpenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Recommendation "${id}" is "${status}" and is no longer open`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * Every answer to a recommendation names the person who gave it. An expiry is the one landing with nobody behind
 * it, and it has its own transition precisely so that silence is never recorded as though someone weighed it.
 */
export class AnonymousResolutionError extends PlatformError {
  constructor() {
    super("Answering a recommendation must name the person accountable for the answer", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A recommendation cannot supersede itself; a revision is a different record. */
export class SelfSupersedingRecommendationError extends PlatformError {
  constructor(id: string) {
    super(`Recommendation "${id}" cannot supersede itself`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Evidence --------------------------------------------------------------------

/** A citation must point at something — an opaque id in the knowledge graph or a reasoning session. */
export class EmptyEvidenceRefError extends PlatformError {
  constructor() {
    super("A piece of evidence must reference a non-empty source record", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The evidence being retracted is not part of this recommendation's chain. */
export class EvidenceNotFoundError extends PlatformError {
  constructor(recommendationId: string, evidenceId: string) {
    super(`Evidence "${evidenceId}" is not cited by recommendation "${recommendationId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { recommendationId, evidenceId },
    });
  }
}

/**
 * A new citation may only rest on evidence already in the chain. Wiring a support to an id that is not there
 * would build a chain the evidence engine reports as unsound the moment anyone inspects it, so it is refused at
 * the point the mistake is made rather than discovered later at a gate.
 */
export class UnknownEvidenceSupportError extends PlatformError {
  constructor(recommendationId: string, supportId: string) {
    super(
      `Evidence support "${supportId}" is not part of recommendation "${recommendationId}"'s chain`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { recommendationId, supportId },
      },
    );
  }
}

/**
 * **Rule two, as a refusal, on the way out.** Retracting this evidence would leave an open recommendation
 * standing on a chain that no longer grounds it. The retraction is refused rather than allowed to quietly
 * hollow out the justification: the honest move is to withdraw the recommendation, and `dependents` names what
 * would have lost its footing.
 */
export class EvidenceRetractionUngroundsError extends PlatformError {
  constructor(
    recommendationId: string,
    evidenceId: string,
    issues: readonly string[],
    dependents: readonly string[],
  ) {
    super(
      `Retracting evidence "${evidenceId}" would leave recommendation "${recommendationId}" ungrounded (${issues.join(", ")}); withdraw it instead`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: {
          recommendationId,
          evidenceId,
          issues: [...issues],
          dependents: [...dependents],
        },
      },
    );
  }
}

// --- Decision records ------------------------------------------------------------

/** The requested decision record does not exist in the current tenant. */
export class DecisionRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Decision record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Every decision a person took names that person. An anonymous decision is not accountability. */
export class AnonymousDecisionError extends PlatformError {
  constructor(disposition: string) {
    super(`A "${disposition}" decision must name the person accountable for it`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { disposition },
    });
  }
}

/**
 * An auto-executed decision is the machine deciding, and so it has nobody behind it by definition. Naming a
 * person on one would put their name to something they never saw.
 */
export class AutonomousDecisionHasDeciderError extends PlatformError {
  constructor(decidedByUserId: string) {
    super(
      `An auto-executed decision cannot name a decider; "${decidedByUserId}" did not take this decision`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { decidedByUserId },
      },
    );
  }
}

/**
 * **Rule one, as a refusal.** A decision cannot be recorded as taken by the machine when what it authorizes sits
 * above the auto-execution risk ceiling. The autonomy gate would never have produced it; this refuses to let one
 * be written anyway.
 */
export class AutonomousDecisionAboveCeilingError extends PlatformError {
  constructor(riskLevel: string, ceiling: string) {
    super(
      `A "${riskLevel}"-risk action cannot be auto-executed; the ceiling for unattended execution is "${ceiling}"`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { riskLevel, ceiling },
      },
    );
  }
}

/**
 * **Rule two, reaching the decision record.** The machine may not decide on its own from a justification that
 * was never recorded. A human decision may be taken on any grounds a person is willing to own; an autonomous one
 * has only the evidence to stand on, so an empty chain is refused outright.
 */
export class AutonomousDecisionWithoutEvidenceError extends PlatformError {
  constructor(recommendationId: string) {
    super(
      `An auto-executed decision on recommendation "${recommendationId}" must carry the evidence it rests on`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { recommendationId },
      },
    );
  }
}

/**
 * **Rule one, at the subject rather than at the action.** Some recommendations are marked as needing a person's
 * judgement regardless of how small the action is — a bursary refusal, a safeguarding note, anything where the
 * ceiling is beside the point because the *subject* is what requires a human. A low-risk, well-evidenced,
 * perfectly compensatable action on such a subject is still not the machine's to take.
 */
export class AutonomousDecisionOnHumanSubjectError extends PlatformError {
  constructor(recommendationId: string) {
    super(
      `Recommendation "${recommendationId}" requires human judgement and cannot be decided autonomously`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { recommendationId },
      },
    );
  }
}

/**
 * A rejected or deferred decision authorizes nothing, and a decision that named no action never authorized one.
 * Execution is requested from what a decision permitted, not from the fact that a decision happened.
 */
export class ExecutionNotAuthorizedByDecisionError extends PlatformError {
  constructor(id: string, disposition: string) {
    super(`Decision "${id}" ("${disposition}") does not authorize an execution`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, disposition },
    });
  }
}

/** The attempted execution transition is not allowed from where the execution currently stands. */
export class InvalidExecutionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An execution cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * **Rule three, as a refusal.** Compensation can only be recorded when it was genuinely available: the action
 * changed something, the way back was declared, and it has not already been taken. Anything else would let a
 * status update stand in for the world actually being put back.
 */
export class DecisionNotCompensatableError extends PlatformError {
  constructor(id: string, compensationState: string) {
    super(`Decision "${id}" cannot be compensated; its compensation is "${compensationState}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, compensationState },
    });
  }
}

// --- Workflow definitions --------------------------------------------------------

/** The requested workflow definition version does not exist in the current tenant. */
export class WorkflowNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Workflow definition "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A workflow definition is addressed by key across its versions, so the key cannot be blank. */
export class EmptyWorkflowKeyError extends PlatformError {
  constructor() {
    super("A workflow definition must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A workflow definition must have a name a person can recognise it by. */
export class EmptyWorkflowNameError extends PlatformError {
  constructor() {
    super("A workflow definition must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** That version of this workflow key already exists; a revision takes the next version number. */
export class DuplicateWorkflowVersionError extends PlatformError {
  constructor(key: string, version: number) {
    super(`Workflow "${key}" already has a version ${version}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key, version },
    });
  }
}

/** A signal-triggered workflow must name the signal that starts it; a key of nothing starts nothing. */
export class WorkflowTriggerSignalMissingError extends PlatformError {
  constructor() {
    super("A signal-triggered workflow must name the signal key that starts it", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * Only a signal-triggered workflow carries a signal key. A manual or automation-started workflow that also names
 * a signal is ambiguous about what starts it, and an orchestrator should never be guessing that.
 */
export class WorkflowTriggerSignalNotAllowedError extends PlatformError {
  constructor(trigger: string) {
    super(`A "${trigger}"-triggered workflow cannot also name a trigger signal`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { trigger },
    });
  }
}

/**
 * A published definition version is frozen. The instances running under it must keep meaning what they meant
 * when they started, and there is no way to repair a live case that has already passed a stage which has since
 * changed underneath it. Revise the workflow into a new draft version instead.
 */
export class PublishedWorkflowImmutableError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `Workflow definition "${id}" is "${status}" and can no longer be edited; revise it into a new version`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, status },
      },
    );
  }
}

/**
 * Publication is the gate. A definition carrying any structural issue at all — a cycle, a dangling dependency,
 * an acting stage naming no capability, a compensatable stage naming no way back — cannot be published, because
 * every one of those is a route to a state nobody designed once live cases are moving through it.
 */
export class UnsoundWorkflowError extends PlatformError {
  constructor(id: string, issues: readonly string[]) {
    super(
      `Workflow definition "${id}" cannot be published while it is unsound (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, issues: [...issues] },
      },
    );
  }
}

/** The attempted workflow-definition transition is not allowed from where the definition currently stands. */
export class InvalidWorkflowTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A workflow definition cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Instances start from a published version only — never from a draft, a suspended one or a retired one. */
export class WorkflowNotPublishedError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `Workflow definition "${id}" is "${status}"; instances start from a published version only`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, status },
      },
    );
  }
}

/** A stage is addressed by key within its definition, so the key cannot be blank. */
export class EmptyStageKeyError extends PlatformError {
  constructor() {
    super("A workflow stage must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A workflow stage must have a name a person can recognise it by. */
export class EmptyStageNameError extends PlatformError {
  constructor() {
    super("A workflow stage must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * Stage keys address stages, and two stages answering to one key make every dependency naming it ambiguous. It
 * is refused at the point the mistake is made rather than discovered later at the publication gate.
 */
export class DuplicateStageKeyError extends PlatformError {
  constructor(stageKey: string) {
    super(`Workflow stage "${stageKey}" is already part of this definition`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { stageKey },
    });
  }
}

/** The named stage is not part of this workflow definition. */
export class StageNotFoundError extends PlatformError {
  constructor(workflowId: string, stageKey: string) {
    super(`Workflow stage "${stageKey}" is not part of definition "${workflowId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { workflowId, stageKey },
    });
  }
}

// --- Workflow instances ----------------------------------------------------------

/** The requested workflow instance does not exist in the current tenant. */
export class WorkflowInstanceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Workflow instance "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An instance must name what it is running about, exactly as a recommendation names what it is about. */
export class EmptyWorkflowSubjectError extends PlatformError {
  constructor() {
    super("A workflow instance must name the domain and record it is running about", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * Starting a workflow by hand and cancelling one mid-flight are both acts a person is accountable for, and an
 * accountability record with nobody in it is not accountability. A signal or an automation rule starting a
 * workflow names itself instead; silence names nothing.
 */
export class AnonymousWorkflowActionError extends PlatformError {
  constructor(action: string) {
    super(`A workflow cannot be ${action} without naming the person accountable for it`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { action },
    });
  }
}

/** The instance has already settled, and a settled instance does not move again. */
export class WorkflowInstanceNotRunningError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Workflow instance "${id}" is "${status}" and is no longer running`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** The named stage is not part of this instance's snapshot of its definition. */
export class StageRunNotFoundError extends PlatformError {
  constructor(instanceId: string, stageKey: string) {
    super(`Stage "${stageKey}" is not part of workflow instance "${instanceId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { instanceId, stageKey },
    });
  }
}

/** The attempted stage transition is not allowed from where that stage currently stands. */
export class InvalidStageTransitionError extends PlatformError {
  constructor(stageKey: string, from: string, to: string) {
    super(`Stage "${stageKey}" cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { stageKey, from, to },
    });
  }
}

/**
 * A stage begins only once everything it depends on has completed or been skipped. A *failed* dependency
 * releases nothing: the instance stops at the part that did not work rather than carrying on past it, which is
 * the difference between an orchestrator and a queue.
 */
export class StageDependenciesUnsettledError extends PlatformError {
  constructor(stageKey: string, unsatisfied: readonly string[]) {
    super(
      `Stage "${stageKey}" cannot begin until ${unsatisfied.join(", ")} complete or are skipped`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { stageKey, unsatisfied: [...unsatisfied] },
      },
    );
  }
}

/**
 * Only a stage the definition declared optional may be skipped. Skipping a required stage would let an instance
 * report completion having never done the thing the workflow exists to do.
 */
export class RequiredStageNotSkippableError extends PlatformError {
  constructor(stageKey: string) {
    super(`Stage "${stageKey}" is required and cannot be skipped`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { stageKey },
    });
  }
}
