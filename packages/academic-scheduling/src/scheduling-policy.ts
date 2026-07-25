import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySchedulingPolicyFieldError, SchedulingPolicyArchivedError } from "./errors";
import { type PolicyRevision, type PolicyRuleType, type SchedulingPolicyStatus } from "./policy";

/**
 * An institutional scheduling constraint — a configurable, version-controlled rule such as
 * a maximum number of teaching periods per day, a consecutive-period limit or a break rule.
 * One per (organization, code). The rule's numeric configuration lives in `parameters`
 * (open JSON so new rule shapes need no schema change), and the policy is version-controlled
 * like a curriculum framework: a counter plus an append-only revision log. Only `active`
 * policies are enforced by the conflict engine. A `SchedulingPolicy` is a superset of the
 * engine's `SchedulingConstraint` view.
 */
export interface SchedulingPolicy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: PolicyRuleType;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly description: string | null;
  readonly version: number;
  readonly status: SchedulingPolicyStatus;
  readonly revisions: readonly PolicyRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSchedulingPolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: PolicyRuleType;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly description?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptySchedulingPolicyFieldError(field);
  }
  return trimmed;
};

const touch = (policy: SchedulingPolicy, patch: Partial<SchedulingPolicy>): SchedulingPolicy => ({
  ...policy,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (policy: SchedulingPolicy): void => {
  if (policy.status === "archived") {
    throw new SchedulingPolicyArchivedError(policy.id);
  }
};

/** Create a new draft scheduling policy at version 1. */
export function createSchedulingPolicy(params: CreateSchedulingPolicyParams): SchedulingPolicy {
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
export function renameSchedulingPolicy(policy: SchedulingPolicy, name: string): SchedulingPolicy {
  assertNotArchived(policy);
  return touch(policy, { name: requireText(name, "name") });
}

/** Replace the policy's rule parameters. Not permitted once archived. */
export function setPolicyParameters(
  policy: SchedulingPolicy,
  parameters: Readonly<Record<string, unknown>>,
): SchedulingPolicy {
  assertNotArchived(policy);
  return touch(policy, { parameters: { ...parameters } });
}

/** Set (or clear) the policy description. Not permitted once archived. */
export function setPolicyDescription(
  policy: SchedulingPolicy,
  description: string | null,
): SchedulingPolicy {
  assertNotArchived(policy);
  return touch(policy, { description: description?.trim() || null });
}

/** Activate the policy so the conflict engine enforces it (draft → active). */
export function activatePolicy(policy: SchedulingPolicy): SchedulingPolicy {
  assertNotArchived(policy);
  return touch(policy, { status: "active" });
}

/**
 * Revise the policy — bump the version and append to the revision log, keeping it active.
 * Not permitted once archived.
 */
export function revisePolicy(policy: SchedulingPolicy, note: string): SchedulingPolicy {
  assertNotArchived(policy);
  const version = policy.version + 1;
  const revision: PolicyRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(policy, {
    version,
    status: "active",
    revisions: [...policy.revisions, revision],
  });
}

/** Archive the policy (retired). Terminal — an archived policy is no longer enforced. */
export function archivePolicy(policy: SchedulingPolicy): SchedulingPolicy {
  return touch(policy, { status: "archived" });
}
