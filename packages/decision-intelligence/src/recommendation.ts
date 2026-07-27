import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type EvidenceSource,
  type EvidenceStrength,
  type ImpactBand,
  type RecommendationStatus,
  type RiskLevel,
  isOpenRecommendationStatus,
  normalizeSourceDomain,
} from "./decision-value";
import type {
  EvidenceChainSummary,
  RecommendationEvidenceView,
  RecommendationGateView,
  RecommendationPriorityView,
  RecommendationSummaryView,
} from "./decision-view";
import {
  chainConfidence,
  dependentClosure,
  evidenceIssueCodes,
  inspectEvidenceChain,
  isChainGrounded,
} from "./evidence";
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

/**
 * A recommendation, and the evidence chain it is inseparable from.
 *
 * The contract asks that **recommendations always ship with evidence chains**, and this aggregate is where that
 * stops being a policy and becomes a property of the type. There is no constructor that takes a recommendation
 * without evidence, no setter that adds the evidence afterwards, and no transition that lets an open
 * recommendation shed the evidence it was raised on. {@link createRecommendation} takes the chain up front and
 * refuses one the evidence engine does not consider grounded; {@link retractEvidence} refuses to leave an open
 * recommendation standing on a chain that no longer grounds it. The invariant that results — *an open
 * recommendation is grounded* — is exactly what the autonomy gate relies on when it reads
 * {@link toRecommendationGateView}, and it holds by construction rather than by anyone remembering to check.
 *
 * `confidence` is **derived, never supplied**. It is the weakest link of the chain, recomputed on every change to
 * the evidence, and there is no parameter anywhere here that lets a caller assert one. Without that, a
 * recommendation could carry a confidence of 95 over a single weak citation, and every queue, dashboard and gate
 * downstream would believe it. A number that claims to measure how well-founded something is has to be computed
 * from what founds it.
 *
 * The subject is an *opaque reference* — a domain name and an id. This contract reasons about attendance, fees
 * and admissions records; it never re-models them. That is the same discipline the knowledge graph (P2-D25)
 * keeps, and for the same reason: a second copy of an operational record is a second version of the truth.
 *
 * `proposed → accepted | rejected | superseded | expired | withdrawn`, and never back. Only `proposed` is open,
 * because a recommendation that was already answered cannot be quietly re-answered.
 */

// --- Evidence --------------------------------------------------------------------

/**
 * One citation on a recommendation. Structurally a superset of the evidence engine's `EvidenceRefView`, so the
 * engines read these directly rather than through a projection — the recommendation adds only the two things a
 * record needs and an engine does not: the human note explaining why this was cited, and when it was.
 */
export interface RecommendationEvidence {
  readonly id: Uuid;
  /** Where this came from: the knowledge graph (P2-D25) or a reasoning session (P2-D26). Nothing else. */
  readonly source: EvidenceSource;
  /** The opaque id of the cited record in its source contract. */
  readonly ref: string;
  readonly strength: EvidenceStrength;
  /** Ids of other evidence on the same recommendation that this piece rests on. Empty for a root citation. */
  readonly supports: readonly string[];
  readonly note: string | null;
  readonly citedAt: ISODateString;
}

export interface CiteEvidenceParams {
  readonly source: EvidenceSource;
  readonly ref: string;
  readonly strength: EvidenceStrength;
  readonly supports?: readonly string[];
  readonly note?: string | null;
}

/** De-duplicate supports and drop blanks, so a chain's shape does not depend on how it was typed in. */
const normalizeSupports = (supports: readonly string[] | undefined): readonly string[] => [
  ...new Set((supports ?? []).map((id) => id.trim()).filter((id) => id.length > 0)),
];

/**
 * Mint a citation. Minting is separate from raising the recommendation so a chain can be *wired* before it is
 * attached: cite the graph entity, then cite the reasoning session that rests on it by id, then raise the
 * recommendation on both. Without an id in hand first, `supports` could only ever be filled in afterwards, and
 * "afterwards" is the gap this aggregate exists to close.
 */
export function citeEvidence(params: CiteEvidenceParams): RecommendationEvidence {
  const ref = params.ref.trim();
  if (ref.length === 0) {
    throw new EmptyEvidenceRefError();
  }

  return {
    id: newUuid(),
    source: params.source,
    ref,
    strength: params.strength,
    supports: normalizeSupports(params.supports),
    note: params.note?.trim() || null,
    citedAt: nowIso(),
  };
}

// --- The aggregate ---------------------------------------------------------------

export interface Recommendation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly summary: string | null;
  /** The operational domain the subject lives in (`attendance`, `fees`, `admissions`). */
  readonly subjectDomain: string;
  /** The opaque id of the record this is about, in its own domain. Never re-modelled here. */
  readonly subjectId: string;
  readonly impactBand: ImpactBand;
  readonly riskLevel: RiskLevel;
  /**
   * Declared, not inferred. Some subjects — a safeguarding concern, a disciplinary matter — belong to a person
   * whatever their risk band says, and saying so explicitly is more honest than trying to detect it from a
   * domain name. The autonomy gate reads this and blocks unattended action on it.
   */
  readonly requiresHumanJudgement: boolean;
  readonly status: RecommendationStatus;
  /** The chain this recommendation stands on. Never empty while the recommendation is open. */
  readonly evidence: readonly RecommendationEvidence[];
  /** Derived from {@link Recommendation.evidence} — the weakest link. No caller can set this. */
  readonly confidence: number;
  /** The person who raised it. Null when an automation rule did. */
  readonly proposedByUserId: string | null;
  /** The automation rule that raised it. Null when a person did. */
  readonly raisedByRuleId: string | null;
  /** The person who resolved it. Null while open, and null for an expiry — nobody answered. */
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: ISODateString | null;
  readonly resolutionNote: string | null;
  /** The recommendation that replaced this one. Set only by {@link supersedeRecommendation}. */
  readonly supersededById: Uuid | null;
  /** When it lapses if nobody answers. Null means it waits indefinitely. */
  readonly expiresAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateRecommendationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly summary?: string | null;
  readonly subjectDomain: string;
  readonly subjectId: string;
  readonly impactBand: ImpactBand;
  readonly riskLevel: RiskLevel;
  readonly requiresHumanJudgement?: boolean;
  /** The chain, minted with {@link citeEvidence}. Required, and required to ground the recommendation. */
  readonly evidence: readonly RecommendationEvidence[];
  readonly proposedByUserId?: string | null;
  readonly raisedByRuleId?: string | null;
  readonly expiresAt?: ISODateString | null;
}

/** What a person supplies when they answer. The identity is required; the note is theirs to add. */
export interface ResolveRecommendationParams {
  readonly resolvedByUserId: string;
  readonly note?: string | null;
}

/**
 * Raise a recommendation on a chain that grounds it. Refuses anything else — see the module comment, and
 * {@link UngroundedRecommendationError} for what the caller is told when the chain does not hold up.
 */
export function createRecommendation(params: CreateRecommendationParams): Recommendation {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyRecommendationTitleError();
  }

  const subjectDomain = normalizeSourceDomain(params.subjectDomain);
  const subjectId = params.subjectId.trim();
  if (subjectDomain.length === 0 || subjectId.length === 0) {
    throw new EmptyRecommendationSubjectError();
  }

  const evidence = [...params.evidence];
  const chain = inspectEvidenceChain(evidence);
  if (!chain.grounded) {
    throw new UngroundedRecommendationError(evidenceIssueCodes(chain));
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    title,
    summary: params.summary?.trim() || null,
    subjectDomain,
    subjectId,
    impactBand: params.impactBand,
    riskLevel: params.riskLevel,
    requiresHumanJudgement: params.requiresHumanJudgement ?? false,
    status: "proposed",
    evidence,
    confidence: chain.confidence,
    proposedByUserId: params.proposedByUserId?.trim() || null,
    raisedByRuleId: params.raisedByRuleId?.trim() || null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolutionNote: null,
    supersededById: null,
    expiresAt: params.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (recommendation: Recommendation, patch: Partial<Recommendation>): Recommendation => ({
  ...recommendation,
  ...patch,
  updatedAt: nowIso(),
});

/** Nothing moves on a recommendation that has already been answered. */
function requireOpen(recommendation: Recommendation): void {
  if (!isOpenRecommendationStatus(recommendation.status)) {
    throw new RecommendationNotOpenError(recommendation.id, recommendation.status);
  }
}

/** Every answer names a person. An anonymous resolution is not an answer. */
function requireResolver(params: ResolveRecommendationParams): string {
  const resolvedByUserId = params.resolvedByUserId.trim();
  if (resolvedByUserId.length === 0) {
    throw new AnonymousResolutionError();
  }
  return resolvedByUserId;
}

/** Replace the chain and re-derive the confidence together, so the two can never drift apart. */
const withEvidence = (
  recommendation: Recommendation,
  evidence: readonly RecommendationEvidence[],
): Recommendation => touch(recommendation, { evidence, confidence: chainConfidence(evidence) });

// --- Evidence transitions --------------------------------------------------------

/**
 * Cite one more thing. The new piece may only rest on evidence already in the chain — see
 * {@link UnknownEvidenceSupportError} — so a chain cannot acquire a dangling support, and cannot acquire a cycle
 * at all, because the id being added is fresh and nothing yet points at it.
 *
 * Adding evidence can *lower* the confidence, and that is correct: the chain is only as strong as its weakest
 * link, so a weak citation added beside strong ones weakens the argument rather than padding it.
 */
export function addEvidence(
  recommendation: Recommendation,
  params: CiteEvidenceParams,
): Recommendation {
  requireOpen(recommendation);

  const known = new Set<string>(recommendation.evidence.map((piece) => piece.id));
  for (const support of normalizeSupports(params.supports)) {
    if (!known.has(support)) {
      throw new UnknownEvidenceSupportError(recommendation.id, support);
    }
  }

  return withEvidence(recommendation, [...recommendation.evidence, citeEvidence(params)]);
}

/**
 * Take a citation back. Refused when what remains would no longer ground the recommendation, because an open
 * recommendation standing on a hollowed-out chain is precisely what rule two exists to prevent — and the gate
 * downstream would have no way to tell it apart from a sound one. The way out of a justification that no longer
 * holds is {@link withdrawRecommendation}, which says so on the record.
 */
export function retractEvidence(
  recommendation: Recommendation,
  evidenceId: string,
): Recommendation {
  requireOpen(recommendation);

  if (!recommendation.evidence.some((piece) => piece.id === evidenceId)) {
    throw new EvidenceNotFoundError(recommendation.id, evidenceId);
  }

  const remaining = recommendation.evidence.filter((piece) => piece.id !== evidenceId);
  const chain = inspectEvidenceChain(remaining);
  if (!chain.grounded) {
    throw new EvidenceRetractionUngroundsError(
      recommendation.id,
      evidenceId,
      evidenceIssueCodes(chain),
      dependentClosure(recommendation.evidence, evidenceId),
    );
  }

  return withEvidence(recommendation, remaining);
}

// --- Lifecycle -------------------------------------------------------------------

function resolve(
  recommendation: Recommendation,
  status: RecommendationStatus,
  params: ResolveRecommendationParams,
): Recommendation {
  requireOpen(recommendation);
  return touch(recommendation, {
    status,
    resolvedByUserId: requireResolver(params),
    resolvedAt: nowIso(),
    resolutionNote: params.note?.trim() || null,
  });
}

/** A named person agrees with it. What follows from that is a decision record, not merely a status. */
export const acceptRecommendation = (
  recommendation: Recommendation,
  params: ResolveRecommendationParams,
): Recommendation => resolve(recommendation, "accepted", params);

/** A named person disagrees with it. */
export const rejectRecommendation = (
  recommendation: Recommendation,
  params: ResolveRecommendationParams,
): Recommendation => resolve(recommendation, "rejected", params);

/**
 * A revision replaced it. The successor is named on the record so the trail from the original reasoning to the
 * recommendation that was finally acted on stays walkable — a superseded recommendation that does not say what
 * replaced it is a dead end in the institution's memory.
 */
export function supersedeRecommendation(
  recommendation: Recommendation,
  successorId: Uuid,
): Recommendation {
  requireOpen(recommendation);
  if (successorId === recommendation.id) {
    throw new SelfSupersedingRecommendationError(recommendation.id);
  }
  return touch(recommendation, {
    status: "superseded",
    supersededById: successorId,
    resolvedAt: nowIso(),
  });
}

/**
 * Nobody answered in time. This is the only landing with no person behind it, which is exactly why it is its own
 * outcome rather than a rejection: silence is not a refusal, and the record should not suggest anyone weighed it.
 */
export function expireRecommendation(recommendation: Recommendation): Recommendation {
  requireOpen(recommendation);
  return touch(recommendation, { status: "expired", resolvedAt: nowIso() });
}

/** The proposer takes it back — including when its justification no longer holds. A named person owns that. */
export const withdrawRecommendation = (
  recommendation: Recommendation,
  params: ResolveRecommendationParams,
): Recommendation => resolve(recommendation, "withdrawn", params);

// --- Reading -------------------------------------------------------------------

/** Whether the recommendation is still waiting on an answer. */
export const isRecommendationOpen = (recommendation: Recommendation): boolean =>
  isOpenRecommendationStatus(recommendation.status);

/** Whether the recommendation's evidence chain grounds it. Invariantly true while it is open. */
export const isRecommendationGrounded = (recommendation: Recommendation): boolean =>
  isChainGrounded(recommendation.evidence);

/** The full inspection of the chain — shape, issues, depth and confidence. */
export const recommendationEvidenceSummary = (
  recommendation: Recommendation,
): EvidenceChainSummary => inspectEvidenceChain(recommendation.evidence);

/**
 * Whether the recommendation has passed its window at the given instant. ISO-8601 UTC timestamps compare
 * correctly as strings, so this needs no clock of its own — the caller supplies the instant, which keeps the
 * aggregate pure and the test deterministic.
 */
export const hasLapsedAt = (recommendation: Recommendation, at: ISODateString): boolean =>
  recommendation.expiresAt !== null && at >= recommendation.expiresAt;

// --- Engine views ----------------------------------------------------------------

/** The autonomy gate's view. `grounded` is computed here so the gate can never be handed a stale claim. */
export const toRecommendationGateView = (
  recommendation: Recommendation,
): RecommendationGateView => ({
  id: recommendation.id,
  status: recommendation.status,
  grounded: isRecommendationGrounded(recommendation),
  requiresHumanJudgement: recommendation.requiresHumanJudgement,
});

/** The prioritization engine's view. */
export const toRecommendationPriorityView = (
  recommendation: Recommendation,
): RecommendationPriorityView => ({
  id: recommendation.id,
  status: recommendation.status,
  impactBand: recommendation.impactBand,
  riskLevel: recommendation.riskLevel,
  confidence: recommendation.confidence,
  createdAt: recommendation.createdAt,
  expiresAt: recommendation.expiresAt,
});

/** The metrics engine's view. */
export const toRecommendationSummaryView = (
  recommendation: Recommendation,
): RecommendationSummaryView => ({
  id: recommendation.id,
  status: recommendation.status,
  riskLevel: recommendation.riskLevel,
});

/** The evidence engine's view. */
export const toRecommendationEvidenceView = (
  recommendation: Recommendation,
): RecommendationEvidenceView => ({
  id: recommendation.id,
  status: recommendation.status,
  evidence: recommendation.evidence,
});
