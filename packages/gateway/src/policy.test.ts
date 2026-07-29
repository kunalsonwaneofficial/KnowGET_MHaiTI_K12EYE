import { describe, expect, it } from "vitest";
import type { Uuid } from "@knowget/types";
import type { PolicyCandidate, PolicyLimits, PolicySelector } from "./gateway-view";
import { UNLIMITED, policyApplies, resolvePolicy } from "./policy";

const CONSUMER = "consumer-1" as Uuid;
const OTHER_CONSUMER = "consumer-2" as Uuid;
const CAPABILITY = "admissions.applications";

const limits = (overrides: Partial<PolicyLimits> = {}): PolicyLimits => ({
  requestsPerWindow: 100,
  window: "minute",
  burstAllowance: null,
  maxPayloadBytes: null,
  timeoutMs: null,
  ...overrides,
});

const candidate = (overrides: Partial<PolicyCandidate> = {}): PolicyCandidate => ({
  policyId: "policy-m" as Uuid,
  scope: "global",
  consumerId: null,
  capabilityKey: null,
  limits: limits(),
  active: true,
  ...overrides,
});

const globalPolicy = candidate({
  policyId: "policy-1" as Uuid,
  scope: "global",
  limits: limits({ requestsPerWindow: 10, maxPayloadBytes: 1_024, timeoutMs: 5_000 }),
});

const capabilityPolicy = candidate({
  policyId: "policy-2" as Uuid,
  scope: "capability",
  capabilityKey: CAPABILITY,
  limits: limits({ requestsPerWindow: 20 }),
});

const consumerPolicy = candidate({
  policyId: "policy-3" as Uuid,
  scope: "consumer",
  consumerId: CONSUMER,
  limits: limits({ requestsPerWindow: 30 }),
});

const consumerCapabilityPolicy = candidate({
  policyId: "policy-4" as Uuid,
  scope: "consumer_capability",
  consumerId: CONSUMER,
  capabilityKey: CAPABILITY,
  limits: limits({ requestsPerWindow: 40 }),
});

const ALL = [globalPolicy, capabilityPolicy, consumerPolicy, consumerCapabilityPolicy];

const selector: PolicySelector = { consumerId: CONSUMER, capabilityKey: CAPABILITY };

describe("whether a policy is in the running", () => {
  it("puts a global policy in the running for everything", () => {
    expect(policyApplies(globalPolicy, selector)).toBe(true);
    expect(
      policyApplies(globalPolicy, { consumerId: OTHER_CONSUMER, capabilityKey: "library.loans" }),
    ).toBe(true);
  });

  it("keeps a policy about another consumer out of it", () => {
    expect(policyApplies(consumerPolicy, selector)).toBe(true);
    expect(policyApplies(consumerPolicy, { ...selector, consumerId: OTHER_CONSUMER })).toBe(false);
  });

  it("keeps a policy about another capability out of it", () => {
    expect(policyApplies(capabilityPolicy, selector)).toBe(true);
    expect(policyApplies(capabilityPolicy, { ...selector, capabilityKey: "library.loans" })).toBe(
      false,
    );
  });

  it("needs both halves to match on the narrowest scope", () => {
    expect(policyApplies(consumerCapabilityPolicy, selector)).toBe(true);
    expect(
      policyApplies(consumerCapabilityPolicy, { ...selector, consumerId: OTHER_CONSUMER }),
    ).toBe(false);
    expect(
      policyApplies(consumerCapabilityPolicy, { ...selector, capabilityKey: "library.loans" }),
    ).toBe(false);
  });

  it("excludes a policy out of force whatever its scope says", () => {
    expect(policyApplies({ ...consumerCapabilityPolicy, active: false }, selector)).toBe(false);
    expect(policyApplies({ ...globalPolicy, active: false }, selector)).toBe(false);
  });

  it("reads the asked-for capability the way the platform stores it", () => {
    expect(
      policyApplies(capabilityPolicy, { ...selector, capabilityKey: " Admissions.Applications " }),
    ).toBe(true);
  });
});

describe("which policy applies", () => {
  it("gives the narrowest scope the request matches", () => {
    expect(resolvePolicy(selector, ALL).policyId).toBe(consumerCapabilityPolicy.policyId);
    expect(resolvePolicy(selector, ALL).scope).toBe("consumer_capability");
  });

  it("prefers a consumer to a capability when both are in the running", () => {
    const resolved = resolvePolicy(selector, [globalPolicy, capabilityPolicy, consumerPolicy]);
    expect(resolved.scope).toBe("consumer");
    expect(resolved.limits.requestsPerWindow).toBe(30);
  });

  it("prefers a capability to the platform default", () => {
    const resolved = resolvePolicy(selector, [globalPolicy, capabilityPolicy]);
    expect(resolved.scope).toBe("capability");
    expect(resolved.limits.requestsPerWindow).toBe(20);
  });

  it("falls back to the platform default when nothing narrower matches", () => {
    const elsewhere = { consumerId: OTHER_CONSUMER, capabilityKey: "library.loans" };
    const resolved = resolvePolicy(elsewhere, ALL);
    expect(resolved.scope).toBe("global");
    expect(resolved.limits.requestsPerWindow).toBe(10);
  });

  it("gives the same answer whatever order the candidates arrive in", () => {
    const forwards = resolvePolicy(selector, ALL);
    const backwards = resolvePolicy(selector, [...ALL].reverse());
    expect(backwards).toEqual(forwards);
  });

  it("settles a scope tie on the policy id rather than on the query", () => {
    const first = candidate({
      policyId: "policy-a" as Uuid,
      scope: "consumer",
      consumerId: CONSUMER,
    });
    const second = candidate({
      policyId: "policy-b" as Uuid,
      scope: "consumer",
      consumerId: CONSUMER,
    });

    expect(resolvePolicy(selector, [first, second]).policyId).toBe("policy-a");
    expect(resolvePolicy(selector, [second, first]).policyId).toBe("policy-a");
  });
});

describe("what the winner brings with it", () => {
  it("takes the winner's limits whole rather than filling gaps from below", () => {
    const resolved = resolvePolicy(selector, [globalPolicy, consumerCapabilityPolicy]);

    expect(resolved.limits.requestsPerWindow).toBe(40);
    expect(resolved.limits.maxPayloadBytes).toBeNull();
    expect(resolved.limits.timeoutMs).toBeNull();
  });

  it("names the policies it beat, narrowest first", () => {
    const resolved = resolvePolicy(selector, ALL);

    expect(resolved.supersededPolicyIds).toEqual([
      consumerPolicy.policyId,
      capabilityPolicy.policyId,
      globalPolicy.policyId,
    ]);
  });

  it("counts the contenders rather than everything it was handed", () => {
    const elsewhere = candidate({
      policyId: "policy-5" as Uuid,
      scope: "consumer",
      consumerId: OTHER_CONSUMER,
    });
    const withdrawn = { ...capabilityPolicy, active: false };

    const resolved = resolvePolicy(selector, [...ALL, elsewhere, withdrawn]);

    expect(resolved.consideredCount).toBe(4);
    expect(resolved.supersededPolicyIds).not.toContain(elsewhere.policyId);
  });

  it("counts a single uncontested policy as the one contender it was", () => {
    const resolved = resolvePolicy(selector, [globalPolicy]);
    expect(resolved.consideredCount).toBe(1);
    expect(resolved.supersededPolicyIds).toEqual([]);
  });
});

describe("when no policy applies", () => {
  it("limits nothing rather than refusing everything", () => {
    const resolved = resolvePolicy(selector, []);

    expect(resolved.policyId).toBeNull();
    expect(resolved.scope).toBeNull();
    expect(resolved.limits).toEqual(UNLIMITED);
    expect(resolved.consideredCount).toBe(0);
    expect(resolved.supersededPolicyIds).toEqual([]);
  });

  it("says the same when every candidate was about somebody else", () => {
    const elsewhere = candidate({
      policyId: "policy-5" as Uuid,
      scope: "consumer",
      consumerId: OTHER_CONSUMER,
    });

    expect(resolvePolicy(selector, [elsewhere]).limits).toEqual(UNLIMITED);
  });

  it("says the same when the only policy that matched was taken out of force", () => {
    const resolved = resolvePolicy(selector, [{ ...globalPolicy, active: false }]);

    expect(resolved.policyId).toBeNull();
    expect(resolved.limits).toEqual(UNLIMITED);
  });

  it("sets nothing at all, so no limit can be read off it by accident", () => {
    expect(UNLIMITED.requestsPerWindow).toBeNull();
    expect(UNLIMITED.window).toBeNull();
    expect(UNLIMITED.burstAllowance).toBeNull();
    expect(UNLIMITED.maxPayloadBytes).toBeNull();
    expect(UNLIMITED.timeoutMs).toBeNull();
  });
});

describe("immutability", () => {
  it("never reorders the candidate list it was handed", () => {
    const handed = [globalPolicy, consumerCapabilityPolicy, capabilityPolicy];
    const before = [...handed];

    resolvePolicy(selector, handed);

    expect(handed).toEqual(before);
  });
});
