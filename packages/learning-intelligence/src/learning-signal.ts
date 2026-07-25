import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EvidenceRef, InsightDimension, SignalSource, SignalTrend } from "./insight-value";
import { InvalidLearningSignalError } from "./errors";

/**
 * A single descriptive signal about a learner, distilled from an upstream domain's own indicator
 * and captured into the learner's append-only signal feed. It carries the learning dimension it
 * speaks to, a normalised 0–100 health reading (higher is healthier), a trend, and an **evidence
 * reference** to the source record — the evidence chain the human-centred AI constraint requires.
 * Signals are **immutable once captured** (a captured fact never mutates), and structurally satisfy
 * the synthesis engine's signal view.
 */
export interface LearningSignal {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: InsightDimension;
  readonly source: SignalSource;
  readonly metric: string;
  readonly value: number;
  readonly trend: SignalTrend;
  readonly observedAt: string;
  readonly evidence: EvidenceRef;
  readonly note: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CaptureLearningSignalParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: InsightDimension;
  readonly source: SignalSource;
  readonly metric: string;
  readonly value: number;
  readonly trend?: SignalTrend;
  readonly observedAt?: string | null;
  readonly evidence?: Partial<EvidenceRef>;
  readonly note?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidLearningSignalError(`a non-empty ${field} is required`);
  }
  return trimmed;
};

/** A finite reading, clamped to the 0–100 health scale. */
const health = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new InvalidLearningSignalError("the reading must be a finite number");
  }
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
};

const evidenceOf = (
  source: SignalSource,
  evidence: Partial<EvidenceRef> | undefined,
): EvidenceRef => ({
  source: evidence?.source ?? source,
  kind: evidence?.kind?.trim() || "indicator",
  ref: evidence?.ref ?? null,
  detail: evidence?.detail?.trim() || null,
});

/** Capture a new, immutable learning signal for a learner. */
export function captureLearningSignal(params: CaptureLearningSignalParams): LearningSignal {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    dimension: params.dimension,
    source: params.source,
    metric: requireText(params.metric, "metric"),
    value: health(params.value),
    trend: params.trend ?? "stable",
    observedAt: params.observedAt?.trim() || now,
    evidence: evidenceOf(params.source, params.evidence),
    note: params.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}
