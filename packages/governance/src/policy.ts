import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyPolicyTitleError, InvalidPolicyTransitionError } from "./errors";
import type { PolicyCategory } from "./policy-category";

/**
 * Policy lifecycle: `draft` (being authored) → `approved` (signed off) →
 * `published` (in force) → `retired`. A published policy is `amend`ed to begin a
 * new draft version, so the registry keeps a monotonically increasing version.
 */
export type PolicyStatus = "draft" | "approved" | "published" | "retired";

/**
 * An institutional policy in the centralized registry — version-controlled and
 * lifecycle-managed. Scoped to an Organization node; the authoritative source for
 * "which policy applies" that every other domain reads rather than reimplements.
 */
export interface Policy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly category: PolicyCategory;
  readonly title: string;
  readonly body: string;
  /** Monotonically increasing revision number (starts at 1). */
  readonly version: number;
  readonly status: PolicyStatus;
  readonly ownerId: Uuid;
  readonly effectiveOn: string | null;
  readonly approvedOn: string | null;
  readonly publishedOn: string | null;
  readonly retiredOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/** A person's acknowledgment that they have read a published policy version. */
export interface PolicyAcknowledgment {
  readonly tenantId: TenantId;
  readonly policyId: Uuid;
  readonly personId: Uuid;
  readonly version: number;
  readonly acknowledgedOn: ISODateString;
}

export interface AuthorPolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly category: PolicyCategory;
  readonly title: string;
  readonly ownerId: Uuid;
  readonly body?: string;
}

/** Author a new `draft` policy at version 1 (rejecting an empty title). */
export function authorPolicy(params: AuthorPolicyParams): Policy {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyPolicyTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    category: params.category,
    title,
    body: params.body ?? "",
    version: 1,
    status: "draft",
    ownerId: params.ownerId,
    effectiveOn: null,
    approvedOn: null,
    publishedOn: null,
    retiredOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (policy: Policy, patch: Partial<Policy>): Policy => ({
  ...policy,
  ...patch,
  updatedAt: nowIso(),
});

const requireStatus = (policy: Policy, expected: PolicyStatus, to: string): void => {
  if (policy.status !== expected) {
    throw new InvalidPolicyTransitionError(policy.status, to);
  }
};

/** Edit a draft policy's title/body (draft only; rejects an empty title). */
export function updateDraft(policy: Policy, changes: { title?: string; body?: string }): Policy {
  requireStatus(policy, "draft", "draft");
  const title = changes.title?.trim();
  if (title !== undefined && title.length === 0) {
    throw new EmptyPolicyTitleError();
  }
  return touch(policy, {
    ...(title !== undefined ? { title } : {}),
    ...(changes.body !== undefined ? { body: changes.body } : {}),
  });
}

/** Approve a draft policy for publication. */
export function approvePolicy(policy: Policy, approvedOn?: string | null): Policy {
  requireStatus(policy, "draft", "approved");
  return touch(policy, { status: "approved", approvedOn: approvedOn ?? nowIso().slice(0, 10) });
}

/** Publish an approved policy, putting it in force from `effectiveOn`. */
export function publishPolicy(
  policy: Policy,
  options: { effectiveOn?: string | null; publishedOn?: string | null } = {},
): Policy {
  requireStatus(policy, "approved", "published");
  const on = options.publishedOn ?? nowIso().slice(0, 10);
  return touch(policy, {
    status: "published",
    publishedOn: on,
    effectiveOn: options.effectiveOn ?? on,
  });
}

/** Amend a published policy: start a new draft at the next version. */
export function amendPolicy(policy: Policy): Policy {
  requireStatus(policy, "published", "draft");
  return touch(policy, {
    status: "draft",
    version: policy.version + 1,
    approvedOn: null,
  });
}

/** Retire a published policy (it is no longer in force). */
export function retirePolicy(policy: Policy, retiredOn?: string | null): Policy {
  requireStatus(policy, "published", "retired");
  return touch(policy, { status: "retired", retiredOn: retiredOn ?? nowIso().slice(0, 10) });
}

/** True when the policy is currently in force (status `published`). */
export const isInForce = (policy: Policy): boolean => policy.status === "published";

/** Record a person's acknowledgment of a policy's current published version. */
export function acknowledge(
  policy: Policy,
  personId: Uuid,
  acknowledgedOn?: ISODateString,
): PolicyAcknowledgment {
  return {
    tenantId: policy.tenantId,
    policyId: policy.id,
    personId,
    version: policy.version,
    acknowledgedOn: acknowledgedOn ?? nowIso(),
  };
}
