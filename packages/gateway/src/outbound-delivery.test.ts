import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DeliveryAttemptsExhaustedError,
  DeliveryNotReplayableError,
  DeliverySettledError,
  EmptyGatewayKeyError,
  InvalidGatewayKeyError,
} from "./errors";
import { MAX_DELIVERY_ATTEMPTS } from "./gateway-value";
import {
  type DeliveryFailure,
  type OutboundDelivery,
  type ScheduleOutboundDeliveryParams,
  abandonOutboundDelivery,
  isOutboundDeliveryDue,
  isOutboundDeliverySettled,
  recordDeliveryFailure,
  recordDeliverySuccess,
  replayOutboundDelivery,
  requireAttemptableDelivery,
  scheduleOutboundDelivery,
  toDeliveryView,
} from "./outbound-delivery";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const SUBSCRIPTION = "subscription1" as Uuid;
const ENDPOINT = "endpoint1" as Uuid;
const OTHER_ENDPOINT = "endpoint2" as Uuid;
const EVENT = "event1" as Uuid;
const FINGERPRINT = "sha256:9f2c1b903a444e219c778a1d6e0b42f3";
const AT = "2026-07-17T10:00:00.000Z" as ISODateString;
const MUCH_LATER = "2026-07-18T10:00:00.000Z" as ISODateString;

/** Instants are derived from a record's own stamps, so no assertion here depends on the wall clock. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const params = (
  overrides: Partial<ScheduleOutboundDeliveryParams> = {},
): ScheduleOutboundDeliveryParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  endpointId: ENDPOINT,
  eventType: "admissions.application.submitted",
  eventId: EVENT,
  payloadFingerprint: FINGERPRINT,
  deliveryMode: "at_least_once",
  ...overrides,
});

const scheduled = (overrides: Partial<ScheduleOutboundDeliveryParams> = {}): OutboundDelivery =>
  scheduleOutboundDelivery(params(overrides));

const failure = (overrides: Partial<DeliveryFailure> = {}): DeliveryFailure => ({
  statusCode: 502,
  error: "Bad Gateway",
  ...overrides,
});

const failedTimes = (
  count: number,
  overrides: Partial<ScheduleOutboundDeliveryParams> = {},
): OutboundDelivery => {
  let delivery = scheduled(overrides);
  for (let index = 0; index < count; index += 1) {
    delivery = recordDeliveryFailure(delivery, failure(), AT);
  }
  return delivery;
};

const deadLettered = (): OutboundDelivery => failedTimes(MAX_DELIVERY_ATTEMPTS);

describe("queueing an event for one subscriber", () => {
  it("is due at once, with nothing tried and nothing to explain yet", () => {
    const delivery = scheduled();

    expect(delivery.outcome).toBe("pending");
    expect(delivery.attempts).toBe(0);
    expect(delivery.nextAttemptAt).toBe(delivery.createdAt);
    expect(delivery.lastAttemptedAt).toBeNull();
    expect(delivery.lastStatusCode).toBeNull();
    expect(delivery.lastError).toBeNull();
    expect(delivery.replayOfDeliveryId).toBeNull();
  });

  it("keeps the digest and never the body", () => {
    const delivery = scheduled();

    expect(delivery.payloadFingerprint).toBe(FINGERPRINT);
    expect(Object.keys(delivery)).not.toContain("payload");
  });

  it("snapshots the guarantee in force when it was scheduled", () => {
    expect(scheduled().deliveryMode).toBe("at_least_once");
    expect(scheduled({ deliveryMode: "at_most_once" }).deliveryMode).toBe("at_most_once");
  });

  it("gives each delivery its own identity, so five subscribers are five rows", () => {
    expect(scheduled().id).not.toBe(scheduled().id);
  });

  it("normalises the event type and refuses one it cannot read", () => {
    expect(scheduled({ eventType: "  Student.Enrolled  " }).eventType).toBe("student.enrolled");
    expect(() => scheduled({ eventType: "   " })).toThrow(EmptyGatewayKeyError);
    expect(() => scheduled({ eventType: "student enrolled" })).toThrow(InvalidGatewayKeyError);
  });

  it("refuses a blank digest without asserting what shape a digest takes", () => {
    expect(() => scheduled({ payloadFingerprint: "  " })).toThrow(EmptyGatewayKeyError);
    expect(scheduled({ payloadFingerprint: "  blake3/abc  " }).payloadFingerprint).toBe(
      "blake3/abc",
    );
  });
});

describe("what the dispatcher checks before it sends", () => {
  it("attempts a delivery that is still open", () => {
    expect(() => requireAttemptableDelivery(scheduled())).not.toThrow();
    expect(() => requireAttemptableDelivery(failedTimes(1))).not.toThrow();
  });

  it("refuses a delivery that has already reached an end", () => {
    expect(() => requireAttemptableDelivery(deadLettered())).toThrow(DeliverySettledError);
    expect(() => requireAttemptableDelivery(recordDeliverySuccess(scheduled(), 200, AT))).toThrow(
      DeliverySettledError,
    );
  });

  it("closes the window where a lost dead-lettering race would buy a seventh attempt", () => {
    const stale: OutboundDelivery = { ...failedTimes(1), attempts: MAX_DELIVERY_ATTEMPTS };

    expect(() => requireAttemptableDelivery(stale)).toThrow(DeliveryAttemptsExhaustedError);
  });
});

describe("an attempt the receiver accepted", () => {
  it("settles the delivery and stops scheduling it", () => {
    const delivered = recordDeliverySuccess(scheduled(), 200, AT);

    expect(delivered.outcome).toBe("delivered");
    expect(delivered.attempts).toBe(1);
    expect(delivered.deliveredAt).toBe(AT);
    expect(delivered.lastAttemptedAt).toBe(AT);
    expect(delivered.nextAttemptAt).toBeNull();
    expect(isOutboundDeliverySettled(delivered)).toBe(true);
  });

  it("clears the message from the attempt before, which was not this attempt's news", () => {
    const delivered = recordDeliverySuccess(failedTimes(2), 202, AT);

    expect(delivered.lastError).toBeNull();
    expect(delivered.lastStatusCode).toBe(202);
    expect(delivered.attempts).toBe(3);
  });

  it("will not record a second ending", () => {
    expect(() =>
      recordDeliverySuccess(recordDeliverySuccess(scheduled(), 200, AT), 200, AT),
    ).toThrow(DeliverySettledError);
  });
});

describe("an attempt that failed", () => {
  it("schedules the next one and says what came back", () => {
    const failed = failedTimes(1);

    expect(failed.outcome).toBe("failed");
    expect(failed.attempts).toBe(1);
    expect(failed.lastStatusCode).toBe(502);
    expect(failed.lastError).toBe("Bad Gateway");
    expect(failed.nextAttemptAt).not.toBeNull();
    expect(Date.parse(failed.nextAttemptAt as string)).toBeGreaterThan(Date.parse(AT));
  });

  it("records a transport failure that never got an answer", () => {
    const failed = recordDeliveryFailure(
      scheduled(),
      { statusCode: null, error: "ECONNREFUSED" },
      AT,
    );

    expect(failed.lastStatusCode).toBeNull();
    expect(failed.lastError).toBe("ECONNREFUSED");
  });

  it("keeps a nonsense status code out of the column rather than losing the failure", () => {
    const failed = recordDeliveryFailure(scheduled(), failure({ statusCode: 99_999 }), AT);
    const fractional = recordDeliveryFailure(scheduled(), failure({ statusCode: 2.5 }), AT);

    expect(failed.lastStatusCode).toBeNull();
    expect(failed.outcome).toBe("failed");
    expect(fractional.lastStatusCode).toBeNull();
  });

  it("truncates an enormous error page rather than refusing to record the failure", () => {
    const failed = recordDeliveryFailure(scheduled(), failure({ error: "x".repeat(5_000) }), AT);

    expect(failed.lastError).toHaveLength(1_000);
  });

  it("holds nothing where the adapter had nothing to say", () => {
    expect(recordDeliveryFailure(scheduled(), failure({ error: "   " }), AT).lastError).toBeNull();
  });

  it("plans from its own attempt count rather than from a number handed in", () => {
    const first = failedTimes(1).nextAttemptAt;
    const second = failedTimes(2).nextAttemptAt;

    expect(Date.parse(second as string)).toBeGreaterThan(Date.parse(first as string));
  });
});

describe("running out of attempts", () => {
  it("dead-letters once the allowance is spent, and keeps the delivery for replay", () => {
    const delivery = deadLettered();

    expect(delivery.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(delivery.outcome).toBe("dead_lettered");
    expect(delivery.deadLetteredAt).toBe(AT);
    expect(delivery.nextAttemptAt).toBeNull();
  });

  it("keeps retrying right up to the last permitted attempt", () => {
    expect(failedTimes(MAX_DELIVERY_ATTEMPTS - 1).outcome).toBe("failed");
  });

  it("will not accept a further attempt against a dead-lettered delivery", () => {
    expect(() => recordDeliveryFailure(deadLettered(), failure(), AT)).toThrow(
      DeliverySettledError,
    );
  });
});

describe("a subscriber who asked for at most one attempt", () => {
  it("dead-letters on the first failure, because the platform promised not to retry", () => {
    const delivery = recordDeliveryFailure(
      scheduled({ deliveryMode: "at_most_once" }),
      failure(),
      AT,
    );

    expect(delivery.outcome).toBe("dead_lettered");
    expect(delivery.attempts).toBe(1);
    expect(delivery.nextAttemptAt).toBeNull();
  });

  it("still leaves the event where a person can deliberately send it again", () => {
    const delivery = recordDeliveryFailure(
      scheduled({ deliveryMode: "at_most_once" }),
      failure(),
      AT,
    );

    expect(toDeliveryView(delivery).replayable).toBe(true);
  });

  it("is unaffected by a success, which needs no retry to have been promised", () => {
    const delivered = recordDeliverySuccess(scheduled({ deliveryMode: "at_most_once" }), 200, AT);

    expect(delivered.outcome).toBe("delivered");
  });
});

describe("giving up on a delivery deliberately", () => {
  it("records why, because nothing else in the row explains the stop", () => {
    const abandoned = abandonOutboundDelivery(failedTimes(2), "  subscription revoked  ");

    expect(abandoned.outcome).toBe("abandoned");
    expect(abandoned.abandonedReason).toBe("subscription revoked");
    expect(abandoned.abandonedAt).not.toBeNull();
    expect(abandoned.nextAttemptAt).toBeNull();
  });

  it("will not be given up on without a reason", () => {
    expect(() => abandonOutboundDelivery(scheduled(), "   ")).toThrow(EmptyGatewayKeyError);
  });

  it("cannot abandon something already ended", () => {
    expect(() => abandonOutboundDelivery(deadLettered(), "subscription revoked")).toThrow(
      DeliverySettledError,
    );
  });

  it("is never eligible to be sent again", () => {
    const abandoned = abandonOutboundDelivery(scheduled(), "subscription revoked");

    expect(toDeliveryView(abandoned).replayable).toBe(false);
    expect(() => replayOutboundDelivery(abandoned, ENDPOINT)).toThrow(DeliveryNotReplayableError);
  });
});

describe("replaying a dead-lettered delivery", () => {
  it("creates a new record rather than erasing the evidence of the failure", () => {
    const original = deadLettered();
    const replay = replayOutboundDelivery(original, ENDPOINT);

    expect(replay.id).not.toBe(original.id);
    expect(replay.replayOfDeliveryId).toBe(original.id);
    expect(replay.outcome).toBe("pending");
    expect(replay.attempts).toBe(0);
    expect(replay.lastError).toBeNull();
    expect(replay.deadLetteredAt).toBeNull();
    expect(original.outcome).toBe("dead_lettered");
  });

  it("carries the event it was always about", () => {
    const replay = replayOutboundDelivery(deadLettered(), ENDPOINT);

    expect(replay.eventId).toBe(EVENT);
    expect(replay.eventType).toBe("admissions.application.submitted");
    expect(replay.payloadFingerprint).toBe(FINGERPRINT);
    expect(replay.subscriptionId).toBe(SUBSCRIPTION);
    expect(replay.deliveryMode).toBe("at_least_once");
  });

  it("goes where the subscription points now, not where it failed", () => {
    expect(replayOutboundDelivery(deadLettered(), OTHER_ENDPOINT).endpointId).toBe(OTHER_ENDPOINT);
  });

  it("names the immediate parent, so three replays read as three replays", () => {
    const first = replayOutboundDelivery(deadLettered(), ENDPOINT);
    const firstFailed = (() => {
      let delivery = first;
      for (let index = 0; index < MAX_DELIVERY_ATTEMPTS; index += 1) {
        delivery = recordDeliveryFailure(delivery, failure(), AT);
      }
      return delivery;
    })();
    const second = replayOutboundDelivery(firstFailed, ENDPOINT);

    expect(second.replayOfDeliveryId).toBe(first.id);
  });

  it("refuses anything that is not dead-lettered", () => {
    expect(() => replayOutboundDelivery(scheduled(), ENDPOINT)).toThrow(DeliveryNotReplayableError);
    expect(() => replayOutboundDelivery(failedTimes(1), ENDPOINT)).toThrow(
      DeliveryNotReplayableError,
    );
    expect(() =>
      replayOutboundDelivery(recordDeliverySuccess(scheduled(), 200, AT), ENDPOINT),
    ).toThrow(DeliveryNotReplayableError);
  });
});

describe("what the dispatcher sweeps up", () => {
  it("picks up a delivery whose moment has come, and leaves one whose has not", () => {
    const failed = failedTimes(1);

    expect(isOutboundDeliveryDue(failed, MUCH_LATER)).toBe(true);
    expect(isOutboundDeliveryDue(failed, AT)).toBe(false);
  });

  it("picks up a freshly queued delivery at once", () => {
    const delivery = scheduled();

    expect(isOutboundDeliveryDue(delivery, delivery.createdAt)).toBe(true);
    expect(isOutboundDeliveryDue(delivery, shift(delivery.createdAt, -1))).toBe(false);
  });

  it("leaves everything that has settled alone", () => {
    expect(isOutboundDeliveryDue(deadLettered(), MUCH_LATER)).toBe(false);
    expect(isOutboundDeliveryDue(recordDeliverySuccess(scheduled(), 200, AT), MUCH_LATER)).toBe(
      false,
    );
    expect(isOutboundDeliveryDue(abandonOutboundDelivery(scheduled(), "revoked"), MUCH_LATER)).toBe(
      false,
    );
  });

  it("leaves a record whose count says the allowance is spent, whatever its outcome says", () => {
    const stale: OutboundDelivery = { ...failedTimes(1), attempts: MAX_DELIVERY_ATTEMPTS };

    expect(isOutboundDeliveryDue(stale, MUCH_LATER)).toBe(false);
  });
});

describe("what an operator working the queue sees", () => {
  it("carries what the receiver said, and not what was sent to it", () => {
    const view = toDeliveryView(failedTimes(1));

    expect(view.lastStatusCode).toBe(502);
    expect(view.lastError).toBe("Bad Gateway");
    expect(Object.keys(view)).not.toContain("payloadFingerprint");
    expect(JSON.stringify(view)).not.toContain(FINGERPRINT);
  });

  it("counts the allowance down while there is one", () => {
    expect(toDeliveryView(scheduled()).attemptsRemaining).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(toDeliveryView(failedTimes(2)).attemptsRemaining).toBe(MAX_DELIVERY_ATTEMPTS - 2);
  });

  it("reports nothing remaining once the journey is over", () => {
    expect(toDeliveryView(recordDeliverySuccess(scheduled(), 200, AT)).attemptsRemaining).toBe(0);
    expect(toDeliveryView(deadLettered()).attemptsRemaining).toBe(0);
    expect(toDeliveryView(abandonOutboundDelivery(scheduled(), "revoked")).attemptsRemaining).toBe(
      0,
    );
  });

  it("marks only the dead-lettered as something to send again", () => {
    expect(toDeliveryView(deadLettered()).replayable).toBe(true);
    expect(toDeliveryView(failedTimes(1)).replayable).toBe(false);
    expect(toDeliveryView(recordDeliverySuccess(scheduled(), 200, AT)).replayable).toBe(false);
  });

  it("hands back something a caller cannot quietly amend", () => {
    expect(Object.isFrozen(toDeliveryView(scheduled()))).toBe(true);
  });
});
