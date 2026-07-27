import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type CiteEvidenceParams,
  type CreateRecommendationParams,
  type Recommendation,
  type RecommendationEvidence,
  acceptRecommendation,
  addEvidence,
  citeEvidence,
  createRecommendation,
  expireRecommendation,
  hasLapsedAt,
  isRecommendationGrounded,
  isRecommendationOpen,
  recommendationEvidenceSummary,
  rejectRecommendation,
  retractEvidence,
  supersedeRecommendation,
  toRecommendationEvidenceView,
  toRecommendationGateView,
  toRecommendationPriorityView,
  toRecommendationSummaryView,
  withdrawRecommendation,
} from "./recommendation";
import {
  AnonymousResolutionError,
  EmptyEvidenceRefError,
  EmptyRecommendationSubjectError,
  EmptyRecommendationTitleError,
  EvidenceNotFoundError,
  EvidenceRetractionUngroundsError,
  RecommendationNotOpenError,
  SelfSupersedingRecommendationError,
  UngroundedRecommendationError,
  UnknownEvidenceSupportError,
} from "./errors";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

/** A citation on the graph itself — the only kind that can ground a chain. */
const graphRoot = (patch: Partial<CiteEvidenceParams> = {}): RecommendationEvidence =>
  citeEvidence({
    source: "knowledge_graph",
    ref: "entity-attendance-4471",
    strength: "strong",
    ...patch,
  });

/** A citation on a recorded reasoning session, resting on whatever it was given. */
const session = (
  supports: readonly string[],
  patch: Partial<CiteEvidenceParams> = {},
): RecommendationEvidence =>
  citeEvidence({
    source: "reasoning_session",
    ref: "session-1",
    strength: "moderate",
    supports,
    ...patch,
  });

const proposal = (patch: Partial<CreateRecommendationParams> = {}): Recommendation =>
  createRecommendation({
    tenantId: TENANT,
    organizationId: ORG,
    title: "Move Ravi into the morning intervention group",
    subjectDomain: "attendance",
    subjectId: "student-4471",
    impactBand: "individual",
    riskLevel: "low",
    evidence: [graphRoot()],
    ...patch,
  });

const answered = (): Recommendation =>
  acceptRecommendation(proposal(), { resolvedByUserId: "user-1" });

describe("minting a citation", () => {
  it("keeps what it points at, trimmed", () => {
    expect(graphRoot({ ref: "  entity-7  " }).ref).toBe("entity-7");
  });

  it("refuses a citation that points at nothing", () => {
    expect(() => graphRoot({ ref: "   " })).toThrow(EmptyEvidenceRefError);
  });

  it("mints its own id and records when it was cited", () => {
    const piece = graphRoot();
    expect(piece.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(piece.citedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rests on nothing unless it was given something to rest on", () => {
    expect(graphRoot().supports).toEqual([]);
  });

  it("does not let the same support count twice, however it was typed in", () => {
    expect(session(["  a  ", "a", "", "   ", "b"]).supports).toEqual(["a", "b"]);
  });

  it("treats a blank note as no note", () => {
    expect(graphRoot({ note: "   " }).note).toBeNull();
    expect(graphRoot({ note: "  seen in the register  " }).note).toBe("seen in the register");
  });
});

describe("raising a recommendation", () => {
  it("starts open, with nobody having answered it", () => {
    const recommendation = proposal();
    expect(recommendation.status).toBe("proposed");
    expect(isRecommendationOpen(recommendation)).toBe(true);
    expect(recommendation.resolvedByUserId).toBeNull();
    expect(recommendation.resolvedAt).toBeNull();
    expect(recommendation.resolutionNote).toBeNull();
    expect(recommendation.supersededById).toBeNull();
  });

  it("must say what it is recommending", () => {
    expect(() => proposal({ title: "   " })).toThrow(EmptyRecommendationTitleError);
    expect(proposal({ title: "  Trim me  " }).title).toBe("Trim me");
  });

  it("must name the record it is about, on both halves of the reference", () => {
    expect(() => proposal({ subjectDomain: "  " })).toThrow(EmptyRecommendationSubjectError);
    expect(() => proposal({ subjectId: "  " })).toThrow(EmptyRecommendationSubjectError);
  });

  it("normalizes the subject domain so the same domain is one domain", () => {
    expect(proposal({ subjectDomain: "  Attendance  " }).subjectDomain).toBe("attendance");
  });

  it("does not re-model the subject — it keeps an opaque reference into another contract", () => {
    const recommendation = proposal({ subjectDomain: "fees", subjectId: "invoice-99" });
    expect(recommendation.subjectDomain).toBe("fees");
    expect(recommendation.subjectId).toBe("invoice-99");
  });

  it("assumes nothing about who needs to judge it", () => {
    expect(proposal().requiresHumanJudgement).toBe(false);
    expect(proposal({ requiresHumanJudgement: true }).requiresHumanJudgement).toBe(true);
  });

  it("records who raised it — a person or a rule, never both invented", () => {
    expect(proposal({ proposedByUserId: "  user-9  " }).proposedByUserId).toBe("user-9");
    expect(proposal({ raisedByRuleId: "  rule-3  " }).raisedByRuleId).toBe("rule-3");
    expect(proposal().proposedByUserId).toBeNull();
    expect(proposal().raisedByRuleId).toBeNull();
  });

  it("waits indefinitely unless it was given a window", () => {
    expect(proposal().expiresAt).toBeNull();
  });
});

describe("a recommendation cannot be raised without grounds", () => {
  it("refuses an empty chain outright", () => {
    expect(() => proposal({ evidence: [] })).toThrow(UngroundedRecommendationError);
  });

  it("names what is wrong rather than failing with a bare message", () => {
    let thrown: unknown;
    try {
      proposal({ evidence: [] });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as UngroundedRecommendationError).details).toMatchObject({
      issues: ["no_evidence"],
    });
    expect((thrown as UngroundedRecommendationError).httpStatus).toBe(422);
  });

  it("refuses a chain that never reaches the graph, however much reasoning is stacked on it", () => {
    const first = session([]);
    const second = session([first.id]);
    let thrown: unknown;
    try {
      proposal({ evidence: [first, second] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UngroundedRecommendationError);
    expect((thrown as UngroundedRecommendationError).details).toMatchObject({
      issues: ["no_graph_root"],
    });
  });

  it("refuses a chain resting on evidence that is not in it", () => {
    expect(() => proposal({ evidence: [graphRoot(), session(["ghost"])] })).toThrow(
      UngroundedRecommendationError,
    );
  });

  it("accepts a chain that bottoms out in the graph", () => {
    const root = graphRoot();
    const recommendation = proposal({ evidence: [root, session([root.id])] });
    expect(isRecommendationGrounded(recommendation)).toBe(true);
    expect(recommendationEvidenceSummary(recommendation).graphRootCount).toBe(1);
  });
});

describe("confidence is derived, never asserted", () => {
  it("is the weakest link of the chain it was raised on", () => {
    const root = graphRoot();
    expect(proposal({ evidence: [root] }).confidence).toBe(90);
    expect(proposal({ evidence: [root, session([root.id])] }).confidence).toBe(65);
    expect(
      proposal({ evidence: [root, session([root.id], { strength: "weak" })] }).confidence,
    ).toBe(30);
  });

  it("cannot be supplied by a caller — there is no parameter for it", () => {
    const recommendation = proposal({
      evidence: [graphRoot({ strength: "weak" })],
      // @ts-expect-error confidence is derived from the evidence and is not an input
      confidence: 99,
    });
    expect(recommendation.confidence).toBe(30);
  });

  it("falls to the weaker figure when a weak citation is added beside strong ones", () => {
    const recommendation = proposal();
    const root = recommendation.evidence[0];
    expect(recommendation.confidence).toBe(90);
    const widened = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-2",
      strength: "weak",
      supports: [root?.id ?? ""],
    });
    expect(widened.confidence).toBe(30);
  });

  it("recovers when the weak link is taken back out", () => {
    const recommendation = proposal();
    const root = recommendation.evidence[0];
    const widened = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-2",
      strength: "weak",
      supports: [root?.id ?? ""],
    });
    const added = widened.evidence[1];
    expect(retractEvidence(widened, added?.id ?? "").confidence).toBe(90);
  });
});

describe("citing one more thing", () => {
  it("appends to the chain without disturbing what was already there", () => {
    const recommendation = proposal();
    const widened = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-2",
      strength: "strong",
      supports: [recommendation.evidence[0]?.id ?? ""],
    });
    expect(widened.evidence).toHaveLength(2);
    expect(widened.evidence[0]).toEqual(recommendation.evidence[0]);
  });

  it("refuses to rest on evidence that is not in the chain", () => {
    let thrown: unknown;
    try {
      addEvidence(proposal(), {
        source: "reasoning_session",
        ref: "session-2",
        strength: "strong",
        supports: ["ghost"],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnknownEvidenceSupportError);
    expect((thrown as UnknownEvidenceSupportError).details).toMatchObject({ supportId: "ghost" });
  });

  it("leaves the chain grounded, because a fresh citation can neither dangle nor loop", () => {
    const recommendation = proposal();
    const widened = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-2",
      strength: "strong",
      supports: [recommendation.evidence[0]?.id ?? ""],
    });
    expect(isRecommendationGrounded(widened)).toBe(true);
  });

  it("cannot be cited on a recommendation that has already been answered", () => {
    expect(() =>
      addEvidence(answered(), {
        source: "knowledge_graph",
        ref: "entity-2",
        strength: "strong",
      }),
    ).toThrow(RecommendationNotOpenError);
  });
});

describe("taking a citation back", () => {
  it("refuses to retract something the recommendation does not cite", () => {
    expect(() => retractEvidence(proposal(), "ghost")).toThrow(EvidenceNotFoundError);
  });

  it("refuses when what is left would no longer ground the recommendation", () => {
    const recommendation = proposal();
    const root = recommendation.evidence[0];
    expect(() => retractEvidence(recommendation, root?.id ?? "")).toThrow(
      EvidenceRetractionUngroundsError,
    );
  });

  it("names what would have lost its footing, rather than only refusing", () => {
    const root = graphRoot();
    const middle = session([root.id]);
    const top = session([middle.id], { ref: "session-3" });
    const recommendation = proposal({ evidence: [root, middle, top] });

    let thrown: unknown;
    try {
      retractEvidence(recommendation, root.id);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as EvidenceRetractionUngroundsError).details).toMatchObject({
      evidenceId: root.id,
      dependents: [middle.id, top.id].sort((a, b) => a.localeCompare(b)),
    });
    expect((thrown as EvidenceRetractionUngroundsError).httpStatus).toBe(409);
  });

  it("allows a retraction that leaves the argument standing", () => {
    const recommendation = proposal();
    const root = recommendation.evidence[0];
    const widened = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-2",
      strength: "moderate",
      supports: [root?.id ?? ""],
    });
    const narrowed = retractEvidence(widened, widened.evidence[1]?.id ?? "");
    expect(narrowed.evidence).toHaveLength(1);
    expect(isRecommendationGrounded(narrowed)).toBe(true);
  });

  it("cannot be retracted from a recommendation that has already been answered", () => {
    const recommendation = answered();
    expect(() => retractEvidence(recommendation, recommendation.evidence[0]?.id ?? "")).toThrow(
      RecommendationNotOpenError,
    );
  });
});

describe("answering a recommendation", () => {
  it("records agreement against a named person", () => {
    const accepted = acceptRecommendation(proposal(), {
      resolvedByUserId: "  user-4  ",
      note: "  agreed at the pastoral meeting  ",
    });
    expect(accepted.status).toBe("accepted");
    expect(accepted.resolvedByUserId).toBe("user-4");
    expect(accepted.resolutionNote).toBe("agreed at the pastoral meeting");
    expect(accepted.resolvedAt).not.toBeNull();
    expect(isRecommendationOpen(accepted)).toBe(false);
  });

  it("records refusal the same way", () => {
    const rejected = rejectRecommendation(proposal(), { resolvedByUserId: "user-4" });
    expect(rejected.status).toBe("rejected");
    expect(rejected.resolvedByUserId).toBe("user-4");
  });

  it("records the proposer taking it back", () => {
    const withdrawn = withdrawRecommendation(proposal(), { resolvedByUserId: "user-4" });
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.resolvedByUserId).toBe("user-4");
  });

  it("treats a blank note as no note", () => {
    expect(
      acceptRecommendation(proposal(), { resolvedByUserId: "user-4", note: "   " }).resolutionNote,
    ).toBeNull();
  });

  it("refuses an answer with nobody behind it", () => {
    expect(() => acceptRecommendation(proposal(), { resolvedByUserId: "  " })).toThrow(
      AnonymousResolutionError,
    );
    expect(() => rejectRecommendation(proposal(), { resolvedByUserId: "" })).toThrow(
      AnonymousResolutionError,
    );
  });

  it("does not let an answered recommendation be quietly re-answered", () => {
    const accepted = answered();
    let thrown: unknown;
    try {
      rejectRecommendation(accepted, { resolvedByUserId: "user-9" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RecommendationNotOpenError);
    expect((thrown as RecommendationNotOpenError).details).toMatchObject({ status: "accepted" });
  });
});

describe("landings with nobody behind them", () => {
  it("names the successor when a revision replaces it", () => {
    const superseded = supersedeRecommendation(proposal(), "rec-2" as Uuid);
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededById).toBe("rec-2");
    expect(superseded.resolvedAt).not.toBeNull();
    expect(superseded.resolvedByUserId).toBeNull();
  });

  it("refuses to let a recommendation replace itself", () => {
    const recommendation = proposal();
    expect(() => supersedeRecommendation(recommendation, recommendation.id)).toThrow(
      SelfSupersedingRecommendationError,
    );
  });

  it("lapses without suggesting anyone weighed it", () => {
    const expired = expireRecommendation(proposal());
    expect(expired.status).toBe("expired");
    expect(expired.resolvedAt).not.toBeNull();
    expect(expired.resolvedByUserId).toBeNull();
    expect(expired.resolutionNote).toBeNull();
  });

  it("closes both of these landings to a second attempt", () => {
    expect(() => expireRecommendation(answered())).toThrow(RecommendationNotOpenError);
    expect(() => supersedeRecommendation(answered(), "rec-2" as Uuid)).toThrow(
      RecommendationNotOpenError,
    );
  });
});

describe("whether a recommendation has run out of time", () => {
  const window = "2026-03-01T10:00:00.000Z" as ISODateString;
  const lapsing = (): Recommendation => proposal({ expiresAt: window });

  it("has not lapsed before its window closes", () => {
    expect(hasLapsedAt(lapsing(), "2026-03-01T09:59:59.999Z" as ISODateString)).toBe(false);
  });

  it("has lapsed at the instant it closes, and after", () => {
    expect(hasLapsedAt(lapsing(), window)).toBe(true);
    expect(hasLapsedAt(lapsing(), "2026-04-01T00:00:00.000Z" as ISODateString)).toBe(true);
  });

  it("never lapses when it was given no window", () => {
    expect(hasLapsedAt(proposal(), "2099-01-01T00:00:00.000Z" as ISODateString)).toBe(false);
  });
});

describe("what the engines are given to read", () => {
  it("computes groundedness for the autonomy gate rather than passing on a stored claim", () => {
    const recommendation = proposal({ requiresHumanJudgement: true });
    expect(toRecommendationGateView(recommendation)).toEqual({
      id: recommendation.id,
      status: "proposed",
      grounded: true,
      requiresHumanJudgement: true,
    });
  });

  it("gives the prioritization engine what it ranks on, and nothing else", () => {
    const recommendation = proposal({ impactBand: "cohort", riskLevel: "medium" });
    expect(toRecommendationPriorityView(recommendation)).toEqual({
      id: recommendation.id,
      status: "proposed",
      impactBand: "cohort",
      riskLevel: "medium",
      confidence: 90,
      createdAt: recommendation.createdAt,
      expiresAt: null,
    });
  });

  it("gives the metrics engine counts to bucket, not content", () => {
    const recommendation = proposal({ riskLevel: "high" });
    expect(toRecommendationSummaryView(recommendation)).toEqual({
      id: recommendation.id,
      status: "proposed",
      riskLevel: "high",
    });
  });

  it("hands the evidence engine the chain itself", () => {
    const recommendation = proposal();
    const view = toRecommendationEvidenceView(recommendation);
    expect(view.evidence).toEqual(recommendation.evidence);
    expect(recommendationEvidenceSummary(recommendation).grounded).toBe(true);
  });
});
