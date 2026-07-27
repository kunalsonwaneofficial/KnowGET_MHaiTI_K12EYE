import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type RetrievalSource,
  type SessionStatus,
  type TraceKind,
  KNOWLEDGE_GRAPH_SOURCE,
  clampConfidence,
  isDerivedTraceKind,
} from "./ai-value";
import type { SessionGrounding, SessionSummary, TraceView } from "./ai-view";
import {
  EmptySessionConclusionError,
  EmptySessionPurposeError,
  EmptyTraceStatementError,
  InvalidSessionTransitionError,
  KnowledgeOutsideRetrievalError,
  ReasoningTraceNotFoundError,
  SessionClosedError,
  UngroundedConclusionError,
  UngroundedSessionError,
  UnknownEvidenceError,
  UnsourcedRetrievalError,
} from "./errors";
import { groundSession, summarizeSession } from "./reasoning";

/**
 * One recorded step of an agent's reasoning — an entity of the session, never a record of its own.
 *
 * A step says what kind of move it is, states it in the agent's own words, and — for a retrieval — cites the
 * institutional knowledge it brought in. `dependsOn` names the earlier steps it rests on: the session's evidence
 * chain, and the thing that makes a conclusion auditable rather than asserted.
 *
 * `source` exists and is typed {@link RetrievalSource}, whose union has exactly one member. There is no way to
 * record a step that retrieved knowledge from anywhere but the knowledge graph, because there is no word for it.
 */
export interface ReasoningTrace {
  readonly id: Uuid;
  /** Position in the session, 1-based. Evidence may only point at a strictly lower ordinal. */
  readonly ordinal: number;
  readonly kind: TraceKind;
  /** What the step says, in the agent's own words. Free text lives here; it never reaches an event. */
  readonly statement: string;
  /** Where retrieved knowledge came from. Non-null exactly on a retrieval, and only ever the graph. */
  readonly source: RetrievalSource | null;
  /** Assertion / entity / relationship ids from the Institutional Knowledge Graph (P2-D25). */
  readonly knowledgeRefs: readonly string[];
  /** Ids of earlier steps in this session that this one rests on. */
  readonly dependsOn: readonly string[];
  /** How sure the agent is of this step, 0–100. An index, never a probability. */
  readonly confidence: number;
  readonly createdAt: ISODateString;
}

/**
 * A reasoning session — the inspectable record of how an agent got from a question to a conclusion.
 *
 * The contract asks for reasoning sessions, and the value of one is entirely in what it makes impossible to hide.
 * So the invariants are enforced at the moment a step is recorded, not checked afterwards by something that might
 * not run: knowledge enters only through a retrieval and only from the graph (P2-D25); a retrieval that cites no
 * graph reference is not a retrieval; an inference or a decision must rest on at least one earlier step; and
 * evidence may only point backwards, which makes the evidence graph acyclic by construction rather than by
 * inspection.
 *
 * A session runs `open → concluded | abandoned`, and once it ends nothing more can be appended. A record that can
 * be extended after the fact is not a record — it says whatever the last writer wanted it to say. Concluding is
 * the moment the reasoning is claimed to be sound, so it is the moment the claim is checked: a session with a
 * conclusion resting on nothing cannot be concluded, though it can always be abandoned.
 *
 * The session links to the plan it produced, which is how "this is why the agent proposed that" is answerable
 * from either end.
 */
export interface ReasoningSession {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  /** The question the session set out to answer. */
  readonly purpose: string;
  readonly status: SessionStatus;
  readonly traces: readonly ReasoningTrace[];
  /** The plan this reasoning produced, once one exists. */
  readonly executionPlanId: string | null;
  /** What the session settled on, recorded at conclusion. */
  readonly conclusion: string | null;
  readonly concludedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateReasoningSessionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly purpose: string;
}

export interface RecordTraceParams {
  readonly kind: TraceKind;
  readonly statement: string;
  readonly knowledgeRefs?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly confidence?: number;
}

/** Open a session. It starts empty, which is a vacuously grounded session — it has concluded nothing. */
export function createReasoningSession(params: CreateReasoningSessionParams): ReasoningSession {
  const purpose = params.purpose.trim();
  if (purpose.length === 0) {
    throw new EmptySessionPurposeError();
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    agentId: params.agentId,
    purpose,
    status: "open",
    traces: [],
    executionPlanId: null,
    conclusion: null,
    concludedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (session: ReasoningSession, patch: Partial<ReasoningSession>): ReasoningSession => ({
  ...session,
  ...patch,
  updatedAt: nowIso(),
});

/** Nothing may be added to a session that has ended. */
function requireOpen(session: ReasoningSession): void {
  if (session.status !== "open") {
    throw new SessionClosedError(session.id, session.status);
  }
}

/** De-duplicate while keeping the order they were given, and drop anything blank. */
const cleanRefs = (values: readonly string[] | undefined): string[] => {
  const seen: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !seen.includes(trimmed)) {
      seen.push(trimmed);
    }
  }
  return seen;
};

/**
 * Record a step of reasoning.
 *
 * Every invariant the session exists to hold is checked here, because here is the only way in. A retrieval must
 * bring something back from the graph; nothing but a retrieval may cite the graph at all; a conclusion must rest
 * on something already recorded; and evidence must name steps that are actually in this session — which, since a
 * step can only cite what has already been appended, means evidence always points backwards.
 */
export function recordTrace(
  session: ReasoningSession,
  params: RecordTraceParams,
): ReasoningSession {
  requireOpen(session);

  const statement = params.statement.trim();
  if (statement.length === 0) {
    throw new EmptyTraceStatementError();
  }

  const knowledgeRefs = cleanRefs(params.knowledgeRefs);
  if (params.kind === "retrieval") {
    if (knowledgeRefs.length === 0) {
      throw new UnsourcedRetrievalError();
    }
  } else if (knowledgeRefs.length > 0) {
    throw new KnowledgeOutsideRetrievalError(params.kind);
  }

  const known = new Set<string>(session.traces.map((trace) => trace.id));
  const dependsOn = cleanRefs(params.dependsOn);
  for (const evidenceId of dependsOn) {
    if (!known.has(evidenceId)) {
      throw new UnknownEvidenceError(evidenceId);
    }
  }
  if (isDerivedTraceKind(params.kind) && dependsOn.length === 0) {
    throw new UngroundedConclusionError(params.kind);
  }

  const trace: ReasoningTrace = {
    id: newUuid(),
    ordinal: session.traces.length + 1,
    kind: params.kind,
    statement,
    source: params.kind === "retrieval" ? KNOWLEDGE_GRAPH_SOURCE : null,
    knowledgeRefs,
    dependsOn,
    confidence: clampConfidence(params.confidence ?? 100),
    createdAt: nowIso(),
  };

  return touch(session, { traces: [...session.traces, trace] });
}

/** Retrieve institutional knowledge from the graph. The only way knowledge enters a session. */
export const retrieveKnowledge = (
  session: ReasoningSession,
  statement: string,
  knowledgeRefs: readonly string[],
  confidence?: number,
): ReasoningSession =>
  recordTrace(session, { kind: "retrieval", statement, knowledgeRefs, confidence });

/** Record something the runtime saw. */
export const observe = (
  session: ReasoningSession,
  statement: string,
  confidence?: number,
): ReasoningSession => recordTrace(session, { kind: "observation", statement, confidence });

/** Conclude something from earlier steps. Must cite them. */
export const infer = (
  session: ReasoningSession,
  statement: string,
  dependsOn: readonly string[],
  confidence?: number,
): ReasoningSession =>
  recordTrace(session, { kind: "inference", statement, dependsOn, confidence });

/** Settle on a course of action. Must cite what it rests on. */
export const decide = (
  session: ReasoningSession,
  statement: string,
  dependsOn: readonly string[],
  confidence?: number,
): ReasoningSession => recordTrace(session, { kind: "decision", statement, dependsOn, confidence });

/** Find a recorded step, or say so. */
export function findTrace(session: ReasoningSession, traceId: string): ReasoningTrace {
  const trace = session.traces.find((candidate) => candidate.id === traceId);
  if (!trace) {
    throw new ReasoningTraceNotFoundError(traceId);
  }
  return trace;
}

/** The reasoning engine's view of the session's steps. */
export const toTraceViews = (session: ReasoningSession): readonly TraceView[] =>
  session.traces.map((trace) => ({
    id: trace.id,
    ordinal: trace.ordinal,
    kind: trace.kind,
    confidence: trace.confidence,
    knowledgeRefs: trace.knowledgeRefs,
    dependsOn: trace.dependsOn,
  }));

/** Link the session to the plan its reasoning produced. Allowed while the session is open. */
export function attachExecutionPlan(
  session: ReasoningSession,
  executionPlanId: string,
): ReasoningSession {
  requireOpen(session);
  return touch(session, { executionPlanId });
}

/**
 * Close the session with what it settled on — but only if everything it concluded rests on something. This is the
 * one place the reasoning engine's grounding judgement becomes an enforced rule rather than a report.
 */
export function concludeSession(session: ReasoningSession, conclusion: string): ReasoningSession {
  if (session.status !== "open") {
    throw new InvalidSessionTransitionError(session.status, "concluded");
  }
  const grounding = groundSession(toTraceViews(session));
  if (!grounding.grounded) {
    throw new UngroundedSessionError(session.id, grounding.ungroundedTraceIds);
  }
  const settled = conclusion.trim();
  if (settled.length === 0) {
    throw new EmptySessionConclusionError();
  }
  return touch(session, { status: "concluded", conclusion: settled, concludedAt: nowIso() });
}

/**
 * Give up on the session. Always available while it is open, and deliberately not subject to the grounding check:
 * an abandoned session makes no claim to have concluded anything, and forcing it to be sound before it could be
 * closed would leave unsound reasoning open forever.
 */
export function abandonSession(session: ReasoningSession): ReasoningSession {
  if (session.status !== "open") {
    throw new InvalidSessionTransitionError(session.status, "abandoned");
  }
  return touch(session, { status: "abandoned", concludedAt: nowIso() });
}

/** How well-founded the session is, measured by the reasoning engine. */
export const sessionGrounding = (session: ReasoningSession): SessionGrounding =>
  groundSession(toTraceViews(session));

/** The descriptive picture of the session: grounding, decision confidence, how much it concluded. */
export const reasoningSummary = (session: ReasoningSession): SessionSummary =>
  summarizeSession(toTraceViews(session));

/** Whether the session is still reasoning. */
export const isSessionOpen = (session: ReasoningSession): boolean => session.status === "open";

/** The distinct knowledge-graph references the session consulted, in the order it first reached for them. */
export const consultedKnowledgeRefs = (session: ReasoningSession): readonly string[] =>
  cleanRefs(session.traces.flatMap((trace) => trace.knowledgeRefs));
