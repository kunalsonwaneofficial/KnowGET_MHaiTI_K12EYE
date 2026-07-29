import { describe, expect, it } from "vitest";
import type { ISODateString } from "@knowget/types";
import { admitRequest } from "./admission";
import { InvalidPayloadSizeError } from "./errors";
import type { AdmissionRequest, PolicyLimits, QuotaVerdict, ServingVerdict } from "./gateway-view";

const SCOPE = "admissions.application.submit";
const WINDOW_START = "2026-07-17T10:00:00.000Z" as ISODateString;
const WINDOW_RESET = "2026-07-17T10:01:00.000Z" as ISODateString;

const serving = (overrides: Partial<ServingVerdict> = {}): ServingVerdict => ({
  served: true,
  deprecated: false,
  daysUntilSunset: null,
  reason: "within_limits",
  ...overrides,
});

const quota = (overrides: Partial<QuotaVerdict> = {}): QuotaVerdict => ({
  decision: "allow",
  reason: "within_limits",
  remaining: 99,
  windowResetsAt: WINDOW_RESET,
  currentWindowStartedAt: WINDOW_START,
  retryAfterSeconds: null,
  windowExpired: false,
  ...overrides,
});

const limits = (overrides: Partial<PolicyLimits> = {}): PolicyLimits => ({
  requestsPerWindow: 100,
  window: "minute",
  burstAllowance: null,
  maxPayloadBytes: null,
  timeoutMs: null,
  ...overrides,
});

const request = (overrides: Partial<AdmissionRequest> = {}): AdmissionRequest => ({
  consumerActive: true,
  grantedScopes: [SCOPE],
  routeStatus: "active",
  requiredScope: SCOPE,
  serving: serving(),
  quota: quota(),
  payloadBytes: null,
  limits: limits(),
  ...overrides,
});

describe("a call with nothing wrong with it", () => {
  it("is admitted, and says so in the same terms the quota engine did", () => {
    const verdict = admitRequest(request());

    expect(verdict.decision).toBe("allow");
    expect(verdict.reason).toBe("within_limits");
    expect(verdict.deprecated).toBe(false);
    expect(verdict.retryAfterSeconds).toBeNull();
  });

  it("hands back a verdict nothing downstream can edit", () => {
    expect(Object.isFrozen(admitRequest(request()))).toBe(true);
    expect(Object.isFrozen(admitRequest(request({ consumerActive: false })))).toBe(true);
    expect(Object.isFrozen(admitRequest(request({ quota: quota({ decision: "throttle" }) })))).toBe(
      true,
    );
  });
});

describe("sizes that are not sizes", () => {
  it("refuses a body size no transport should ever have reported", () => {
    expect(() => admitRequest(request({ payloadBytes: -400 }))).toThrow(InvalidPayloadSizeError);
    expect(() => admitRequest(request({ payloadBytes: 2.5 }))).toThrow(InvalidPayloadSizeError);
    expect(() => admitRequest(request({ payloadBytes: Number.NaN }))).toThrow(
      InvalidPayloadSizeError,
    );
  });

  it("keeps the defect off the consumer's screen", () => {
    try {
      admitRequest(request({ payloadBytes: -1 }));
      expect.unreachable("a negative body size should not have been admitted");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPayloadSizeError);
      expect((error as InvalidPayloadSizeError).isOperational).toBe(false);
    }
  });

  it("raises before any refusal could have hidden it", () => {
    expect(() => admitRequest(request({ consumerActive: false, payloadBytes: -1 }))).toThrow(
      InvalidPayloadSizeError,
    );
  });

  it("treats an absent body as an absent body rather than a size of nothing", () => {
    const verdict = admitRequest(
      request({ payloadBytes: null, limits: limits({ maxPayloadBytes: 0 }) }),
    );

    expect(verdict.decision).toBe("allow");
  });
});

describe("who you are, and whether you may", () => {
  it("tells a suspended consumer they are suspended rather than that they are over quota", () => {
    const verdict = admitRequest(
      request({
        consumerActive: false,
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          retryAfterSeconds: 30,
        }),
      }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("consumer_not_active");
  });

  it("refuses a consumer holding other scopes but not this one", () => {
    const verdict = admitRequest(
      request({ grantedScopes: ["students.record.read", "fees.invoice.read"] }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("scope_not_granted");
  });

  it("refuses a consumer holding no scopes at all", () => {
    expect(admitRequest(request({ grantedScopes: [] })).reason).toBe("scope_not_granted");
  });

  it("matches the required scope on its normalized form", () => {
    const verdict = admitRequest(request({ requiredScope: "  Admissions.Application.SUBMIT " }));

    expect(verdict.decision).toBe("allow");
  });

  it("settles authorisation before existence, so refusals do not enumerate the platform", () => {
    const withoutScope = { grantedScopes: [] as readonly string[] };

    expect(admitRequest(request({ ...withoutScope, routeStatus: "active" })).reason).toBe(
      "scope_not_granted",
    );
    expect(admitRequest(request({ ...withoutScope, routeStatus: "draft" })).reason).toBe(
      "scope_not_granted",
    );
    expect(admitRequest(request({ ...withoutScope, routeStatus: "retired" })).reason).toBe(
      "scope_not_granted",
    );
  });

  it("gives the same answer whether or not the contract behind the route still serves", () => {
    const verdict = admitRequest(
      request({
        grantedScopes: [],
        serving: serving({ served: false, reason: "contract_sunset" }),
      }),
    );

    expect(verdict.reason).toBe("scope_not_granted");
  });
});

describe("whether the thing is served", () => {
  it("refuses a route that has not been turned on yet", () => {
    const verdict = admitRequest(request({ routeStatus: "draft" }));

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("route_not_active");
  });

  it("refuses a route that has been retired", () => {
    expect(admitRequest(request({ routeStatus: "retired" })).reason).toBe("route_not_active");
  });

  it("passes a serving refusal through in the words the lifecycle engine used", () => {
    const notServable = admitRequest(
      request({ serving: serving({ served: false, reason: "contract_not_servable" }) }),
    );
    const sunset = admitRequest(
      request({ serving: serving({ served: false, reason: "contract_sunset" }) }),
    );
    const unknown = admitRequest(
      request({ serving: serving({ served: false, reason: "version_unknown" }) }),
    );

    expect(notServable.reason).toBe("contract_not_servable");
    expect(sunset.reason).toBe("contract_sunset");
    expect(unknown.reason).toBe("version_unknown");
  });

  it("names the route before the contract, because the route is the thing that was addressed", () => {
    const verdict = admitRequest(
      request({
        routeStatus: "retired",
        serving: serving({ served: false, reason: "contract_sunset" }),
      }),
    );

    expect(verdict.reason).toBe("route_not_active");
  });
});

describe("how big it is", () => {
  it("refuses a body over the ceiling the applicable policy set", () => {
    const verdict = admitRequest(
      request({ payloadBytes: 2_048, limits: limits({ maxPayloadBytes: 1_024 }) }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("payload_too_large");
  });

  it("serves a body sitting exactly on the ceiling", () => {
    const verdict = admitRequest(
      request({ payloadBytes: 1_024, limits: limits({ maxPayloadBytes: 1_024 }) }),
    );

    expect(verdict.decision).toBe("allow");
  });

  it("leaves an unset ceiling unenforced, however large the body is", () => {
    const verdict = admitRequest(
      request({ payloadBytes: 64_000_000, limits: limits({ maxPayloadBytes: null }) }),
    );

    expect(verdict.decision).toBe("allow");
  });

  it("counts an empty body as a body", () => {
    const verdict = admitRequest(
      request({ payloadBytes: 0, limits: limits({ maxPayloadBytes: 1_024 }) }),
    );

    expect(verdict.decision).toBe("allow");
  });

  it("checks the size before the allowance, so a doomed request does not spend one", () => {
    const verdict = admitRequest(
      request({
        payloadBytes: 4_096,
        limits: limits({ maxPayloadBytes: 1_024 }),
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          retryAfterSeconds: 30,
        }),
      }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("payload_too_large");
  });

  it("checks whether the thing is served before it measures what was sent to it", () => {
    const verdict = admitRequest(
      request({
        payloadBytes: 4_096,
        limits: limits({ maxPayloadBytes: 1_024 }),
        serving: serving({ served: false, reason: "contract_not_servable" }),
      }),
    );

    expect(verdict.reason).toBe("contract_not_servable");
  });
});

describe("how fast you are going", () => {
  it("carries a throttle through with the interval the quota engine computed", () => {
    const verdict = admitRequest(
      request({
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          remaining: 0,
          retryAfterSeconds: 30,
        }),
      }),
    );

    expect(verdict.decision).toBe("throttle");
    expect(verdict.reason).toBe("rate_limit_exceeded");
    expect(verdict.retryAfterSeconds).toBe(30);
  });

  it("carries an exhausted allowance through as the denial the quota engine made it", () => {
    const verdict = admitRequest(
      request({
        quota: quota({
          decision: "deny",
          reason: "quota_exhausted",
          remaining: 0,
          retryAfterSeconds: 900,
        }),
      }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("quota_exhausted");
    expect(verdict.retryAfterSeconds).toBe(900);
  });

  it("does not invent a retry interval the quota engine declined to give", () => {
    const verdict = admitRequest(
      request({
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          retryAfterSeconds: null,
        }),
      }),
    );

    expect(verdict.decision).toBe("throttle");
    expect(verdict.retryAfterSeconds).toBeNull();
  });

  it("serves an unmetered consumer without any of the numbers a metered one carries", () => {
    const verdict = admitRequest(
      request({
        quota: quota({ remaining: null, windowResetsAt: null, currentWindowStartedAt: null }),
        limits: limits({ requestsPerWindow: null, window: null }),
      }),
    );

    expect(verdict.decision).toBe("allow");
    expect(verdict.retryAfterSeconds).toBeNull();
  });
});

describe("what a refusal tells the caller", () => {
  it("sends no retry interval with a denial, however long the quota engine would have waited", () => {
    const verdict = admitRequest(
      request({
        routeStatus: "retired",
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          retryAfterSeconds: 30,
        }),
      }),
    );

    expect(verdict.reason).toBe("route_not_active");
    expect(verdict.retryAfterSeconds).toBeNull();
  });

  it("reports a deprecation on a call it admits", () => {
    const verdict = admitRequest(
      request({ serving: serving({ deprecated: true, daysUntilSunset: 42 }) }),
    );

    expect(verdict.decision).toBe("allow");
    expect(verdict.deprecated).toBe(true);
  });

  it("reports a deprecation on a call it throttles", () => {
    const verdict = admitRequest(
      request({
        serving: serving({ deprecated: true, daysUntilSunset: 42 }),
        quota: quota({
          decision: "throttle",
          reason: "rate_limit_exceeded",
          retryAfterSeconds: 30,
        }),
      }),
    );

    expect(verdict.decision).toBe("throttle");
    expect(verdict.deprecated).toBe(true);
  });

  it("reports a deprecation on a call it refuses outright", () => {
    const verdict = admitRequest(
      request({
        consumerActive: false,
        serving: serving({ deprecated: true, daysUntilSunset: 42 }),
      }),
    );

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toBe("consumer_not_active");
    expect(verdict.deprecated).toBe(true);
  });

  it("decides the same call the same way every time it is asked", () => {
    const call = request({
      grantedScopes: [],
      serving: serving({ deprecated: true, daysUntilSunset: 7 }),
    });

    expect(admitRequest(call)).toStrictEqual(admitRequest(call));
  });
});
