import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  BurstBelowLimitError,
  EmptyGatewayKeyError,
  EmptyTrafficPolicyError,
  IncompleteRateLimitError,
  InvalidGatewayKeyError,
  InvalidPolicyLimitError,
  PolicyScopeMismatchError,
} from "./errors";
import type { PolicyLimits } from "./gateway-view";
import {
  type DefineTrafficPolicyParams,
  deactivateTrafficPolicy,
  defineTrafficPolicy,
  isTrafficPolicyActive,
  reactivateTrafficPolicy,
  renameTrafficPolicy,
  reviseTrafficPolicy,
  toPolicyCandidate,
} from "./traffic-policy";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const CONSUMER = "consumer-1" as Uuid;

const limits = (overrides: Partial<PolicyLimits> = {}): PolicyLimits => ({
  requestsPerWindow: 100,
  window: "minute",
  burstAllowance: null,
  maxPayloadBytes: null,
  timeoutMs: null,
  ...overrides,
});

const params = (overrides: Partial<DefineTrafficPolicyParams> = {}): DefineTrafficPolicyParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  scope: "global",
  consumerId: null,
  capabilityKey: null,
  displayName: "Platform default",
  limits: limits(),
  ...overrides,
});

const defined = (overrides: Partial<DefineTrafficPolicyParams> = {}) =>
  defineTrafficPolicy(params(overrides));

describe("defining a policy", () => {
  it("is in force from the moment it exists", () => {
    const policy = defined();
    expect(policy.active).toBe(true);
    expect(isTrafficPolicyActive(policy)).toBe(true);
    expect(policy.deactivatedAt).toBeNull();
  });

  it("keeps the subject each scope is about", () => {
    const consumer = defined({ scope: "consumer", consumerId: CONSUMER });
    const capability = defined({ scope: "capability", capabilityKey: "admissions.applications" });
    const both = defined({
      scope: "consumer_capability",
      consumerId: CONSUMER,
      capabilityKey: "admissions.applications",
    });

    expect(consumer.consumerId).toBe(CONSUMER);
    expect(consumer.capabilityKey).toBeNull();
    expect(capability.capabilityKey).toBe("admissions.applications");
    expect(capability.consumerId).toBeNull();
    expect(both.consumerId).toBe(CONSUMER);
    expect(both.capabilityKey).toBe("admissions.applications");
  });

  it("normalises the capability the way the platform stores it", () => {
    const policy = defined({ scope: "capability", capabilityKey: " Admissions.Applications " });
    expect(policy.capabilityKey).toBe("admissions.applications");
  });

  it("refuses a capability key that is blank or malformed", () => {
    expect(() => defined({ scope: "capability", capabilityKey: "  " })).toThrow(
      EmptyGatewayKeyError,
    );
    expect(() => defined({ scope: "capability", capabilityKey: "admissions apps" })).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("refuses a scope with no subject to apply to", () => {
    expect(() => defined({ scope: "consumer" })).toThrow(PolicyScopeMismatchError);
    expect(() => defined({ scope: "capability" })).toThrow(PolicyScopeMismatchError);
    expect(() => defined({ scope: "consumer_capability", consumerId: CONSUMER })).toThrow(
      PolicyScopeMismatchError,
    );
  });

  it("refuses a subject the scope does not use, which would read as though it applied", () => {
    expect(() => defined({ scope: "global", consumerId: CONSUMER })).toThrow(
      PolicyScopeMismatchError,
    );
    expect(() =>
      defined({ scope: "consumer", consumerId: CONSUMER, capabilityKey: "a.b" }),
    ).toThrow(PolicyScopeMismatchError);
  });
});

describe("the limits a policy may set", () => {
  it("refuses a figure that is not a positive whole number", () => {
    expect(() => defined({ limits: limits({ requestsPerWindow: 0 }) })).toThrow(
      InvalidPolicyLimitError,
    );
    expect(() => defined({ limits: limits({ requestsPerWindow: -1 }) })).toThrow(
      InvalidPolicyLimitError,
    );
    expect(() => defined({ limits: limits({ requestsPerWindow: 1.5 }) })).toThrow(
      InvalidPolicyLimitError,
    );
    expect(() => defined({ limits: limits({ maxPayloadBytes: 0 }) })).toThrow(
      InvalidPolicyLimitError,
    );
  });

  it("refuses half a rate limit in either direction", () => {
    expect(() => defined({ limits: limits({ window: null }) })).toThrow(IncompleteRateLimitError);
    expect(() => defined({ limits: limits({ requestsPerWindow: null }) })).toThrow(
      IncompleteRateLimitError,
    );
  });

  it("refuses a burst with no sustained limit to rise above", () => {
    expect(() =>
      defined({ limits: limits({ requestsPerWindow: null, window: null, burstAllowance: 500 }) }),
    ).toThrow(IncompleteRateLimitError);
  });

  it("refuses a burst that would deny traffic the limit permits", () => {
    expect(() =>
      defined({ limits: limits({ requestsPerWindow: 100, burstAllowance: 50 }) }),
    ).toThrow(BurstBelowLimitError);
  });

  it("accepts a burst equal to the limit, which is how no burst is expressed", () => {
    expect(defined({ limits: limits({ burstAllowance: 100 }) }).limits.burstAllowance).toBe(100);
  });

  it("refuses a policy that sets nothing at all", () => {
    expect(() => defined({ limits: limits({ requestsPerWindow: null, window: null }) })).toThrow(
      EmptyTrafficPolicyError,
    );
  });

  it("says what is half-written before saying the policy is empty", () => {
    expect(() => defined({ limits: limits({ requestsPerWindow: null }) })).toThrow(
      IncompleteRateLimitError,
    );
  });

  it("accepts a policy that sets only a payload ceiling or only a timeout", () => {
    const payload = defined({
      limits: limits({ requestsPerWindow: null, window: null, maxPayloadBytes: 1_048_576 }),
    });
    const timeout = defined({
      limits: limits({ requestsPerWindow: null, window: null, timeoutMs: 30_000 }),
    });

    expect(payload.limits.maxPayloadBytes).toBe(1_048_576);
    expect(timeout.limits.timeoutMs).toBe(30_000);
  });
});

describe("revising a policy", () => {
  it("replaces the limits wholesale rather than patching them", () => {
    const revised = reviseTrafficPolicy(
      defined({ limits: limits({ maxPayloadBytes: 1_024 }) }),
      limits({ requestsPerWindow: 500, window: "hour" }),
    );

    expect(revised.limits.requestsPerWindow).toBe(500);
    expect(revised.limits.window).toBe("hour");
    expect(revised.limits.maxPayloadBytes).toBeNull();
  });

  it("holds a revision to the same rules as a definition", () => {
    expect(() => reviseTrafficPolicy(defined(), limits({ requestsPerWindow: 0 }))).toThrow(
      InvalidPolicyLimitError,
    );
    expect(() =>
      reviseTrafficPolicy(defined(), limits({ requestsPerWindow: null, window: null })),
    ).toThrow(EmptyTrafficPolicyError);
  });

  it("leaves the scope and the subject where they were", () => {
    const policy = defined({ scope: "consumer", consumerId: CONSUMER });
    const revised = reviseTrafficPolicy(policy, limits({ requestsPerWindow: 1 }));

    expect(revised.scope).toBe("consumer");
    expect(revised.consumerId).toBe(CONSUMER);
  });

  it("changes the label without touching anything enforced", () => {
    const renamed = renameTrafficPolicy(defined(), "  Trial tier  ");
    expect(renamed.displayName).toBe("Trial tier");
    expect(renamed.limits.requestsPerWindow).toBe(100);
  });
});

describe("taking a policy out of force", () => {
  it("stops it applying and keeps the record", () => {
    const policy = deactivateTrafficPolicy(defined());
    expect(policy.active).toBe(false);
    expect(policy.deactivatedAt).not.toBeNull();
    expect(policy.limits.requestsPerWindow).toBe(100);
  });

  it("treats a repeat as the state the operator asked for, not as an error", () => {
    const once = deactivateTrafficPolicy(defined());
    const twice = deactivateTrafficPolicy(once);
    expect(twice).toBe(once);
  });

  it("puts it back and clears the record of an absence that has ended", () => {
    const restored = reactivateTrafficPolicy(deactivateTrafficPolicy(defined()));
    expect(restored.active).toBe(true);
    expect(restored.deactivatedAt).toBeNull();
  });

  it("treats a repeated reactivation the same way", () => {
    const policy = defined();
    expect(reactivateTrafficPolicy(policy)).toBe(policy);
  });
});

describe("the resolution candidate", () => {
  it("carries the four facts resolution reads and nothing else", () => {
    const policy = defined({ scope: "consumer", consumerId: CONSUMER });
    const candidate = toPolicyCandidate(policy);

    expect(Object.keys(candidate).sort()).toEqual([
      "active",
      "capabilityKey",
      "consumerId",
      "limits",
      "policyId",
      "scope",
    ]);
    expect(candidate.policyId).toBe(policy.id);
  });

  it("names no tenant, no label and no timestamp", () => {
    const serialised = JSON.stringify(toPolicyCandidate(defined()));
    expect(serialised).not.toContain(TENANT);
    expect(serialised).not.toContain("Platform default");
    expect(serialised).not.toContain("createdAt");
  });

  it("carries the policy out of force as out of force", () => {
    expect(toPolicyCandidate(deactivateTrafficPolicy(defined())).active).toBe(false);
  });
});

describe("immutability", () => {
  it("never mutates the policy it was handed", () => {
    const policy = defined();
    const before = { ...policy };

    reviseTrafficPolicy(policy, limits({ requestsPerWindow: 9 }));
    renameTrafficPolicy(policy, "Something else");
    deactivateTrafficPolicy(policy);

    expect({ ...policy }).toEqual(before);
  });
});
