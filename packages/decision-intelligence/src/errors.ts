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
