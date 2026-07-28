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
 *
 * A refusal here is a 409 or a 422 with the specifics an operator needs to fix it, because these are the platform
 * enforcing its contract — not something going wrong inside it.
 */

// --- KPI definitions ---------------------------------------------------------------

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

// --- KPI readings ------------------------------------------------------------------

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
