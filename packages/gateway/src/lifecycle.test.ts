import { describe, expect, it } from "vitest";
import type { ISODateString } from "@knowget/types";
import {
  CONSUMER_STATUSES,
  CONTRACT_STATUSES,
  ENDPOINT_STATUSES,
  MIN_DEPRECATION_NOTICE_DAYS,
  ROUTE_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./gateway-value";
import {
  inspectConsumerTransition,
  inspectContractTransition,
  inspectDeprecation,
  inspectEndpointTransition,
  inspectRouteTransition,
  inspectServing,
  inspectSubscriptionTransition,
} from "./lifecycle";

const iso = (value: string): ISODateString => value as ISODateString;

const JAN = iso("2026-01-01T00:00:00.000Z");
const FEB = iso("2026-02-01T00:00:00.000Z");
const JUN = iso("2026-06-01T00:00:00.000Z");
const DEC = iso("2026-12-01T00:00:00.000Z");

describe("consumer progression", () => {
  it("permits activation from registration and from suspension", () => {
    expect(inspectConsumerTransition("registered", "active").allowed).toBe(true);
    expect(inspectConsumerTransition("suspended", "active").allowed).toBe(true);
  });

  it("permits suspension only from active", () => {
    expect(inspectConsumerTransition("active", "suspended").allowed).toBe(true);
    expect(inspectConsumerTransition("registered", "suspended").refusal).toBe("not_permitted");
  });

  it("permits retirement from every non-terminal status", () => {
    for (const status of CONSUMER_STATUSES) {
      if (status === "retired") continue;
      expect(inspectConsumerTransition(status, "retired").allowed).toBe(true);
    }
  });

  it("lets nothing out of retirement", () => {
    for (const status of CONSUMER_STATUSES) {
      if (status === "retired") continue;
      expect(inspectConsumerTransition("retired", status).refusal).toBe("terminal_status");
    }
  });

  it("reports a move to the current status as a resubmission rather than a lifecycle error", () => {
    for (const status of CONSUMER_STATUSES) {
      expect(inspectConsumerTransition(status, status).refusal).toBe("same_status");
    }
  });

  it("names no refusal when the move is allowed", () => {
    expect(inspectConsumerTransition("registered", "active").refusal).toBeNull();
  });
});

describe("contract progression", () => {
  it("publishes a draft and withdraws one to sunset", () => {
    expect(inspectContractTransition("draft", "published").allowed).toBe(true);
    expect(inspectContractTransition("draft", "sunset").allowed).toBe(true);
  });

  it("refuses to deprecate anything that was never published", () => {
    expect(inspectContractTransition("draft", "deprecated").refusal).toBe("not_permitted");
  });

  it("refuses to sunset a published version without deprecating it first", () => {
    expect(inspectContractTransition("published", "sunset").refusal).toBe("not_permitted");
    expect(inspectContractTransition("published", "deprecated").allowed).toBe(true);
  });

  it("offers no way back from deprecation to publication", () => {
    expect(inspectContractTransition("deprecated", "published").refusal).toBe("not_permitted");
  });

  it("lets nothing out of sunset", () => {
    for (const status of CONTRACT_STATUSES) {
      if (status === "sunset") continue;
      expect(inspectContractTransition("sunset", status).refusal).toBe("terminal_status");
    }
  });

  it("never lets a draft skip straight to being on notice", () => {
    expect(inspectContractTransition("draft", "deprecated").allowed).toBe(false);
  });
});

describe("route progression", () => {
  it("activates a draft and retires one that never went live", () => {
    expect(inspectRouteTransition("draft", "active").allowed).toBe(true);
    expect(inspectRouteTransition("draft", "retired").allowed).toBe(true);
  });

  it("offers no way back to a draft once the path is in other people's code", () => {
    expect(inspectRouteTransition("active", "draft").refusal).toBe("not_permitted");
  });

  it("has no state between active and retired, because that state would be an outage", () => {
    expect(inspectRouteTransition("active", "retired").allowed).toBe(true);
    for (const status of ROUTE_STATUSES) {
      if (status === "retired") continue;
      expect(inspectRouteTransition("retired", status).refusal).toBe("terminal_status");
    }
  });
});

describe("endpoint progression", () => {
  it("puts an endpoint into service from registration and brings it back from either absence", () => {
    expect(inspectEndpointTransition("registered", "active").allowed).toBe(true);
    expect(inspectEndpointTransition("quarantined", "active").allowed).toBe(true);
    expect(inspectEndpointTransition("disabled", "active").allowed).toBe(true);
  });

  it("draws its own conclusion only about traffic it actually sent", () => {
    expect(inspectEndpointTransition("active", "quarantined").allowed).toBe(true);
    expect(inspectEndpointTransition("disabled", "quarantined").refusal).toBe("not_permitted");
    expect(inspectEndpointTransition("registered", "quarantined").refusal).toBe("not_permitted");
  });

  it("lets an operator switch off an endpoint from wherever it is", () => {
    for (const status of ENDPOINT_STATUSES) {
      if (status === "disabled" || status === "retired") continue;
      expect(inspectEndpointTransition(status, "disabled").allowed).toBe(true);
    }
  });

  it("ends the integration for good, from every status it could be in", () => {
    for (const status of ENDPOINT_STATUSES) {
      if (status === "retired") continue;
      expect(inspectEndpointTransition(status, "retired").allowed).toBe(true);
      expect(inspectEndpointTransition("retired", status).refusal).toBe("terminal_status");
    }
  });

  it("treats a repeated request as a resubmission rather than as a bad move", () => {
    expect(inspectEndpointTransition("disabled", "disabled").refusal).toBe("same_status");
  });
});

describe("subscription progression", () => {
  it("stops sending for either reason, but only from where sending was happening", () => {
    expect(inspectSubscriptionTransition("active", "paused").allowed).toBe(true);
    expect(inspectSubscriptionTransition("active", "suspended").allowed).toBe(true);
  });

  it("keeps the consumer's pause and the platform's suspension out of each other's way", () => {
    expect(inspectSubscriptionTransition("paused", "suspended").refusal).toBe("not_permitted");
    expect(inspectSubscriptionTransition("suspended", "paused").refusal).toBe("not_permitted");
  });

  it("brings a subscription back from either absence", () => {
    expect(inspectSubscriptionTransition("paused", "active").allowed).toBe(true);
    expect(inspectSubscriptionTransition("suspended", "active").allowed).toBe(true);
  });

  it("lets a consumer end a subscription from wherever it is", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      if (status === "revoked") continue;
      expect(inspectSubscriptionTransition(status, "revoked").allowed).toBe(true);
      expect(inspectSubscriptionTransition("revoked", status).refusal).toBe("terminal_status");
    }
  });

  it("treats a repeated request as a resubmission rather than as a bad move", () => {
    expect(inspectSubscriptionTransition("paused", "paused").refusal).toBe("same_status");
  });
});

describe("serving", () => {
  it("does not serve a draft, and says why", () => {
    const verdict = inspectServing({
      status: "draft",
      deprecatedAt: null,
      sunsetAt: null,
      asOf: JUN,
    });
    expect(verdict.served).toBe(false);
    expect(verdict.reason).toBe("contract_not_servable");
    expect(verdict.daysUntilSunset).toBeNull();
  });

  it("serves a published version with no sunset in sight", () => {
    const verdict = inspectServing({
      status: "published",
      deprecatedAt: null,
      sunsetAt: null,
      asOf: JUN,
    });
    expect(verdict).toEqual({
      served: true,
      deprecated: false,
      daysUntilSunset: null,
      reason: "within_limits",
    });
  });

  it("serves a deprecated version and counts the whole days remaining", () => {
    const verdict = inspectServing({
      status: "deprecated",
      deprecatedAt: JAN,
      sunsetAt: DEC,
      asOf: JUN,
    });
    expect(verdict.served).toBe(true);
    expect(verdict.deprecated).toBe(true);
    expect(verdict.daysUntilSunset).toBe(183);
    expect(verdict.reason).toBe("within_limits");
  });

  it("reports an instant before the announcement as it was reported then", () => {
    const verdict = inspectServing({
      status: "deprecated",
      deprecatedAt: JUN,
      sunsetAt: DEC,
      asOf: FEB,
    });
    expect(verdict.served).toBe(true);
    expect(verdict.deprecated).toBe(false);
    expect(verdict.daysUntilSunset).toBeNull();
  });

  it("stops serving once the sunset instant arrives, to the millisecond", () => {
    const request = { status: "deprecated", deprecatedAt: JAN, sunsetAt: DEC } as const;
    expect(inspectServing({ ...request, asOf: DEC }).served).toBe(false);
    expect(inspectServing({ ...request, asOf: DEC }).reason).toBe("contract_sunset");
    expect(inspectServing({ ...request, asOf: iso("2026-11-30T23:59:59.999Z") }).served).toBe(true);
  });

  it("never counts down past zero", () => {
    const verdict = inspectServing({
      status: "deprecated",
      deprecatedAt: JAN,
      sunsetAt: FEB,
      asOf: DEC,
    });
    expect(verdict.daysUntilSunset).toBe(0);
  });

  it("serves a deprecation with no date attached, because notice without a date is still notice", () => {
    const verdict = inspectServing({
      status: "deprecated",
      deprecatedAt: JAN,
      sunsetAt: null,
      asOf: JUN,
    });
    expect(verdict.served).toBe(true);
    expect(verdict.deprecated).toBe(true);
    expect(verdict.daysUntilSunset).toBeNull();
  });

  it("refuses a sunset version outright", () => {
    const verdict = inspectServing({
      status: "sunset",
      deprecatedAt: JAN,
      sunsetAt: FEB,
      asOf: JUN,
    });
    expect(verdict.served).toBe(false);
    expect(verdict.reason).toBe("contract_sunset");
  });
});

describe("deprecation", () => {
  it("allows a sunset announced with more than the minimum notice", () => {
    const verdict = inspectDeprecation({ status: "published", announcedAt: JAN, sunsetAt: DEC });
    expect(verdict.allowed).toBe(true);
    expect(verdict.noticeDays).toBe(334);
    expect(verdict.refusal).toBeNull();
  });

  it("allows a sunset announced with exactly the minimum notice", () => {
    const sunsetAt = iso(
      new Date(Date.parse(JAN) + MIN_DEPRECATION_NOTICE_DAYS * 86_400_000).toISOString(),
    );
    const verdict = inspectDeprecation({ status: "published", announcedAt: JAN, sunsetAt });
    expect(verdict.allowed).toBe(true);
    expect(verdict.noticeDays).toBe(MIN_DEPRECATION_NOTICE_DAYS);
  });

  it("refuses a sunset one day short of the floor and reports the shortfall", () => {
    const sunsetAt = iso(
      new Date(Date.parse(JAN) + (MIN_DEPRECATION_NOTICE_DAYS - 1) * 86_400_000).toISOString(),
    );
    const verdict = inspectDeprecation({ status: "published", announcedAt: JAN, sunsetAt });
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("notice_too_short");
    expect(verdict.noticeDays).toBe(MIN_DEPRECATION_NOTICE_DAYS - 1);
  });

  it("distinguishes transposed dates from a short notice period", () => {
    const verdict = inspectDeprecation({ status: "published", announcedAt: DEC, sunsetAt: JAN });
    expect(verdict.refusal).toBe("sunset_before_announcement");
  });

  it("settles the status before it reads the dates", () => {
    const verdict = inspectDeprecation({ status: "draft", announcedAt: JAN, sunsetAt: JAN });
    expect(verdict.refusal).toBe("contract_not_published");
  });

  it("refuses to deprecate a version that is already deprecated or sunset", () => {
    expect(
      inspectDeprecation({ status: "deprecated", announcedAt: JAN, sunsetAt: DEC }).refusal,
    ).toBe("contract_not_published");
    expect(inspectDeprecation({ status: "sunset", announcedAt: JAN, sunsetAt: DEC }).refusal).toBe(
      "contract_not_published",
    );
  });
});
