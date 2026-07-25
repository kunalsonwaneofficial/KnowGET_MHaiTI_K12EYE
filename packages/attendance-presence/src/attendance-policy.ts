import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type AttendancePolicyRevision,
  type AttendancePolicyRuleType,
  type AttendancePolicyStatus,
} from "./attendance-policy-rule";
import { AttendancePolicyArchivedError, EmptyAttendancePolicyFieldError } from "./errors";

/**
 * A configurable, version-controlled institutional attendance rule — a minimum attendance
 * percentage, an examination- or promotion-eligibility threshold, or a late/early/grace
 * rule. One per (organization, code). The rule configuration lives in open JSON parameters
 * (so new rule shapes need no schema change), and the policy is version-controlled like the
 * scheduling policy (P2-D07): a counter plus an append-only revision log. Only `active`
 * policies are evaluated; an `AttendancePolicy` structurally satisfies the engine's
 * constraint view.
 */
export interface AttendancePolicy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: AttendancePolicyRuleType;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly description: string | null;
  readonly version: number;
  readonly status: AttendancePolicyStatus;
  readonly revisions: readonly AttendancePolicyRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAttendancePolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: AttendancePolicyRuleType;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly description?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAttendancePolicyFieldError(field);
  }
  return trimmed;
};

const touch = (policy: AttendancePolicy, patch: Partial<AttendancePolicy>): AttendancePolicy => ({
  ...policy,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (policy: AttendancePolicy): void => {
  if (policy.status === "archived") {
    throw new AttendancePolicyArchivedError(policy.id);
  }
};

/** Create a new draft attendance policy at version 1. */
export function createAttendancePolicy(params: CreateAttendancePolicyParams): AttendancePolicy {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code: requireText(params.code, "code"),
    name: requireText(params.name, "name"),
    ruleType: params.ruleType,
    parameters: params.parameters ? { ...params.parameters } : {},
    description: params.description?.trim() || null,
    version: 1,
    status: "draft",
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the policy. Not permitted once archived. */
export function renameAttendancePolicy(policy: AttendancePolicy, name: string): AttendancePolicy {
  assertNotArchived(policy);
  return touch(policy, { name: requireText(name, "name") });
}

/** Replace the policy's rule parameters. Not permitted once archived. */
export function setPolicyParameters(
  policy: AttendancePolicy,
  parameters: Readonly<Record<string, unknown>>,
): AttendancePolicy {
  assertNotArchived(policy);
  return touch(policy, { parameters: { ...parameters } });
}

/** Set (or clear) the policy description. Not permitted once archived. */
export function setPolicyDescription(
  policy: AttendancePolicy,
  description: string | null,
): AttendancePolicy {
  assertNotArchived(policy);
  return touch(policy, { description: description?.trim() || null });
}

/** Activate the policy so the engine evaluates it (draft → active). */
export function activatePolicy(policy: AttendancePolicy): AttendancePolicy {
  assertNotArchived(policy);
  return touch(policy, { status: "active" });
}

/**
 * Revise the policy — bump the version and append to the revision log, keeping it active.
 * Not permitted once archived.
 */
export function revisePolicy(policy: AttendancePolicy, note: string): AttendancePolicy {
  assertNotArchived(policy);
  const version = policy.version + 1;
  const revision: AttendancePolicyRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(policy, { version, status: "active", revisions: [...policy.revisions, revision] });
}

/** Archive the policy (retired). Terminal — an archived policy is no longer evaluated. */
export function archivePolicy(policy: AttendancePolicy): AttendancePolicy {
  return touch(policy, { status: "archived" });
}
