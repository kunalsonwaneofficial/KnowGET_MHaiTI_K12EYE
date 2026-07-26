import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyComfortPolicyNameError,
  InvalidComfortPolicyTransitionError,
  InvalidComfortPolicyVersionError,
  InvalidComfortThresholdError,
} from "./errors";
import { SENSOR_METRICS } from "./facilities-value";
import type { PolicyStatus } from "./facilities-value";
import type { ComfortThreshold } from "./facilities-view";

/**
 * A comfort policy — a named, versioned set of per-metric acceptable ranges (a min and a max for each of
 * temperature, humidity, CO₂, …) that the pure comfort engine measures a space's latest readings against.
 * It runs `draft → active → archived`; its thresholds are editable only while `draft`, so an `active`
 * version is immutable and a change means drafting the next version. At most one policy may be `active` per
 * organization (TD-40, service-enforced). Descriptive configuration — nothing here is money.
 */
export interface ComfortPolicy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly version: number;
  readonly thresholds: readonly ComfortThreshold[];
  readonly status: PolicyStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftComfortPolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly version?: number;
  readonly thresholds?: readonly ComfortThreshold[];
}

const METRICS = new Set<string>(SENSOR_METRICS);

/** Validate a threshold set — known metrics, finite bounds, `min <= max`, no duplicate metric. */
function validateThresholds(thresholds: readonly ComfortThreshold[]): readonly ComfortThreshold[] {
  const seen = new Set<string>();
  for (const threshold of thresholds) {
    if (!METRICS.has(threshold.metric)) {
      throw new InvalidComfortThresholdError(`unknown metric "${threshold.metric}"`);
    }
    if (!Number.isFinite(threshold.min) || !Number.isFinite(threshold.max)) {
      throw new InvalidComfortThresholdError(`non-finite bound for metric "${threshold.metric}"`);
    }
    if (threshold.min > threshold.max) {
      throw new InvalidComfortThresholdError(
        `min ${threshold.min} exceeds max ${threshold.max} for metric "${threshold.metric}"`,
      );
    }
    if (seen.has(threshold.metric)) {
      throw new InvalidComfortThresholdError(`duplicate metric "${threshold.metric}"`);
    }
    seen.add(threshold.metric);
  }
  return thresholds.map((t) => ({ metric: t.metric, min: t.min, max: t.max }));
}

function requireVersion(version: number): number {
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidComfortPolicyVersionError(version);
  }
  return version;
}

/** Draft a comfort policy (status `draft`, version 1 by default). Name required; thresholds validated. */
export function draftComfortPolicy(params: DraftComfortPolicyParams): ComfortPolicy {
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyComfortPolicyNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name,
    version: requireVersion(params.version ?? 1),
    thresholds: validateThresholds(params.thresholds ?? []),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (policy: ComfortPolicy, patch: Partial<ComfortPolicy>): ComfortPolicy => ({
  ...policy,
  ...patch,
  updatedAt: nowIso(),
});

/** Replace the threshold set — only while `draft` (an active version is immutable). */
export function setComfortThresholds(
  policy: ComfortPolicy,
  thresholds: readonly ComfortThreshold[],
): ComfortPolicy {
  if (policy.status !== "draft") {
    throw new InvalidComfortPolicyTransitionError(policy.status, "thresholds-set");
  }
  return touch(policy, { thresholds: validateThresholds(thresholds) });
}

/** Rename the policy — only while `draft`. */
export function renameComfortPolicy(policy: ComfortPolicy, name: string): ComfortPolicy {
  if (policy.status !== "draft") {
    throw new InvalidComfortPolicyTransitionError(policy.status, "renamed");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyComfortPolicyNameError();
  }
  return touch(policy, { name: trimmed });
}

/** Activate a draft policy (→ `active`). */
export function activateComfortPolicy(policy: ComfortPolicy): ComfortPolicy {
  if (policy.status !== "draft") {
    throw new InvalidComfortPolicyTransitionError(policy.status, "active");
  }
  return touch(policy, { status: "active" });
}

/** Archive an active policy (→ `archived`, terminal). */
export function archiveComfortPolicy(policy: ComfortPolicy): ComfortPolicy {
  if (policy.status !== "active") {
    throw new InvalidComfortPolicyTransitionError(policy.status, "archived");
  }
  return touch(policy, { status: "archived" });
}

/** Whether the policy is the active (enforced) version. */
export const isComfortPolicyActive = (policy: ComfortPolicy): boolean => policy.status === "active";
