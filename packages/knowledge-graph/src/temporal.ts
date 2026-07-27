import type { RelationshipView } from "./knowledge-view";

/**
 * The pure temporal engine — the "time-aware" half of the semantic layer's digital memory. It answers "what
 * did the graph assert at time T?" over a set of versioned, time-stamped relationships, without a clock: the
 * caller supplies the instant. Pure and deterministic. Built and tested before the relationship aggregate
 * depends on it.
 */

/** Parse an ISO date/date-time to epoch millis. Deterministic (no clock); a malformed stamp yields NaN. */
const ms = (iso: string): number => Date.parse(iso);

/**
 * Whether a relationship is temporally live at instant `at`: it must have started at or before `at`, not yet
 * have ended (an open `validTo` never ends), and — unless `ignoreStatus` — still be `asserted`. A relationship
 * whose stamps do not parse is treated as not-valid (fail-safe), never as always-valid.
 */
export function isValidAt(
  relationship: RelationshipView,
  at: string,
  options: { readonly ignoreStatus?: boolean } = {},
): boolean {
  if (!options.ignoreStatus && relationship.status !== "asserted") {
    return false;
  }
  const t = ms(at);
  const from = ms(relationship.validFrom);
  if (Number.isNaN(t) || Number.isNaN(from)) {
    return false;
  }
  if (from > t) {
    return false;
  }
  if (relationship.validTo !== null) {
    const to = ms(relationship.validTo);
    if (Number.isNaN(to) || to <= t) {
      return false;
    }
  }
  return true;
}

/**
 * The relationships live at instant `at` — the graph's edge set as-of that time. Filters to asserted edges
 * whose validity window contains `at`. Order-preserving and deterministic.
 */
export function resolveAsOf(
  relationships: readonly RelationshipView[],
  at: string,
  options: { readonly ignoreStatus?: boolean } = {},
): RelationshipView[] {
  return relationships.filter((r) => isValidAt(r, at, options));
}

/**
 * The current, live edge set — the asserted relationships with an open or future end. Unlike {@link resolveAsOf}
 * this needs no instant: it is the set the store considers standing (`status === 'asserted'`), which is what
 * traversal and metrics read by default.
 */
export function liveRelationships(relationships: readonly RelationshipView[]): RelationshipView[] {
  return relationships.filter((r) => r.status === "asserted");
}

/**
 * The highest version among a set of relationships (0 if empty) — the version a new supersession should take
 * next is `latestVersion(...) + 1`. A count-derived helper for the versioning rule; carries no clock.
 */
export function latestVersion(relationships: readonly RelationshipView[]): number {
  return relationships.reduce((max, r) => (r.version > max ? r.version : max), 0);
}
