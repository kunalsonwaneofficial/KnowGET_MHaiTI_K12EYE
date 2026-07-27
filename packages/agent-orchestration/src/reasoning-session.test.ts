import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type CreateReasoningSessionParams,
  type ReasoningSession,
  abandonSession,
  attachExecutionPlan,
  concludeSession,
  consultedKnowledgeRefs,
  createReasoningSession,
  decide,
  findTrace,
  infer,
  isSessionOpen,
  observe,
  reasoningSummary,
  recordTrace,
  retrieveKnowledge,
  sessionGrounding,
  toTraceViews,
} from "./reasoning-session";
import { evidenceChain } from "./reasoning";
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

const base: CreateReasoningSessionParams = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  agentId: "agent-1",
  purpose: "  Should the guardians of 8B be told about today's absences?  ",
};

const lastTraceId = (session: ReasoningSession): string => {
  const trace = session.traces[session.traces.length - 1];
  if (!trace) {
    throw new Error("expected the session to have at least one trace");
  }
  return trace.id;
};

/** A session that retrieved, observed, inferred and decided — the shape a real one takes. */
const reasoned = () => {
  const retrieved = retrieveKnowledge(
    createReasoningSession(base),
    "8B has 4 unexplained absences this week",
    ["assertion-1", "assertion-2"],
    90,
  );
  const observedFrom = observe(retrieved, "3 of the 4 are the same student", 95);
  const inferred = infer(
    observedFrom,
    "The pattern is one student, not a class-wide issue",
    [lastTraceId(retrieved), lastTraceId(observedFrom)],
    80,
  );
  return decide(inferred, "Notify that student's guardian only", [lastTraceId(inferred)], 85);
};

describe("ReasoningSession — the record of how an agent got there", () => {
  it("opens with the question, no steps, and nothing concluded", () => {
    const session = createReasoningSession(base);
    expect(session.purpose).toBe("Should the guardians of 8B be told about today's absences?");
    expect(session.status).toBe("open");
    expect(session.traces).toEqual([]);
    expect(session.conclusion).toBeNull();
    expect(session.executionPlanId).toBeNull();
    expect(isSessionOpen(session)).toBe(true);
  });

  it("requires a question to reason about", () => {
    expect(() => createReasoningSession({ ...base, purpose: "   " })).toThrow(
      EmptySessionPurposeError,
    );
  });

  it("is vacuously grounded while empty — it has concluded nothing unfounded", () => {
    expect(sessionGrounding(createReasoningSession(base)).grounded).toBe(true);
  });
});

describe("recording steps — knowledge enters through retrieval and nowhere else", () => {
  it("stamps a retrieval with the knowledge graph as its source", () => {
    const session = retrieveKnowledge(createReasoningSession(base), "  4 absences  ", [
      " assertion-1 ",
      "assertion-1",
      "  ",
    ]);
    const trace = findTrace(session, lastTraceId(session));
    expect(trace.kind).toBe("retrieval");
    expect(trace.source).toBe("knowledge_graph");
    expect(trace.statement).toBe("4 absences");
    expect(trace.knowledgeRefs).toEqual(["assertion-1"]);
    expect(trace.ordinal).toBe(1);
  });

  it("refuses a retrieval that brought nothing back", () => {
    expect(() => retrieveKnowledge(createReasoningSession(base), "I looked", [])).toThrow(
      UnsourcedRetrievalError,
    );
  });

  it("refuses to let any other kind of step cite the graph", () => {
    const session = createReasoningSession(base);
    expect(() =>
      recordTrace(session, {
        kind: "observation",
        statement: "seen",
        knowledgeRefs: ["assertion-1"],
      }),
    ).toThrow(KnowledgeOutsideRetrievalError);

    const retrieved = retrieveKnowledge(session, "4 absences", ["assertion-1"]);
    expect(() =>
      recordTrace(retrieved, {
        kind: "inference",
        statement: "therefore",
        dependsOn: [lastTraceId(retrieved)],
        knowledgeRefs: ["assertion-2"],
      }),
    ).toThrow(KnowledgeOutsideRetrievalError);
  });

  it("leaves a non-retrieval step with no source at all", () => {
    const session = observe(createReasoningSession(base), "the register was submitted late");
    expect(findTrace(session, lastTraceId(session)).source).toBeNull();
  });

  it("requires every step to say something", () => {
    expect(() => observe(createReasoningSession(base), "   ")).toThrow(EmptyTraceStatementError);
  });

  it("numbers steps in the order they were recorded", () => {
    expect(reasoned().traces.map((trace) => trace.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it("clamps confidence into the 0–100 band and defaults to certain", () => {
    const high = observe(createReasoningSession(base), "seen", 140);
    expect(findTrace(high, lastTraceId(high)).confidence).toBe(100);
    const low = observe(createReasoningSession(base), "seen", -20);
    expect(findTrace(low, lastTraceId(low)).confidence).toBe(0);
    const plain = observe(createReasoningSession(base), "seen");
    expect(findTrace(plain, lastTraceId(plain)).confidence).toBe(100);
  });
});

describe("evidence — a conclusion must rest on something already recorded", () => {
  it("refuses an inference or a decision that cites nothing", () => {
    const session = observe(createReasoningSession(base), "seen");
    expect(() => infer(session, "therefore", [])).toThrow(UngroundedConclusionError);
    expect(() => decide(session, "so do this", [])).toThrow(UngroundedConclusionError);
  });

  it("refuses evidence that is not in this session", () => {
    const session = observe(createReasoningSession(base), "seen");
    expect(() => infer(session, "therefore", ["trace-from-somewhere-else"])).toThrow(
      UnknownEvidenceError,
    );
  });

  it("cannot cite a step that does not exist yet, so evidence only ever runs backwards", () => {
    const session = reasoned();
    for (const trace of session.traces) {
      for (const evidenceId of trace.dependsOn) {
        expect(findTrace(session, evidenceId).ordinal).toBeLessThan(trace.ordinal);
      }
    }
  });

  it("builds a chain the reasoning engine can walk back to the retrieval", () => {
    const session = reasoned();
    const decision = session.traces[3];
    expect(decision?.kind).toBe("decision");
    const chain = evidenceChain(toTraceViews(session), decision?.id ?? "");
    expect(chain.map((trace) => trace.ordinal)).toEqual([1, 2, 3]);
  });

  it("reports a step that is not in the session rather than inventing one", () => {
    expect(() => findTrace(createReasoningSession(base), "nope")).toThrow(
      ReasoningTraceNotFoundError,
    );
  });
});

describe("closing a session", () => {
  it("concludes a grounded session with what it settled on", () => {
    const concluded = concludeSession(reasoned(), "  Notify one guardian.  ");
    expect(concluded.status).toBe("concluded");
    expect(concluded.conclusion).toBe("Notify one guardian.");
    expect(concluded.concludedAt).not.toBeNull();
    expect(isSessionOpen(concluded)).toBe(false);
  });

  it("requires the conclusion to say something", () => {
    expect(() => concludeSession(reasoned(), "  ")).toThrow(EmptySessionConclusionError);
  });

  it("refuses to conclude while something it concluded rests on nothing", () => {
    // A trace whose evidence was recorded *after* it cannot be built through the aggregate, so the
    // ungrounded case is reached the only way it can be: through a session assembled from a store.
    const session = reasoned();
    const tampered: ReasoningSession = {
      ...session,
      traces: session.traces.map((trace) =>
        trace.kind === "decision" ? { ...trace, dependsOn: [] } : trace,
      ),
    };
    expect(() => concludeSession(tampered, "Notify one guardian.")).toThrow(UngroundedSessionError);
    expect(abandonSession(tampered).status).toBe("abandoned");
  });

  it("abandons without any grounding check, because it claims nothing", () => {
    const abandoned = abandonSession(observe(createReasoningSession(base), "seen"));
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.conclusion).toBeNull();
  });

  it("accepts nothing more once it has ended, in either direction", () => {
    const concluded = concludeSession(reasoned(), "Notify one guardian.");
    expect(() => observe(concluded, "one more thing")).toThrow(SessionClosedError);
    expect(() => attachExecutionPlan(concluded, "plan-1")).toThrow(SessionClosedError);
    expect(() => concludeSession(concluded, "again")).toThrow(InvalidSessionTransitionError);
    expect(() => abandonSession(concluded)).toThrow(InvalidSessionTransitionError);

    const abandoned = abandonSession(createReasoningSession(base));
    expect(() => observe(abandoned, "one more thing")).toThrow(SessionClosedError);
    expect(() => concludeSession(abandoned, "actually")).toThrow(InvalidSessionTransitionError);
  });
});

describe("the link to what the reasoning produced", () => {
  it("attaches the plan the session led to", () => {
    const linked = attachExecutionPlan(reasoned(), "plan-1");
    expect(linked.executionPlanId).toBe("plan-1");
    expect(concludeSession(linked, "Notify one guardian.").executionPlanId).toBe("plan-1");
  });
});

describe("bridges to the reasoning engine", () => {
  it("hands the engine exactly what it reads", () => {
    const session = reasoned();
    const views = toTraceViews(session);
    expect(views).toHaveLength(4);
    expect(views[0]).toEqual({
      id: session.traces[0]?.id,
      ordinal: 1,
      kind: "retrieval",
      confidence: 90,
      knowledgeRefs: ["assertion-1", "assertion-2"],
      dependsOn: [],
    });
  });

  it("measures grounding over the session as recorded", () => {
    const grounding = sessionGrounding(reasoned());
    expect(grounding.traceCount).toBe(4);
    expect(grounding.retrievalCount).toBe(1);
    expect(grounding.derivedCount).toBe(2);
    expect(grounding.groundedDerivedCount).toBe(2);
    expect(grounding.knowledgeRefCount).toBe(2);
    expect(grounding.grounded).toBe(true);
  });

  it("summarizes weakest-link decision confidence across the chain", () => {
    const summary = reasoningSummary(reasoned());
    expect(summary.decisionCount).toBe(1);
    // 90 retrieval, 95 observation, 80 inference, 85 decision — the chain is only as good as the 80.
    expect(summary.decisionConfidence).toBe(80);
    expect(summary.grounding.grounded).toBe(true);
  });

  it("lists the distinct knowledge it consulted, in the order it first reached for it", () => {
    const first = retrieveKnowledge(createReasoningSession(base), "a", ["assertion-2"]);
    const second = retrieveKnowledge(first, "b", ["assertion-1", "assertion-2"]);
    expect(consultedKnowledgeRefs(second)).toEqual(["assertion-2", "assertion-1"]);
  });
});
