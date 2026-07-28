import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type HealthPillar, type ReadingStanding, normalizeSourceDomain } from "./command-value";
import type {
  EvidenceCitation,
  KpiWatch,
  Measurement,
  ReadingAdmission,
  TracedReading,
} from "./command-view";
import {
  KpiNotActiveError,
  KpiReadingAlreadyWithdrawnError,
  NonOrdinalReadingPeriodError,
  UngroundedKpiReadingError,
} from "./errors";
import { type KpiDefinition, isKpiActive, scoreKpiMeasure } from "./kpi-definition";
import { validateEvidence } from "./traceability";

/**
 * A KPI reading: one figure, at one period, and the records it stands on.
 *
 * This is where the contract's third clause stops being a description of the package and becomes a property of
 * it. There is no path through this module that produces a reading without usable evidence attached — not a
 * warning, not a nullable provenance field somebody fills in later, not a nightly job that flags the ones that
 * never got sourced. A dashboard whose figures are *usually* traceable is worse than one that is honestly
 * untraceable, because it teaches its readers that the provenance link is decoration and they stop checking
 * which numbers have one.
 *
 * Three things about a reading are derived rather than declared, and each of them is a lie the record cannot
 * tell as a result. Its **score** is computed from the definition's scale, so no caller can file a figure
 * alongside a flattering score for it. Its **standing** is the weakest of what it cites, so a projection cannot
 * be entered as a measurement by an author who would rather it read that way. And its **identity** — tenant,
 * organization, key, pillar — is taken from the definition in hand rather than supplied, so the denormalized
 * copies cannot disagree with the definition they came from.
 *
 * The measurement is stored as the engine's own union rather than flattened into a score with a validity flag
 * beside it. A reading whose raw value was inadmissible in its unit is a real event an institution needs to see
 * — the attendance feed sent nonsense this week — and it is recorded, with no `score` field on it to read. That
 * is a deliberate refusal to be convenient: flattening it to `score: number | null` would let a pillar roll-up
 * average in a zero for a reading that was never scored, which is the single most damaging arithmetic mistake
 * available in this contract. {@link kpiReadingScore} is the one accessor that answers safely.
 *
 * Withdrawal is a timestamp rather than a status, because a reading has no lifecycle to speak of: it is taken,
 * and at most it is later found to have been wrong. Keeping the moment rather than a state matters downstream —
 * an assessment invalidated because its pinned readings were withdrawn has to be able to say when that happened,
 * and a status column would have thrown the answer away.
 */

// --- The aggregate ---------------------------------------------------------------

export interface KpiReading {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly kpiDefinitionId: Uuid;
  /** Copied from the definition, which cannot change it. What panels and pillar roll-ups address. */
  readonly kpiKey: string;
  /** Copied from the definition, which cannot change it. Which pillar this figure rolls up into. */
  readonly pillar: HealthPillar;
  /**
   * The period ordinal this was taken at, on a grid the institution defines. An integer, and never a date: this
   * package holds no clock, so every staleness decision in the contract is subtraction between two of these.
   */
  readonly period: number;
  /** The scored measure, or the engine's explicit refusal to score it. Never assembled by a caller. */
  readonly measurement: Measurement;
  /** The records this figure stands on. At least one, and every one of them usable. */
  readonly citations: readonly EvidenceCitation[];
  /** The weakest standing among the citations. Derived on the way in and never declared. */
  readonly standing: ReadingStanding;
  /** When the institution said this figure should never have counted. `null` while it stands. */
  readonly withdrawnAt: ISODateString | null;
  readonly withdrawalReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordKpiReadingParams {
  /** The period ordinal the figure is about. */
  readonly period: number;
  /** The figure as the source domain published it, in the KPI's declared unit. */
  readonly rawValue: number;
  readonly citations: readonly EvidenceCitation[];
}

/**
 * A citation as it is stored: canonical, and detached from the caller's object.
 *
 * The domain is folded and the ref is only trimmed, which is the same asymmetry the traceability engine applies
 * when it looks for duplicates — refs are opaque identifiers belonging to domains whose case rules this package
 * does not know, and folding them would merge two genuinely different records in any domain that is
 * case-sensitive.
 */
const copyCitation = (citation: EvidenceCitation): EvidenceCitation => ({
  kind: citation.kind,
  sourceDomain: normalizeSourceDomain(citation.sourceDomain),
  sourceRef: citation.sourceRef.trim(),
  attestedBy: citation.attestedBy?.trim() || null,
});

/**
 * File a figure against an indicator. The definition is passed in rather than its id, and everything the reading
 * knows about itself beyond the figure comes from it.
 *
 * Readings are filed against an **active** indicator only. A draft is a scale still being argued about, and a
 * reading scored by one would have to be rescored or discarded the moment the argument finished. A retired
 * indicator is one the institution has stopped measuring, and a reading arriving against it means a feed nobody
 * switched off is still writing — worth being told about rather than absorbed silently.
 *
 * An inadmissible figure does not throw. The evidence gate refuses, because a number of unknown origin should
 * not exist; the scoring gate does not, because a number whose origin is known and whose value is nonsense is
 * precisely what an institution needs to see. Those are different failures and they get different treatment.
 */
export function recordKpiReading(
  definition: KpiDefinition,
  params: RecordKpiReadingParams,
): KpiReading {
  if (!isKpiActive(definition)) {
    throw new KpiNotActiveError(definition.kpiKey, definition.status);
  }
  if (!Number.isInteger(params.period)) {
    throw new NonOrdinalReadingPeriodError(params.period);
  }

  const evidence = validateEvidence(params.citations);
  if (!evidence.usable || evidence.standing === null) {
    throw new UngroundedKpiReadingError(
      definition.kpiKey,
      evidence.issues.map((entry) => entry.code),
    );
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: definition.tenantId,
    organizationId: definition.organizationId,
    kpiDefinitionId: definition.id,
    kpiKey: definition.kpiKey,
    pillar: definition.pillar,
    period: params.period,
    measurement: scoreKpiMeasure(definition, params.rawValue),
    citations: params.citations.map(copyCitation),
    standing: evidence.standing,
    withdrawnAt: null,
    withdrawalReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (reading: KpiReading, patch: Partial<KpiReading>): KpiReading => ({
  ...reading,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Say that this figure should never have counted.
 *
 * The reading is not deleted and its measurement is not altered. An assessment that consumed it needs to be able
 * to show what it consumed and why that stopped being acceptable, and a withdrawal that erased the figure would
 * leave the institution unable to explain its own restatement. Withdrawing twice is refused, because the second
 * attempt would move the timestamp an invalidation was traced to — the one thing about a withdrawal anybody
 * later needs.
 */
export function withdrawKpiReading(reading: KpiReading, reason: string): KpiReading {
  if (isKpiReadingWithdrawn(reading)) {
    throw new KpiReadingAlreadyWithdrawnError(reading.id);
  }
  return touch(reading, {
    withdrawnAt: nowIso(),
    withdrawalReason: reason.trim() || null,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the institution has taken this figure back. */
export const isKpiReadingWithdrawn = (reading: KpiReading): boolean => reading.withdrawnAt !== null;

/** Whether the figure was scoreable at all. A `false` here is a coverage fact, not a bad result. */
export const isKpiReadingScoreable = (reading: KpiReading): boolean =>
  reading.measurement.scoreable;

/**
 * This reading's score, or `null` when it has none to give.
 *
 * The one safe accessor, and the reason the measurement is stored as a union. `null` covers both a withdrawn
 * reading and one the scale could not score, because a pillar roll-up must treat them identically: neither is a
 * figure, and averaging either in as a zero would report an institution in crisis on the strength of a broken
 * feed. Callers that need to tell the two apart have {@link isKpiReadingWithdrawn} and the measurement itself.
 */
export const kpiReadingScore = (reading: KpiReading): number | null => {
  if (isKpiReadingWithdrawn(reading)) return null;
  return reading.measurement.scoreable ? reading.measurement.score : null;
};

/**
 * The readings an assessment may audit, as the traceability engine sees them.
 *
 * Takes a set and returns a set, and withdrawn readings do not come out of it. That is the only door between
 * this aggregate and the audit, so a withdrawn figure cannot reach an assessment's evidence base by a caller
 * forgetting to filter — which is the version of the rule that survives the sixth service written against it.
 * The mapper drops the measured value too, because whether a reading may be counted is a question about its
 * evidence and its period, and an engine that could also see the number would eventually be asked to let a
 * plausible figure through on thin evidence because it looked about right.
 */
export const toTracedReadings = (readings: readonly KpiReading[]): readonly TracedReading[] =>
  readings
    .filter((reading) => !isKpiReadingWithdrawn(reading))
    .map((reading) => ({
      kpiKey: reading.kpiKey,
      period: reading.period,
      citations: reading.citations,
    }));

/**
 * What attention sees of this reading.
 *
 * The admission is passed in rather than re-derived, because the traceability engine has already decided it and
 * a second opinion here would be a second definition of admissible. The target comes off the definition rather
 * than off the reading: a target can move while a scale cannot, so denormalizing it onto every reading would
 * leave a retarget quietly disagreeing with the readings taken before it.
 */
export const toKpiWatch = (
  reading: KpiReading,
  definition: KpiDefinition,
  admission: ReadingAdmission,
): KpiWatch => ({
  kpiKey: reading.kpiKey,
  score: kpiReadingScore(reading),
  targetScore: definition.targetScore,
  admission,
});
