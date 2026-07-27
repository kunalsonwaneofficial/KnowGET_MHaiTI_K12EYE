import { MAX_CONFIDENCE, clampConfidence, isDerivedTraceKind } from "./ai-value";
import type { SessionGrounding, SessionSummary, TraceView } from "./ai-view";

/**
 * The reasoning engine — what makes a reasoning session *inspectable* rather than a black box, and the
 * enforcement point of the contract's requirement that **knowledge retrieval originates from D25**.
 *
 * A session is a chain of recorded steps. `retrieval` brings knowledge in — and the only knowledge a step can
 * cite is a knowledge-graph reference, because {@link RETRIEVAL_SOURCES} has exactly one member. `observation`
 * records what the runtime saw. `inference` and `decision` are *derived*: they conclude something, and a
 * conclusion that rests on nothing is the failure mode this engine exists to catch.
 *
 * Grounding is deliberately strict about direction. A derived step is grounded only when it cites at least one
 * step that exists in the session **and came before it**. A step citing a later step, itself, or an id that is
 * not in the session cites nothing — the chain has to run forwards, or it is not evidence.
 *
 * Confidence is weakest-link, not average. A decision is only as trustworthy as the least trustworthy thing it
 * rests on, and averaging would let a pile of confident retrievals bury one shaky inference.
 */

/** Index the session's steps by id. */
const indexTraces = (traces: readonly TraceView[]): ReadonlyMap<string, TraceView> =>
  new Map(traces.map((trace) => [trace.id, trace]));

/** The steps a trace *actually* rests on: cited, present in the session, and strictly earlier. */
const directEvidence = (
  byId: ReadonlyMap<string, TraceView>,
  trace: TraceView,
): readonly TraceView[] =>
  trace.dependsOn
    .map((id) => byId.get(id))
    .filter((cited): cited is TraceView => cited !== undefined && cited.ordinal < trace.ordinal);

/**
 * Everything a trace transitively rests on, in session order and excluding the trace itself. Because evidence
 * only ever runs backwards, the walk cannot cycle; the `seen` set is there to keep a diamond from being walked
 * twice, not to break a loop.
 */
const closureOf = (
  byId: ReadonlyMap<string, TraceView>,
  trace: TraceView,
): readonly TraceView[] => {
  const seen = new Set<string>([trace.id]);
  const found: TraceView[] = [];
  const queue: TraceView[] = [...directEvidence(byId, trace)];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next.id)) {
      continue;
    }
    seen.add(next.id);
    found.push(next);
    queue.push(...directEvidence(byId, next));
  }

  return found.slice().sort((a, b) => a.ordinal - b.ordinal);
};

/** The steps a given trace directly rests on. Empty when it cites nothing usable — which is what ungrounded is. */
export function evidenceOf(traces: readonly TraceView[], traceId: string): readonly TraceView[] {
  const byId = indexTraces(traces);
  const trace = byId.get(traceId);
  return trace ? directEvidence(byId, trace) : [];
}

/**
 * Everything a trace rests on, transitively — the audit answer to "why did the agent conclude this". Returned in
 * session order, so it reads as the reasoning did.
 */
export function evidenceChain(traces: readonly TraceView[], traceId: string): readonly TraceView[] {
  const byId = indexTraces(traces);
  const trace = byId.get(traceId);
  return trace ? closureOf(byId, trace) : [];
}

/** Whether a single step is grounded. Non-derived steps are grounded by nature — they bring evidence in. */
export function isTraceGrounded(traces: readonly TraceView[], traceId: string): boolean {
  const byId = indexTraces(traces);
  const trace = byId.get(traceId);
  if (!trace) {
    return false;
  }
  return !isDerivedTraceKind(trace.kind) || directEvidence(byId, trace).length > 0;
}

/**
 * Measure how well-founded a session is. An empty session is vacuously grounded — it concluded nothing, so it
 * concluded nothing unfounded. `knowledgeRefCount` counts *distinct* graph references: a session that cites the
 * same assertion five times consulted one piece of institutional knowledge, not five.
 */
export function groundSession(traces: readonly TraceView[]): SessionGrounding {
  const byId = indexTraces(traces);
  const derived = traces.filter((trace) => isDerivedTraceKind(trace.kind));
  const ungroundedTraceIds = derived
    .filter((trace) => directEvidence(byId, trace).length === 0)
    .map((trace) => trace.id);

  const refs = new Set<string>();
  for (const trace of traces) {
    for (const ref of trace.knowledgeRefs) {
      refs.add(ref);
    }
  }

  return {
    traceCount: traces.length,
    retrievalCount: traces.filter((trace) => trace.kind === "retrieval").length,
    derivedCount: derived.length,
    groundedDerivedCount: derived.length - ungroundedTraceIds.length,
    ungroundedTraceIds,
    knowledgeRefCount: refs.size,
    grounded: ungroundedTraceIds.length === 0,
  };
}

/**
 * The retrieval steps that claim to have retrieved knowledge but cite no graph reference. Separate from
 * grounding on purpose: this is not an unfounded conclusion, it is a retrieval that brought nothing back, and an
 * operator reading a session wants the two distinguished.
 */
export function unsourcedRetrievalTraceIds(traces: readonly TraceView[]): readonly string[] {
  return traces
    .filter((trace) => trace.kind === "retrieval" && trace.knowledgeRefs.length === 0)
    .map((trace) => trace.id);
}

/**
 * The weakest-link confidence across every decision the session reached and everything those decisions rest on,
 * as an integer 0–100. Zero when the session decided nothing, and zero the moment any decision rests on nothing:
 * an unfounded decision is not a low-confidence decision, it is no decision at all.
 */
export function decisionConfidence(traces: readonly TraceView[]): number {
  const byId = indexTraces(traces);
  const decisions = traces.filter((trace) => trace.kind === "decision");
  if (decisions.length === 0) {
    return 0;
  }

  let weakest = MAX_CONFIDENCE;
  for (const decision of decisions) {
    if (directEvidence(byId, decision).length === 0) {
      return 0;
    }
    for (const link of [decision, ...closureOf(byId, decision)]) {
      weakest = Math.min(weakest, clampConfidence(link.confidence));
    }
  }
  return weakest;
}

/** The descriptive picture of one reasoning session: how founded it is, and how much it concluded. */
export function summarizeSession(traces: readonly TraceView[]): SessionSummary {
  return {
    grounding: groundSession(traces),
    decisionConfidence: decisionConfidence(traces),
    decisionCount: traces.filter((trace) => trace.kind === "decision").length,
  };
}
