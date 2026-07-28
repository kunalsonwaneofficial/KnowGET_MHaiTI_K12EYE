import type { AssumptionInspection, AssumptionIssue, AssumptionView } from "./forecast-view";
import type { AssumptionBasis, ForecastMethod } from "./forecast-value";
import {
  BASES_REQUIRING_HOLDER,
  BASES_REQUIRING_REFERENCE,
  isSeasonalMethod,
  normalizeAssumptionKey,
} from "./forecast-value";

/**
 * The assumption engine: the half of the contract's rule that no amount of arithmetic can supply.
 *
 * An interval says how wrong a method has been on this series. It says nothing at all about the beliefs the
 * forecast rests on — that the fee policy holds, that the campus keeps its capacity, that last year's intake
 * pattern still describes this year's families. Those are the things that actually break, and when they break
 * the interval was never wide enough, because the interval was measuring the wrong kind of uncertainty. So this
 * engine exists to make the beliefs explicit, attributed, and refusable.
 *
 * Two design decisions carry most of the weight. First, an assumption must name its own grounds: a basis of
 * `expert_judgement` without a person is an opinion nobody owns, and a `declared_policy` without a reference is
 * a claim about a document that may not say what the claimant thinks it says. Second, a method that *consumes* a
 * belief the set never *declares* is caught here — `seasonal_naive` running under a set that says nothing about
 * seasonality is the clearest case, and letting the model's own configuration stand in for a declaration would
 * be exactly the silent substitution the rule exists to prevent.
 *
 * Every function is pure and total. Nothing here throws; the aggregate decides what a `complete: false`
 * inspection means for a run, and the same inspection is what an API returns to somebody trying to fix it.
 */

// --- Basis obligations -----------------------------------------------------------

/** Whether this basis must name the person answerable for it. */
export const requiresHolder = (basis: AssumptionBasis): boolean =>
  BASES_REQUIRING_HOLDER.includes(basis);

/** Whether this basis must name the upstream record it leans on. */
export const requiresReference = (basis: AssumptionBasis): boolean =>
  BASES_REQUIRING_REFERENCE.includes(basis);

/**
 * The assumption keys a set declares, normalized, de-duplicated and sorted.
 *
 * This is the exact form the reproducibility digest reads, and it lives here rather than there because it is a
 * fact about an assumption set, not about hashing. Sorted because a run under `{fees_hold, intake_flat}` is the
 * same run as one under `{intake_flat, fees_hold}` and a digest that disagreed would report drift that never
 * happened.
 */
export const assumptionKeysOf = (assumptions: readonly AssumptionView[]): readonly string[] =>
  [
    ...new Set(assumptions.map((assumption) => normalizeAssumptionKey(assumption.assumptionKey))),
  ].sort();

// --- Inspection ------------------------------------------------------------------

/**
 * Inspect a declared assumption set against the method that will consume it.
 *
 * `complete` is the gate a run must pass, and it is false for every issue that means the declaration itself is
 * defective: nothing declared, a key claimed twice, a basis missing the grounds it owes, or a belief the method
 * relies on that nobody wrote down. Those are all failures of the declaration, and a run that proceeded past any
 * of them would publish a forecast whose stated assumptions are not its real ones.
 *
 * `contradictory_assumptions` is deliberately **outside** that gate. Two assumptions of the same kind quoting
 * different quantities is usually a genuine conflict — capacity is either four hundred or five hundred — but an
 * assumption view carries no subject, so two `exogenous` figures about two different exogenous things look
 * identical to this engine. Reporting a suspicion is useful; blocking a run on a structural guess about
 * something the type cannot express would be the engine overreaching, and the person best placed to judge is the
 * one reading the issue.
 *
 * Issues come back sorted by code then key, so two inspections of the same set are byte-identical and a
 * difference between them is always a difference in the set.
 */
export const inspectAssumptions = (
  assumptions: readonly AssumptionView[],
  method: ForecastMethod,
  cycleLength: number | null = null,
): AssumptionInspection => {
  const issues: AssumptionIssue[] = [];

  if (assumptions.length === 0) {
    issues.push({ code: "no_assumptions", assumptionKey: null });
  }

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const assumption of assumptions) {
    const key = normalizeAssumptionKey(assumption.assumptionKey);
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }
  for (const key of [...duplicated].sort()) {
    issues.push({ code: "duplicate_assumption_key", assumptionKey: key });
  }

  for (const assumption of assumptions) {
    const key = normalizeAssumptionKey(assumption.assumptionKey);
    if (requiresHolder(assumption.basis) && !hasValue(assumption.holderId)) {
      issues.push({ code: "missing_holder", assumptionKey: key });
    }
    if (requiresReference(assumption.basis) && !hasValue(assumption.reference)) {
      issues.push({ code: "missing_reference", assumptionKey: key });
    }
  }

  // The method's own requirements, checked against what the set actually says. A seasonal cycle is a belief about
  // the world — that the year repeats the way it did — and a method reading one has assumed it whether or not
  // anybody typed it into the assumption set.
  const declaresSeasonality = assumptions.some((assumption) => assumption.kind === "seasonality");
  const usesSeasonality = isSeasonalMethod(method) || cycleLength !== null;
  if (usesSeasonality && !declaresSeasonality) {
    issues.push({ code: "unstated_assumption", assumptionKey: null });
  }

  for (const key of contradictionKeys(assumptions)) {
    issues.push({ code: "contradictory_assumptions", assumptionKey: key });
  }

  const blocking = issues.some((issue) => issue.code !== "contradictory_assumptions");

  return {
    count: assumptions.length,
    complete: !blocking,
    issues: sortIssues(issues),
  };
};

// --- Internals -------------------------------------------------------------------

/** A grounds field counts as given only when it carries something other than whitespace. */
const hasValue = (value: string | null): boolean => value !== null && value.trim().length > 0;

/**
 * The keys of assumptions that quote a quantity their own kind already quotes differently.
 *
 * Both sides of a conflict are named rather than only the later one, because "these two disagree" is the finding
 * and picking a winner is not this engine's business.
 */
const contradictionKeys = (assumptions: readonly AssumptionView[]): readonly string[] => {
  const byKind = new Map<string, AssumptionView[]>();
  for (const assumption of assumptions) {
    if (assumption.expectedValue === null) continue;
    const group = byKind.get(assumption.kind);
    if (group === undefined) byKind.set(assumption.kind, [assumption]);
    else group.push(assumption);
  }

  const conflicted = new Set<string>();
  for (const group of byKind.values()) {
    const distinct = new Set(group.map((assumption) => assumption.expectedValue));
    if (distinct.size < 2) continue;
    for (const assumption of group) {
      conflicted.add(normalizeAssumptionKey(assumption.assumptionKey));
    }
  }
  return [...conflicted].sort();
};

/** Deterministic issue order: by code, then by key, with set-level issues ahead of keyed ones. */
const sortIssues = (issues: readonly AssumptionIssue[]): readonly AssumptionIssue[] =>
  [...issues].sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.assumptionKey === b.assumptionKey) return 0;
    if (a.assumptionKey === null) return -1;
    if (b.assumptionKey === null) return 1;
    return a.assumptionKey < b.assumptionKey ? -1 : 1;
  });
