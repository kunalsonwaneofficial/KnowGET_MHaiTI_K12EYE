import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EvidenceRef, InsightDimension, InsightEvent, RiskBand } from "./insight-value";
import { EarlyWarningStateError, EmptyInsightFieldError } from "./errors";

/**
 * Lifecycle of an early warning. `raised` when a rule trips; a responsible adult `acknowledged` it;
 * it is then `resolved` (the concern was addressed) or `dismissed` (a false or no-longer-relevant
 * flag). Resolved and dismissed are terminal.
 */
export const EARLY_WARNING_STATUSES = ["raised", "acknowledged", "resolved", "dismissed"] as const;

export type EarlyWarningStatus = (typeof EARLY_WARNING_STATUSES)[number];

/**
 * A rule-based, **explainable** early-warning flag raised for a learner in a learning dimension.
 * It carries the id of the rule that fired, the exact score that tripped it, a human-readable
 * rationale and the supporting evidence — never a prediction, always a transparent reason. Its
 * lifecycle (raised → acknowledged → resolved | dismissed) is recorded in an append-only history so
 * the institution's response is auditable.
 */
export interface EarlyWarning {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: InsightDimension;
  readonly ruleId: string;
  readonly severity: RiskBand;
  readonly observedScore: number;
  readonly rationale: string;
  readonly evidence: readonly EvidenceRef[];
  readonly status: EarlyWarningStatus;
  readonly history: readonly InsightEvent[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RaiseEarlyWarningParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: InsightDimension;
  readonly ruleId: string;
  readonly severity: RiskBand;
  readonly observedScore: number;
  readonly rationale: string;
  readonly evidence?: readonly EvidenceRef[];
  readonly raisedBy?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyInsightFieldError(field);
  }
  return trimmed;
};

/** The observed score is a 0–100 dimension-health reading; clamp it (finite → 0 when not). */
const clampScore = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 100) / 100)) : 0;

const touch = (warning: EarlyWarning, patch: Partial<EarlyWarning>): EarlyWarning => ({
  ...warning,
  ...patch,
  updatedAt: nowIso(),
});

const entry = (action: string, actor: Uuid | null, note: string | null): InsightEvent => ({
  action,
  actor,
  at: nowIso(),
  note,
});

/** Raise a new early warning for a learner (status `raised`, history seeded). */
export function raiseEarlyWarning(params: RaiseEarlyWarningParams): EarlyWarning {
  const now = nowIso();
  const actor = params.raisedBy ?? null;
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    dimension: params.dimension,
    ruleId: requireText(params.ruleId, "rule id"),
    severity: params.severity,
    observedScore: clampScore(params.observedScore),
    rationale: requireText(params.rationale, "rationale"),
    evidence: params.evidence ? [...params.evidence] : [],
    status: "raised",
    history: [{ action: "raised", actor, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Acknowledge a raised warning (raised → acknowledged). */
export function acknowledgeEarlyWarning(
  warning: EarlyWarning,
  actor: Uuid | null = null,
  note: string | null = null,
): EarlyWarning {
  if (warning.status !== "raised") {
    throw new EarlyWarningStateError(warning.id, "raised", warning.status);
  }
  return touch(warning, {
    status: "acknowledged",
    history: [...warning.history, entry("acknowledged", actor, note?.trim() || null)],
  });
}

/** Resolve a warning — the concern was addressed (raised or acknowledged → resolved). Terminal. */
export function resolveEarlyWarning(
  warning: EarlyWarning,
  actor: Uuid | null = null,
  note: string | null = null,
): EarlyWarning {
  if (warning.status !== "raised" && warning.status !== "acknowledged") {
    throw new EarlyWarningStateError(warning.id, "raised or acknowledged", warning.status);
  }
  return touch(warning, {
    status: "resolved",
    history: [...warning.history, entry("resolved", actor, note?.trim() || null)],
  });
}

/** Dismiss a warning — a false or no-longer-relevant flag (raised or acknowledged → dismissed). */
export function dismissEarlyWarning(
  warning: EarlyWarning,
  actor: Uuid | null = null,
  note: string | null = null,
): EarlyWarning {
  if (warning.status !== "raised" && warning.status !== "acknowledged") {
    throw new EarlyWarningStateError(warning.id, "raised or acknowledged", warning.status);
  }
  return touch(warning, {
    status: "dismissed",
    history: [...warning.history, entry("dismissed", actor, note?.trim() || null)],
  });
}
