import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyPolicyNameError,
  InvalidPolicyRuleError,
  InvalidPolicyTransitionError,
  PolicyNotEditableError,
} from "./errors";
import type { MemberCategory, PolicyStatus } from "./library-value";

/**
 * A circulation rule for a member category — the loan period, borrowing limit, renewal limit and hold
 * shelf life that govern how that category borrows. All are non-negative whole numbers.
 */
export interface CategoryRule {
  readonly category: MemberCategory;
  readonly loanPeriodDays: number;
  readonly borrowingLimit: number;
  readonly renewalLimit: number;
  readonly holdShelfDays: number;
}

/** The rule applied when a member's category has no specific rule — same shape, without the category. */
export interface DefaultRule {
  readonly loanPeriodDays: number;
  readonly borrowingLimit: number;
  readonly renewalLimit: number;
  readonly holdShelfDays: number;
}

/**
 * A circulation policy — the version-controlled rules that govern lending. It carries a name, a default
 * rule and a list of per-category rules (both frozen once active). It runs `draft` (rules editable) →
 * `active` (published, applied) → `archived` (terminal, superseded). One active policy per organization;
 * loans and reservations resolve their terms from the active policy for the member's category. The loan
 * terms are snapshotted onto each loan at issue, so a later policy change never rewrites live loans.
 */
export interface CirculationPolicy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly defaultRule: DefaultRule;
  readonly rules: readonly CategoryRule[];
  readonly version: number;
  readonly status: PolicyStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftPolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly defaultRule: DefaultRule;
  readonly rules?: readonly CategoryRule[];
}

const requireLimits = (rule: DefaultRule, label: string): void => {
  for (const [key, value] of Object.entries(rule)) {
    if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
      throw new InvalidPolicyRuleError(`${label} ${key} must be a non-negative integer`);
    }
  }
};

const validateRules = (defaultRule: DefaultRule, rules: readonly CategoryRule[]): void => {
  requireLimits(defaultRule, "default rule");
  const seen = new Set<string>();
  for (const rule of rules) {
    requireLimits(rule, `rule for ${rule.category}`);
    if (seen.has(rule.category)) {
      throw new InvalidPolicyRuleError(`duplicate rule for category "${rule.category}"`);
    }
    seen.add(rule.category);
  }
};

/** Draft a circulation policy (status `draft`). Name and non-negative rule limits required. */
export function draftCirculationPolicy(params: DraftPolicyParams): CirculationPolicy {
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyPolicyNameError();
  }
  const rules = params.rules ?? [];
  validateRules(params.defaultRule, rules);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name,
    defaultRule: params.defaultRule,
    rules: [...rules],
    version: 1,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  policy: CirculationPolicy,
  patch: Partial<CirculationPolicy>,
): CirculationPolicy => ({
  ...policy,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (policy: CirculationPolicy): void => {
  if (policy.status !== "draft") {
    throw new PolicyNotEditableError(policy.id, policy.status);
  }
};

/** Replace the policy's per-category rules (draft only). */
export function setPolicyRules(
  policy: CirculationPolicy,
  rules: readonly CategoryRule[],
): CirculationPolicy {
  requireDraft(policy);
  validateRules(policy.defaultRule, rules);
  return touch(policy, { rules: [...rules] });
}

/** Replace the policy's default rule (draft only). */
export function setPolicyDefaultRule(
  policy: CirculationPolicy,
  defaultRule: DefaultRule,
): CirculationPolicy {
  requireDraft(policy);
  validateRules(defaultRule, policy.rules);
  return touch(policy, { defaultRule });
}

/** Activate a draft policy (→ `active`), freezing its rules. */
export function activatePolicy(policy: CirculationPolicy): CirculationPolicy {
  if (policy.status !== "draft") {
    throw new InvalidPolicyTransitionError(policy.status, "active");
  }
  return touch(policy, { status: "active" });
}

/** Archive an active policy (→ `archived`, terminal). */
export function archivePolicy(policy: CirculationPolicy): CirculationPolicy {
  if (policy.status !== "active") {
    throw new InvalidPolicyTransitionError(policy.status, "archived");
  }
  return touch(policy, { status: "archived" });
}

/** Whether the policy is active. */
export const isPolicyActive = (policy: CirculationPolicy): boolean => policy.status === "active";

/** Resolve the circulation terms for a member category — its specific rule, or the default rule. */
export function resolveTerms(policy: CirculationPolicy, category: MemberCategory): DefaultRule {
  const rule = policy.rules.find((r) => r.category === category);
  if (!rule) {
    return policy.defaultRule;
  }
  return {
    loanPeriodDays: rule.loanPeriodDays,
    borrowingLimit: rule.borrowingLimit,
    renewalLimit: rule.renewalLimit,
    holdShelfDays: rule.holdShelfDays,
  };
}
