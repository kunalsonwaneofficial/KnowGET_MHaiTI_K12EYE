import {
  EVIDENCE_STRENGTH_CONFIDENCE,
  type EvidenceStrength,
  KNOWLEDGE_GRAPH_SOURCE,
  evidenceStrengthRank,
} from "./decision-value";
import type {
  EvidenceChainSummary,
  EvidenceIssue,
  EvidenceIssueCode,
  EvidenceRefView,
  RecommendationEvidenceView,
} from "./decision-view";

/**
 * The evidence engine — the enforcement point of the contract's second rule: **recommendations always ship with
 * evidence chains**.
 *
 * "Ships with evidence" is not "has a list of citations attached". A chain is grounded here only when four
 * things hold at once: there is evidence at all; every support it names resolves to a piece actually in the
 * chain; the supports form no cycle; and at least one *root* of the chain — a piece resting on nothing further —
 * is the knowledge graph itself rather than another layer of reasoning. The last of those is the one that
 * matters most, because a reasoning session (P2-D26) citing a reasoning session citing a reasoning session is
 * a recommendation that has never touched an institutional fact. Every chain must bottom out in P2-D25.
 *
 * Cycles get their own attention for the same reason. A chain that loops is an argument that proves itself, and
 * it is exactly the failure a naive recursive walk would either miss or hang on. The depth pass here settles
 * layer by layer and simply never settles a piece on a cycle, so cycles are found by what fails to settle
 * rather than by recursing into one. There is no recursion anywhere in this file.
 *
 * Confidence is the **weakest link**, never an average. Adding a strong citation beside a weak one the argument
 * already depends on does not make the argument stronger, and an engine that averaged them would let a
 * recommendation buy its way past a gate with volume. An unsound chain has a confidence of zero, not a reduced
 * one — an argument that does not hold up has no strength to report.
 *
 * Nothing here reads a clock, a store or the graph. The engine is given the pieces a recommendation cites and
 * says what they amount to.
 */

/** Build an issue with the null-defaults spelled out, so every construction site reads the same. */
const issue = (
  code: EvidenceIssueCode,
  evidenceId: string | null = null,
  ref: string | null = null,
): EvidenceIssue => ({ evidenceId, code, ref });

/** Order issues deterministically: by code, then by the piece that carries it, then by what it refers to. */
const compareIssues = (a: EvidenceIssue, b: EvidenceIssue): number =>
  a.code.localeCompare(b.code) ||
  (a.evidenceId ?? "").localeCompare(b.evidenceId ?? "") ||
  (a.ref ?? "").localeCompare(b.ref ?? "");

/**
 * Settle a longest-path depth for every piece whose supports all resolve and lead nowhere circular. Roots are
 * depth 1. The pass repeats while it makes progress; a piece on a cycle can never have all of its supports
 * settled, so it is simply absent from the result — which is how cycles are detected without ever walking one.
 * Self-supports are excluded from the calculation and reported separately, so a piece that names itself still
 * settles a depth rather than being reported twice.
 */
function settleDepths(
  evidence: readonly EvidenceRefView[],
  known: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const piece of evidence) {
      if (depths.has(piece.id)) {
        continue;
      }
      const supports = piece.supports.filter((id) => known.has(id) && id !== piece.id);
      if (supports.every((id) => depths.has(id))) {
        const deepest = supports.reduce((max, id) => Math.max(max, depths.get(id) ?? 0), 0);
        depths.set(piece.id, deepest + 1);
        progressed = true;
      }
    }
  }

  return depths;
}

/**
 * The weakest strength anywhere in the chain, or null when there is no evidence. This is the value confidence is
 * derived from — see the note on averaging in the module comment.
 */
export const weakestStrength = (evidence: readonly EvidenceRefView[]): EvidenceStrength | null =>
  evidence.reduce<EvidenceStrength | null>(
    (weakest, piece) =>
      weakest === null || evidenceStrengthRank(piece.strength) < evidenceStrengthRank(weakest)
        ? piece.strength
        : weakest,
    null,
  );

/** The pieces that rest on nothing further — the foundations of the chain. */
export const evidenceRootIds = (evidence: readonly EvidenceRefView[]): readonly string[] =>
  evidence.filter((piece) => piece.supports.length === 0).map((piece) => piece.id);

/** The roots that are the knowledge graph itself. At least one of these is what makes a chain grounded. */
export const graphRootIds = (evidence: readonly EvidenceRefView[]): readonly string[] =>
  evidence
    .filter((piece) => piece.supports.length === 0 && piece.source === KNOWLEDGE_GRAPH_SOURCE)
    .map((piece) => piece.id);

/**
 * Inspect an evidence chain: how it is shaped, everything wrong with it, how much confidence it can carry, and
 * whether it grounds the recommendation that rests on it.
 *
 * `grounded` is all-or-nothing on purpose. A chain with a dangling support or an unreachable graph root is not
 * "mostly grounded" — the recommendation cannot say why it exists, and the autonomy gate blocks acting on it.
 */
export function inspectEvidenceChain(evidence: readonly EvidenceRefView[]): EvidenceChainSummary {
  const known = new Set(evidence.map((piece) => piece.id));
  const issues: EvidenceIssue[] = [];

  if (evidence.length === 0) {
    issues.push(issue("no_evidence"));
  }

  for (const piece of evidence) {
    for (const support of piece.supports) {
      if (support === piece.id) {
        issues.push(issue("self_support", piece.id, piece.id));
      } else if (!known.has(support)) {
        issues.push(issue("unknown_support", piece.id, support));
      }
    }
  }

  const depths = settleDepths(evidence, known);
  for (const piece of evidence) {
    if (!depths.has(piece.id)) {
      issues.push(issue("support_cycle", piece.id));
    }
  }

  const roots = evidenceRootIds(evidence);
  const graphRoots = graphRootIds(evidence);
  if (evidence.length > 0 && graphRoots.length === 0) {
    issues.push(issue("no_graph_root"));
  }

  const sortedIssues = [...issues].sort(compareIssues);
  const grounded = sortedIssues.length === 0;
  const weakest = weakestStrength(evidence);

  return {
    evidenceCount: evidence.length,
    rootCount: roots.length,
    graphRootCount: graphRoots.length,
    sessionCount: evidence.filter((piece) => piece.source === "reasoning_session").length,
    maxDepth: [...depths.values()].reduce((max, depth) => Math.max(max, depth), 0),
    issues: sortedIssues,
    confidence: grounded && weakest !== null ? EVIDENCE_STRENGTH_CONFIDENCE[weakest] : 0,
    grounded,
  };
}

/** Inspect the chain a recommendation carries. */
export const summarizeRecommendationEvidence = (
  recommendation: RecommendationEvidenceView,
): EvidenceChainSummary => inspectEvidenceChain(recommendation.evidence);

/** Whether a chain grounds what rests on it. The value the autonomy gate reads. */
export const isChainGrounded = (evidence: readonly EvidenceRefView[]): boolean =>
  inspectEvidenceChain(evidence).grounded;

/** The confidence a chain carries — the weakest link, or zero when the chain is unsound. */
export const chainConfidence = (evidence: readonly EvidenceRefView[]): number =>
  inspectEvidenceChain(evidence).confidence;

/** The distinct issue codes a summary reports, sorted — the shape an event or a UI badge wants. */
export const evidenceIssueCodes = (summary: EvidenceChainSummary): readonly EvidenceIssueCode[] =>
  [...new Set(summary.issues.map((entry) => entry.code))].sort((a, b) => a.localeCompare(b));

/**
 * Everything a piece of evidence transitively rests on, sorted and cycle-safe. Ids the chain names but does not
 * contain are omitted — {@link inspectEvidenceChain} reports those as `unknown_support`, and a closure that
 * listed them would be claiming evidence that is not there.
 */
export function supportClosure(
  evidence: readonly EvidenceRefView[],
  evidenceId: string,
): readonly string[] {
  const byId = new Map(evidence.map((piece) => [piece.id, piece] as const));
  const seen = new Set<string>();
  const queue = [...(byId.get(evidenceId)?.supports ?? [])];

  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || next === evidenceId || seen.has(next)) {
      continue;
    }
    const piece = byId.get(next);
    if (piece === undefined) {
      continue;
    }
    seen.add(next);
    queue.push(...piece.supports);
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The pieces that rest on a given one, transitively — what would lose its footing if this evidence were
 * retracted. The mirror of {@link supportClosure}, and the reason a chain is worth keeping as a graph rather
 * than a list.
 */
export function dependentClosure(
  evidence: readonly EvidenceRefView[],
  evidenceId: string,
): readonly string[] {
  const seen = new Set<string>();
  let frontier = new Set<string>([evidenceId]);

  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const piece of evidence) {
      if (seen.has(piece.id) || piece.id === evidenceId) {
        continue;
      }
      if (piece.supports.some((id) => frontier.has(id))) {
        seen.add(piece.id);
        next.add(piece.id);
      }
    }
    frontier = next;
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}
