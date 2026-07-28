import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for executive intelligence, governance and institutional command. Every failure this
 * contract can produce is a typed, operational error carrying a stable code, an HTTP status and structured
 * details — never a bare string, and never free text an API consumer has to parse.
 *
 * Nearly all of these are refusals rather than faults, and the refusals are where the contract's rule stops being
 * a description of the package and becomes a property of it:
 *
 * - {@link UngroundedKpiReadingError} means there is no code path that produces a reading without the evidence it
 *   stands on. *Evidence-traceable KPIs* is not a validation somebody remembered to call before saving; it is the
 *   only way a reading comes into existence.
 * - {@link KpiScaleFrozenError} means what *good* meant cannot be changed underneath the readings already scored
 *   against it. An institution that could re-anchor a live KPI would restate its own history silently, and the
 *   index built on it would stop being comparable to itself.
 * - {@link UnusableKpiScaleError} means a scale nobody can interpolate against never becomes the thing readings
 *   are scored by. A draft may hold one — its author needs to see what is wrong — but activation is a gate.
 * - {@link KpiNotActiveError} means a reading cannot be filed against a draft nobody has agreed to yet, or
 *   against an indicator the institution has retired.
 * - {@link IndexWeightsFrozenError} means a published composition cannot be edited underneath the assessments
 *   that pinned it. Reweighting supersedes, so every assessment keeps pointing at the composition that actually
 *   produced it and the change is visible in the series exactly where it happened.
 * - {@link InsufficientAssessmentCoverageError} and {@link UngroundedAssessmentError} mean a composite resting on
 *   a convenient subset of the institution, or on nothing anybody can follow back, stays provisional forever. It
 *   is still computed and still readable — suppressing it would only push people back to spreadsheets — but it
 *   cannot become the number a board paper quotes.
 *
 * A refusal here is a 409 or a 422 with the specifics an operator needs to fix it, because these are the platform
 * enforcing its contract — not something going wrong inside it.
 */

// --- KPI definitions -------------------------------------------------------------

/** A KPI is addressed by key everywhere it is used — by a panel, by a reading, by a pillar. */
export class EmptyKpiKeyError extends PlatformError {
  constructor() {
    super("A KPI definition must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A KPI must have a name the people reading it on a dashboard can recognise it by. */
export class EmptyKpiNameError extends PlatformError {
  constructor() {
    super("A KPI definition must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A KPI names the operational domain that publishes it. This contract reports figures and cites their owners; it
 * never holds a second opinion about a number another domain already computes, and an indicator that names no
 * owner is one nobody can be asked about.
 */
export class EmptyKpiSourceDomainError extends PlatformError {
  constructor() {
    super("A KPI definition must name the operational domain that publishes it", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A declared target is a point on the normalized scale, not a raw measure. Targets are compared against scores
 * across indicators with entirely different units, which is only meaningful once both sides are normalized.
 */
export class KpiTargetOutOfRangeError extends PlatformError {
  constructor(targetScore: number) {
    super(`A KPI target of ${String(targetScore)} is not a point on the normalized scale`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { targetScore },
    });
  }
}

/**
 * **Activation is the gate.** A scale the measurement engine cannot interpolate against would score every
 * reading filed after it as unscoreable, which surfaces as a coverage gap in a pillar nobody can explain. The
 * issue codes come straight from the engine's inspection, so the author is told every fault at once rather than
 * the next one after each fix.
 */
export class UnusableKpiScaleError extends PlatformError {
  constructor(kpiKey: string, issues: readonly string[]) {
    super(
      `KPI "${kpiKey}" cannot be activated while its scale is unusable (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { kpiKey, issues: [...issues] },
      },
    );
  }
}

/**
 * The scale is frozen from activation onward, and this is the refusal that keeps it that way.
 *
 * Every reading taken against a KPI carries the score its scale produced at the time. Re-anchoring afterwards
 * would leave those scores in place while changing what they mean, so a pillar's history would silently restate
 * itself and a year-on-year comparison would be between two different questions. The way to change what *good*
 * means is to retire the indicator and declare its successor, which leaves both readable and neither pretending
 * to be the other.
 */
export class KpiScaleFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `KPI "${id}" is "${status}"; its scale is frozen — retire it and declare a successor instead`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, status },
      },
    );
  }
}

/** A retired KPI is history. Its readings stay readable exactly as they were; the definition does not move. */
export class RetiredKpiImmutableError extends PlatformError {
  constructor(id: string) {
    super(`KPI "${id}" is retired and can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The attempted KPI-definition transition is not allowed from where the definition currently stands. */
export class InvalidKpiTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A KPI definition cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- KPI readings ----------------------------------------------------------------

/**
 * Readings are filed against an active indicator only.
 *
 * A draft is a scale still being argued about, and a reading scored by one would have to be rescored or discarded
 * the moment the argument finished. A retired indicator is one the institution has stopped measuring, and a
 * reading arriving against it means a feed nobody switched off is still writing — which is worth being told about
 * rather than absorbing silently.
 */
export class KpiNotActiveError extends PlatformError {
  constructor(kpiKey: string, status: string) {
    super(`KPI "${kpiKey}" is "${status}"; readings are filed against an active KPI only`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { kpiKey, status },
    });
  }
}

/**
 * A period is an ordinal on a grid the institution defines, and this package holds no clock. A reading filed
 * against something that is not an integer cannot be aged, compared, or counted toward an assessment — every
 * staleness decision in the contract is subtraction between two ordinals.
 */
export class NonOrdinalReadingPeriodError extends PlatformError {
  constructor(period: number) {
    super(`A KPI reading's period must be an integer ordinal, received ${String(period)}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { period },
    });
  }
}

/**
 * **The contract's third clause, as a refusal.** A reading cannot be constructed on evidence that does not trace.
 *
 * This is the error that makes traceability structural rather than aspirational. There is no way to record the
 * figure now and attach its provenance later, because a dashboard whose numbers are *usually* traceable teaches
 * its readers that the provenance link is decoration and they stop checking which numbers have one.
 */
export class UngroundedKpiReadingError extends PlatformError {
  constructor(kpiKey: string, issues: readonly string[]) {
    super(
      `A reading for KPI "${kpiKey}" cannot be recorded on evidence that does not trace (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { kpiKey, issues: [...issues] },
      },
    );
  }
}

/**
 * A reading is withdrawn once. Withdrawing it again would move the timestamp an assessment's invalidation was
 * traced to, which is the one thing about a withdrawal anybody later needs.
 */
export class KpiReadingAlreadyWithdrawnError extends PlatformError {
  constructor(id: string) {
    super(`KPI reading "${id}" has already been withdrawn`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Health index definitions ----------------------------------------------------

/** A health index is addressed by key by every assessment, dashboard and briefing that refers to it. */
export class EmptyIndexKeyError extends PlatformError {
  constructor() {
    super("A health index definition must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A health index goes in front of a board under a name. It must have one. */
export class EmptyIndexNameError extends PlatformError {
  constructor() {
    super("A health index definition must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * **Publication is the gate.** A weight set the institution cannot be held to — one pillar carrying half the
 * composite, a pillar too small to move it, a set that does not total one, or a definition narrow enough to clear
 * the coverage floor by declaring almost nothing — never becomes the thing assessments are computed from. The
 * issue codes come straight from the weighting engine, so an author is told every fault at once.
 */
export class UnusableIndexWeightsError extends PlatformError {
  constructor(indexKey: string, issues: readonly string[]) {
    super(
      `Health index "${indexKey}" cannot be published while its weight set is unusable (${issues.join(", ")})`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { indexKey, issues: [...issues] },
      },
    );
  }
}

/**
 * The weights are frozen from publication onward, and this is the refusal that keeps it that way.
 *
 * An assessment pins the definition it was computed under. Reweighting in place would leave every assessment made
 * beforehand pointing at a composition that no longer produced it, so a series would restate itself and nobody
 * could say when the question changed. The remedy is in the message because there is one: supersede the
 * definition with the reweighted successor, which leaves both readable and the break visible where it happened.
 */
export class IndexWeightsFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(
      `Health index definition "${id}" is "${status}"; its weights are frozen — supersede it with a reweighted successor instead`,
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
 * A superseded or retired index definition is history and does not move in any respect.
 *
 * Superseded is the stricter of the two and the reason this refusal covers more than retirement does: a
 * superseded definition is what somebody's assessment says it was computed under, so even its name is part of a
 * record another aggregate is pointing at.
 */
export class FrozenIndexDefinitionError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Health index definition "${id}" is "${status}" and can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A definition cannot be its own successor. A self-reference here would make the supersession chain a loop. */
export class SelfSupersedingIndexError extends PlatformError {
  constructor(id: string) {
    super(`Health index definition "${id}" cannot supersede itself`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

/** The attempted index-definition transition is not allowed from where the definition currently stands. */
export class InvalidIndexTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A health index definition cannot go from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Health index assessments ----------------------------------------------------

/**
 * Assessments are computed against a published definition only.
 *
 * A draft is a weight set still being argued about, and an assessment computed under one would have to be
 * recomputed or discarded the moment the argument finished. A superseded or retired definition is a composition
 * the institution has moved on from, and computing a fresh number under it would produce a figure that looks
 * current and answers a question nobody is asking any more.
 */
export class IndexNotPublishedError extends PlatformError {
  constructor(indexKey: string, status: string) {
    super(
      `Health index "${indexKey}" is "${status}"; assessments are computed against a published definition only`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { indexKey, status },
      },
    );
  }
}

/**
 * A period is an ordinal on the grid its definition declares, and this package holds no clock. An assessment
 * filed against something that is not an integer cannot age its own readings, be compared to the period before
 * it, or be reproduced.
 */
export class NonOrdinalAssessmentPeriodError extends PlatformError {
  constructor(period: number) {
    super(`An assessment's period must be an integer ordinal, received ${String(period)}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { period },
    });
  }
}

/**
 * **The coverage floor, as a refusal.** An assessment that did not see enough of the institution stays
 * provisional permanently — provisional is not a waiting room, it is where a thin number lives out its life.
 *
 * The number is still computed, still readable and still useful to whoever is chasing the missing pillars. What
 * it may not do is become final, be cited by a briefing, or be compared to a period that met the floor, because
 * the failure a composite invites is not inaccuracy but plausibility: it comes out at 71, it looks like a
 * measurement, and nothing about it says four of its ten pillars were silent.
 */
export class InsufficientAssessmentCoverageError extends PlatformError {
  constructor(period: number, pillarCoverage: number) {
    super(
      `An assessment at period ${String(period)} cannot be finalized on pillar coverage of ${String(pillarCoverage)}`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { period, pillarCoverage },
      },
    );
  }
}

/**
 * **The contract's third clause at the top of the pyramid.** An assessment cannot be finalized without a single
 * reading it can point at.
 *
 * Pillar coverage is computed from scores the caller aggregated, and an assessment that cleared the floor while
 * admitting no reading has cleared it on figures with nothing underneath them. Being told the composite is thin
 * would send an administrator to collect more pillars, which is the wrong instruction for a number that should
 * not have been computed at all.
 */
export class UngroundedAssessmentError extends PlatformError {
  constructor(period: number) {
    super(
      `An assessment at period ${String(period)} cannot be finalized without an admitted reading behind it`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { period },
      },
    );
  }
}

/**
 * Only a provisional assessment can be finalized. A final one is already a finding, and an invalidated one is a
 * record of something that stopped being acceptable — finalizing that would erase why.
 */
export class AssessmentNotProvisionalError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Assessment "${id}" is "${status}"; only a provisional assessment can be finalized`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * An assessment is invalidated once. Invalidating it again would move the timestamp a briefing's retraction was
 * traced to, and the reason recorded the first time is the one that explains the restatement.
 */
export class AssessmentAlreadyInvalidatedError extends PlatformError {
  constructor(id: string) {
    super(`Assessment "${id}" has already been invalidated`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
