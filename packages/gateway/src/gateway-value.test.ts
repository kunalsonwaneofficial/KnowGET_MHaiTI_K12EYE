import { describe, expect, it } from "vitest";
import {
  AUTH_SCHEMES,
  BACKOFF_BASE_SECONDS,
  BACKOFF_JITTER_RATIO,
  CIRCUIT_POSTURES,
  CONSUMER_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_STYLES,
  CREDENTIAL_PROVIDERS,
  DEFAULT_CONTRACT_STYLE,
  DEFAULT_DELIVERY_MODE,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
  ENDPOINT_HEALTHS,
  ENDPOINT_STATUSES,
  ENFORCEMENT_DECISIONS,
  ENFORCEMENT_REASONS,
  HTTP_METHODS,
  IDEMPOTENCY_RETENTION_SECONDS,
  IDEMPOTENCY_STATES,
  INITIAL_CONSUMER_STATUS,
  INITIAL_CONTRACT_STATUS,
  INITIAL_DELIVERY_OUTCOME,
  INITIAL_ENDPOINT_STATUS,
  INTEGRATION_PROTOCOLS,
  MAX_DELIVERY_ATTEMPTS,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MAX_KEY_LENGTH,
  MIN_DEPRECATION_NOTICE_DAYS,
  POLICY_SCOPES,
  QUOTA_WINDOWS,
  QUOTA_WINDOW_SECONDS,
  ROUTE_STATUSES,
  SUBSCRIPTION_STATUSES,
  isConsumerServable,
  isContractServable,
  isCount,
  isCredentialReference,
  isMutatingMethod,
  isPositiveCount,
  isReplayableOutcome,
  isSubscriptionSending,
  isTerminalConsumerStatus,
  isTerminalContractStatus,
  isTerminalDeliveryOutcome,
  isTerminalEndpointStatus,
  isTerminalRouteStatus,
  isTerminalSubscriptionStatus,
  isValidKey,
  normalizeKey,
  policySpecificity,
} from "./gateway-value";

describe("keys", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeKey("  Admissions.Application.Submit  ")).toBe("admissions.application.submit");
  });

  it("accepts dot, dash and underscore separated lowercase segments", () => {
    expect(isValidKey("admissions")).toBe(true);
    expect(isValidKey("admissions.application.submit")).toBe(true);
    expect(isValidKey("student-lifecycle_v2.read")).toBe(true);
    expect(isValidKey("v2")).toBe(true);
  });

  it("refuses empty, over-long, uppercase, separator-edged and doubly-separated keys", () => {
    expect(isValidKey("")).toBe(false);
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH + 1))).toBe(false);
    expect(isValidKey("Admissions")).toBe(false);
    expect(isValidKey(".admissions")).toBe(false);
    expect(isValidKey("admissions.")).toBe(false);
    expect(isValidKey("admissions..submit")).toBe(false);
    expect(isValidKey("admissions submit")).toBe(false);
    expect(isValidKey("admissions/submit")).toBe(false);
  });

  it("accepts a key of exactly the maximum length", () => {
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH))).toBe(true);
  });
});

describe("credential references", () => {
  it("accepts a handle from every provider the platform knows", () => {
    for (const provider of CREDENTIAL_PROVIDERS) {
      expect(isCredentialReference(`${provider}:integrations/acme-api-key`)).toBe(true);
    }
  });

  it("refuses a value with no recognised provider prefix", () => {
    expect(isCredentialReference("sk_live_51H8xQ2eZvKYlo2C")).toBe(false);
    expect(isCredentialReference("hashicorp:some-name")).toBe(false);
    expect(isCredentialReference("vault")).toBe(false);
  });

  it("refuses a handle with an empty provider or an empty name", () => {
    expect(isCredentialReference(":name")).toBe(false);
    expect(isCredentialReference("vault:")).toBe(false);
  });

  /**
   * The two shapes a pasted secret most often takes. Whitespace covers PEM blocks and copied blobs; the `://`
   * check covers a URL pasted into a credential field, which is either a secret in a query string or an
   * endpoint in the wrong column.
   */
  it("refuses anything carrying whitespace or a URL authority", () => {
    expect(isCredentialReference("vault:my name")).toBe(false);
    expect(isCredentialReference("vault:key\nmore")).toBe(false);
    expect(isCredentialReference("env:https://vault.example.org/key")).toBe(false);
    expect(isCredentialReference("https://vault.example.org/key")).toBe(false);
  });

  it("refuses an over-long handle", () => {
    expect(isCredentialReference(`vault:${"a".repeat(MAX_KEY_LENGTH)}`)).toBe(false);
  });
});

describe("consumer statuses", () => {
  it("starts registered and treats only retirement as an end", () => {
    expect(INITIAL_CONSUMER_STATUS).toBe("registered");
    expect(CONSUMER_STATUSES.filter(isTerminalConsumerStatus)).toEqual(["retired"]);
  });

  it("serves only an active consumer", () => {
    expect(CONSUMER_STATUSES.filter(isConsumerServable)).toEqual(["active"]);
  });

  it("offers four machine-to-machine authentication schemes and no interactive one", () => {
    expect(AUTH_SCHEMES).toHaveLength(4);
    expect(AUTH_SCHEMES).not.toContain("password");
    expect(AUTH_SCHEMES).not.toContain("authorization_code");
  });
});

describe("contract statuses", () => {
  it("starts as a draft and treats only sunset as an end", () => {
    expect(INITIAL_CONTRACT_STATUS).toBe("draft");
    expect(CONTRACT_STATUSES.filter(isTerminalContractStatus)).toEqual(["sunset"]);
  });

  /** A deprecated contract still answers — that is the entire difference between notice and removal. */
  it("serves published and deprecated contracts, and no others", () => {
    expect(CONTRACT_STATUSES.filter(isContractServable)).toEqual(["published", "deprecated"]);
  });

  it("defaults to REST and offers exactly three styles", () => {
    expect(DEFAULT_CONTRACT_STYLE).toBe("rest");
    expect(CONTRACT_STYLES).toEqual(["rest", "graphql", "grpc"]);
  });

  it("requires a quarter's notice before a sunset", () => {
    expect(MIN_DEPRECATION_NOTICE_DAYS).toBe(90);
  });
});

describe("routes", () => {
  it("publishes five methods and excludes the three that ask about infrastructure", () => {
    expect(HTTP_METHODS).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    for (const excluded of ["HEAD", "OPTIONS", "TRACE"]) {
      expect(HTTP_METHODS as readonly string[]).not.toContain(excluded);
    }
  });

  it("treats every method but GET as state-changing", () => {
    expect(HTTP_METHODS.filter(isMutatingMethod)).toEqual(["POST", "PUT", "PATCH", "DELETE"]);
  });

  it("treats only retirement as an end", () => {
    expect(ROUTE_STATUSES.filter(isTerminalRouteStatus)).toEqual(["retired"]);
  });
});

describe("traffic policy", () => {
  /**
   * The ordering is the resolution rule, so it is asserted rather than assumed. Every scope has a distinct
   * rank, which is what makes a tie between different scopes impossible.
   */
  it("ranks scopes from least to most specific with no ties", () => {
    const ranks = POLICY_SCOPES.map(policySpecificity);
    expect(ranks).toEqual([0, 1, 2, 3]);
    expect(new Set(ranks).size).toBe(POLICY_SCOPES.length);
  });

  it("puts consumer above capability, and both below the pair", () => {
    expect(policySpecificity("consumer")).toBeGreaterThan(policySpecificity("capability"));
    expect(policySpecificity("consumer_capability")).toBeGreaterThan(policySpecificity("consumer"));
    expect(policySpecificity("global")).toBe(0);
  });

  it("holds a fixed second count for every window, with a thirty-day month", () => {
    for (const window of QUOTA_WINDOWS) {
      expect(QUOTA_WINDOW_SECONDS[window]).toBeGreaterThan(0);
      expect(Number.isInteger(QUOTA_WINDOW_SECONDS[window])).toBe(true);
    }
    expect(QUOTA_WINDOW_SECONDS.month).toBe(30 * QUOTA_WINDOW_SECONDS.day);
  });

  it("separates throttling from denial", () => {
    expect(ENFORCEMENT_DECISIONS).toEqual(["allow", "throttle", "deny"]);
  });

  it("names every enforcement reason as a stable code rather than a sentence", () => {
    for (const reason of ENFORCEMENT_REASONS) {
      expect(reason).toMatch(/^[a-z][a-z_]*$/);
    }
    expect(new Set(ENFORCEMENT_REASONS).size).toBe(ENFORCEMENT_REASONS.length);
  });
});

describe("integration endpoints", () => {
  it("names transports and never vendors", () => {
    for (const protocol of INTEGRATION_PROTOCOLS) {
      expect(protocol).toMatch(/^[a-z]+$/);
    }
    for (const vendor of ["stripe", "sendgrid", "twilio", "sap"]) {
      expect(INTEGRATION_PROTOCOLS as readonly string[]).not.toContain(vendor);
    }
  });

  it("starts registered and treats only retirement as an end", () => {
    expect(INITIAL_ENDPOINT_STATUS).toBe("registered");
    expect(ENDPOINT_STATUSES.filter(isTerminalEndpointStatus)).toEqual(["retired"]);
  });

  it("has a quarantine state between active and disabled", () => {
    expect(ENDPOINT_STATUSES).toContain("quarantined");
  });

  it("describes health as observation, starting from not knowing", () => {
    expect(ENDPOINT_HEALTHS[0]).toBe("unknown");
    expect(CIRCUIT_POSTURES).toEqual(["closed", "open", "half_open"]);
  });
});

describe("webhook delivery", () => {
  /** Exactly-once needs the receiver's participation; a sender cannot offer it, so the union does not. */
  it("offers two delivery guarantees and not the one it cannot keep", () => {
    expect(DELIVERY_MODES).toEqual(["at_least_once", "at_most_once"]);
    expect(DEFAULT_DELIVERY_MODE).toBe("at_least_once");
  });

  it("keeps the consumer's pause apart from the platform's suspension", () => {
    expect(SUBSCRIPTION_STATUSES).toContain("paused");
    expect(SUBSCRIPTION_STATUSES).toContain("suspended");
    expect(SUBSCRIPTION_STATUSES.filter(isTerminalSubscriptionStatus)).toEqual(["revoked"]);
    expect(SUBSCRIPTION_STATUSES.filter(isSubscriptionSending)).toEqual(["active"]);
  });

  it("starts a delivery pending and treats three outcomes as ends", () => {
    expect(INITIAL_DELIVERY_OUTCOME).toBe("pending");
    expect(DELIVERY_OUTCOMES.filter(isTerminalDeliveryOutcome)).toEqual([
      "delivered",
      "dead_lettered",
      "abandoned",
    ]);
  });

  /** Replaying an abandoned delivery would send an event the institution decided not to send. */
  it("replays dead-lettered deliveries only", () => {
    expect(DELIVERY_OUTCOMES.filter(isReplayableOutcome)).toEqual(["dead_lettered"]);
  });

  it("schedules six non-decreasing attempts spanning between one and three hours", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(6);
    expect(BACKOFF_BASE_SECONDS).toHaveLength(MAX_DELIVERY_ATTEMPTS);
    for (let i = 1; i < BACKOFF_BASE_SECONDS.length; i += 1) {
      expect(BACKOFF_BASE_SECONDS[i]).toBeGreaterThanOrEqual(BACKOFF_BASE_SECONDS[i - 1] as number);
    }
    const total = BACKOFF_BASE_SECONDS.reduce((sum, seconds) => sum + seconds, 0);
    expect(total).toBeGreaterThan(3_600);
    expect(total).toBeLessThan(3 * 3_600);
  });

  it("keeps jitter to a fifth of the interval", () => {
    expect(BACKOFF_JITTER_RATIO).toBeGreaterThan(0);
    expect(BACKOFF_JITTER_RATIO).toBeLessThan(0.5);
  });
});

describe("idempotency", () => {
  it("names a conflicted state distinct from a completed one", () => {
    expect(IDEMPOTENCY_STATES).toEqual(["in_flight", "completed", "conflicted"]);
  });

  it("honours a key for a day and accepts a longer key than an internal one", () => {
    expect(IDEMPOTENCY_RETENTION_SECONDS).toBe(QUOTA_WINDOW_SECONDS.day);
    expect(MAX_IDEMPOTENCY_KEY_LENGTH).toBeGreaterThan(MAX_KEY_LENGTH);
  });
});

describe("numeric guards", () => {
  it("accepts whole non-negative counts and refuses fractions and negatives", () => {
    expect(isCount(0)).toBe(true);
    expect(isCount(7)).toBe(true);
    expect(isCount(-1)).toBe(false);
    expect(isCount(1.5)).toBe(false);
    expect(isCount(Number.NaN)).toBe(false);
    expect(isCount(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("refuses zero where a limit would be meaningless", () => {
    expect(isPositiveCount(0)).toBe(false);
    expect(isPositiveCount(1)).toBe(true);
    expect(isPositiveCount(-3)).toBe(false);
  });
});
