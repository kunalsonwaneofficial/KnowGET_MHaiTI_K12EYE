import type { AssertionView, Explanation } from "./knowledge-view";
import { clampConfidence, isGroundedMethod } from "./knowledge-value";

/** The top of the confidence band — the identity element for the "weakest link" minimum. */
const MAX = 100;

/**
 * The pure provenance engine — the enforcement of the contract's defining rule: **every assertion carries an
 * evidence chain and is explainable**. Given the assertions by id, it explains an assertion (the derivation
 * tree back to grounded facts), extracts its evidence chain (the grounded roots it ultimately rests on),
 * decides whether it is fully explainable, and aggregates a confidence that is never stronger than its weakest
 * link. No clock, no store — plain structure over the evidence DAG. Cycle-safe and missing-antecedent-safe.
 */

/** Build a lookup once so callers can pass a flat list. */
const indexById = (assertions: readonly AssertionView[]): Map<string, AssertionView> => {
  const byId = new Map<string, AssertionView>();
  for (const a of assertions) {
    byId.set(a.id, a);
  }
  return byId;
};

/**
 * Explain an assertion: the derivation tree from it down to the grounded assertions (observed/declared) it
 * rests on. A grounded assertion is a leaf. A derived/inferred one recurses into the assertions it cites; a
 * branch that revisits an ancestor is cut (`unresolved: 'cycle'`) and a citation to an unknown id is marked
 * (`unresolved: 'missing'`), so the walk always terminates and never fabricates support. Returns `null` if the
 * root assertion id itself is unknown.
 */
export function explain(
  assertionId: string,
  assertions: readonly AssertionView[],
): Explanation | null {
  const byId = indexById(assertions);
  const build = (
    id: string,
    ancestry: ReadonlySet<string>,
    isRoot: boolean,
  ): Explanation | null => {
    const a = byId.get(id);
    if (!a) {
      return null;
    }
    // A retracted antecedent is withdrawn evidence — a conclusion may not rest on it. (The root itself may be
    // retracted and still be explained, to show what it once rested on.)
    if (!isRoot && a.status === "retracted") {
      return {
        id: a.id,
        method: a.method,
        confidence: 0,
        grounded: false,
        derivedFrom: [],
        unresolved: "missing",
      };
    }
    const grounded = isGroundedMethod(a.method);
    if (grounded) {
      return {
        id: a.id,
        method: a.method,
        confidence: a.confidence,
        grounded: true,
        derivedFrom: [],
      };
    }
    const nextAncestry = new Set(ancestry).add(id);
    const children: Explanation[] = [];
    for (const parentId of a.derivedFrom) {
      if (ancestry.has(parentId) || parentId === id) {
        children.push({
          id: parentId,
          method: "derived",
          confidence: 0,
          grounded: false,
          derivedFrom: [],
          unresolved: "cycle",
        });
        continue;
      }
      const child = build(parentId, nextAncestry, false);
      if (child === null) {
        children.push({
          id: parentId,
          method: "derived",
          confidence: 0,
          grounded: false,
          derivedFrom: [],
          unresolved: "missing",
        });
      } else {
        children.push(child);
      }
    }
    return {
      id: a.id,
      method: a.method,
      confidence: a.confidence,
      grounded: false,
      derivedFrom: children,
    };
  };
  return build(assertionId, new Set(), true);
}

/**
 * Whether an assertion is fully explainable: every path down its derivation tree terminates in a grounded
 * assertion, with no cut cycles and no missing antecedents, and every derived/inferred node actually cites at
 * least one antecedent. This is the invariant the store must preserve — a `derived` assertion with an empty or
 * dangling `derivedFrom` is *not* explainable.
 */
export function isExplainable(assertionId: string, assertions: readonly AssertionView[]): boolean {
  const tree = explain(assertionId, assertions);
  if (tree === null) {
    return false;
  }
  const walk = (node: Explanation): boolean => {
    if (node.unresolved) {
      return false;
    }
    if (node.grounded) {
      return true;
    }
    if (node.derivedFrom.length === 0) {
      return false; // ungrounded but cites nothing — cannot be explained
    }
    return node.derivedFrom.every(walk);
  };
  return walk(tree);
}

/**
 * The evidence chain of an assertion — the distinct grounded (observed/declared) assertion ids it ultimately
 * rests on. Empty if it grounds nowhere (which, together with {@link isExplainable}, flags an unsupported
 * claim). Deterministic; de-duplicated; cycle-safe.
 */
export function evidenceChain(assertionId: string, assertions: readonly AssertionView[]): string[] {
  const tree = explain(assertionId, assertions);
  if (tree === null) {
    return [];
  }
  const roots = new Set<string>();
  const walk = (node: Explanation): void => {
    if (node.unresolved) {
      return;
    }
    if (node.grounded) {
      roots.add(node.id);
      return;
    }
    node.derivedFrom.forEach(walk);
  };
  walk(tree);
  return [...roots];
}

/**
 * Aggregate a set of confidences into one — the "weakest link" rule: a conclusion is no more confident than the
 * least-confident evidence under it. Empty evidence yields 0 (an unsupported claim has no confidence). Clamped
 * to the 0–100 band. Chosen for explainability: the result always points at a specific weakest antecedent.
 */
export function aggregateConfidence(confidences: readonly number[]): number {
  if (confidences.length === 0) {
    return 0;
  }
  return clampConfidence(confidences.reduce((min, c) => (c < min ? c : min), MAX));
}

/**
 * The effective confidence of an assertion once its evidence chain is taken into account: a grounded assertion
 * keeps its own confidence; a derived/inferred one is capped at the weakest confidence along its resolved
 * derivation (and 0 if it is not explainable). This is the confidence the memory spine aggregates.
 */
export function effectiveConfidence(
  assertionId: string,
  assertions: readonly AssertionView[],
): number {
  const tree = explain(assertionId, assertions);
  if (tree === null) {
    return 0;
  }
  const walk = (node: Explanation): number => {
    if (node.unresolved) {
      return 0;
    }
    if (node.grounded) {
      return clampConfidence(node.confidence);
    }
    if (node.derivedFrom.length === 0) {
      return 0;
    }
    const childMin = node.derivedFrom.reduce((min, c) => Math.min(min, walk(c)), MAX);
    return Math.min(clampConfidence(node.confidence), childMin);
  };
  return walk(tree);
}
