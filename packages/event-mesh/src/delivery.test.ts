import type { ISODateString } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  FIRST_ATTEMPT,
  RETRIABLE_FAILURE_REASONS,
  TERMINAL_FAILURE_REASONS,
  decideDelivery,
  isRetriableFailure,
  lagBandFor,
  validateAttemptCeiling,
} from "./delivery";
import {
  InvalidAttemptCeilingError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
} from "./errors";
import {
  DEAD_LETTER_REASONS,
  DEFAULT_DELIVERY_ATTEMPTS,
  DELIVERY_SEMANTICS,
  LAG_BEHIND_THRESHOLD,
  LAG_STALLED_AFTER_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  MIN_DELIVERY_ATTEMPTS,
  UNCOMMITTED_POSITION,
  requiresDeduplication,
  requiresRetry,
} from "./mesh-value";
import type { DeliveryRequest, LagRequest } from "./mesh-view";

const SUBSCRIPTION_KEY = "reporting.enrolment-sink";
const MOVED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;

/** `MOVED_AT` shifted by a whole number of seconds, so no assertion here depends on the wall clock. */
const after = (seconds: number): ISODateString =>
  new Date(Date.parse(MOVED_AT) + seconds * 1_000).toISOString() as ISODateString;

const request = (overrides: Partial<DeliveryRequest> = {}): DeliveryRequest => ({
  subscriptionKey: SUBSCRIPTION_KEY,
  semantics: "at_least_once",
  attemptCeiling: DEFAULT_DELIVERY_ATTEMPTS,
  attemptsMade: 0,
  matched: true,
  alreadyDelivered: false,
  lastFailure: null,
  ...overrides,
});

const lag = (overrides: Partial<LagRequest> = {}): LagRequest => ({
  subscriptionKey: SUBSCRIPTION_KEY,
  partition: 3,
  committedPosition: 100,
  streamHead: 100,
  positionMovedAt: MOVED_AT,
  asOf: after(60),
  ...overrides,
});

describe("failure kinds", () => {
  it("partitions every dead-letter reason into exactly one of the two sets", () => {
    for (const reason of DEAD_LETTER_REASONS) {
      const retriable = RETRIABLE_FAILURE_REASONS.includes(reason);
      const terminal = TERMINAL_FAILURE_REASONS.includes(reason);
      expect(retriable).not.toBe(terminal);
    }
  });

  it("accounts for every reason across the two sets and invents none", () => {
    const combined = [...RETRIABLE_FAILURE_REASONS, ...TERMINAL_FAILURE_REASONS];
    expect(combined).toHaveLength(DEAD_LETTER_REASONS.length);
    for (const reason of combined) {
      expect(DEAD_LETTER_REASONS).toContain(reason);
    }
  });

  it("treats a failure of the attempt as retriable and a failure of the message as terminal", () => {
    expect(RETRIABLE_FAILURE_REASONS).toEqual([
      "consumer_error",
      "timeout",
      "transport_unavailable",
    ]);
  });

  it("keeps attempts_exhausted terminal, so re-deciding a dead letter is idempotent", () => {
    expect(TERMINAL_FAILURE_REASONS).toContain("attempts_exhausted");
    expect(isRetriableFailure("attempts_exhausted")).toBe(false);
  });

  it("agrees with the sets it is derived from for every reason", () => {
    for (const reason of DEAD_LETTER_REASONS) {
      expect(isRetriableFailure(reason)).toBe(RETRIABLE_FAILURE_REASONS.includes(reason));
    }
  });

  it("freezes both sets", () => {
    expect(Object.isFrozen(RETRIABLE_FAILURE_REASONS)).toBe(true);
    expect(Object.isFrozen(TERMINAL_FAILURE_REASONS)).toBe(true);
  });
});

describe("validateAttemptCeiling", () => {
  it("accepts every ceiling in the supported range", () => {
    for (let attempts = MIN_DELIVERY_ATTEMPTS; attempts <= MAX_DELIVERY_ATTEMPTS; attempts += 1) {
      expect(validateAttemptCeiling(SUBSCRIPTION_KEY, attempts)).toBe(attempts);
    }
  });

  it("refuses a ceiling of nothing, which would dead-letter a stream without trying", () => {
    expect(() => validateAttemptCeiling(SUBSCRIPTION_KEY, 0)).toThrow(InvalidAttemptCeilingError);
  });

  it("refuses a ceiling above the platform maximum", () => {
    expect(() => validateAttemptCeiling(SUBSCRIPTION_KEY, MAX_DELIVERY_ATTEMPTS + 1)).toThrow(
      InvalidAttemptCeilingError,
    );
  });

  it("refuses figures that are not whole counts", () => {
    for (const attempts of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateAttemptCeiling(SUBSCRIPTION_KEY, attempts)).toThrow(
        InvalidAttemptCeilingError,
      );
    }
  });

  it("starts attempts at one, because there is no attempt that did not happen", () => {
    expect(FIRST_ATTEMPT).toBe(1);
  });
});

describe("decideDelivery", () => {
  it("delivers a matched first attempt and numbers it from one", () => {
    const decision = decideDelivery(request());
    expect(decision.verdict).toBe("deliver");
    expect(decision.attempt).toBe(FIRST_ATTEMPT);
    expect(decision.reason).toBeNull();
  });

  it("carries the subscription it decided about", () => {
    expect(decideDelivery(request()).subscriptionKey).toBe(SUBSCRIPTION_KEY);
  });

  it("freezes the decision", () => {
    expect(Object.isFrozen(decideDelivery(request()))).toBe(true);
  });

  it("numbers the attempt one past what has already been tried", () => {
    const decision = decideDelivery(request({ attemptsMade: 3 }));
    expect(decision.attempt).toBe(4);
  });

  it("filters an unmatched message without charging it an attempt", () => {
    const decision = decideDelivery(request({ matched: false, attemptsMade: 0 }));
    expect(decision.verdict).toBe("filtered");
    expect(decision.attempt).toBeNull();
    expect(decision.reason).toBeNull();
  });

  it("filters before anything else, so an exhausted budget on an unmatched message is still filtered", () => {
    const decision = decideDelivery(
      request({
        matched: false,
        attemptsMade: MAX_DELIVERY_ATTEMPTS,
        attemptCeiling: MIN_DELIVERY_ATTEMPTS,
        lastFailure: "payload_rejected",
      }),
    );
    expect(decision.verdict).toBe("filtered");
  });

  it("suppresses a redelivery only where the semantics keep a ledger", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      const decision = decideDelivery(request({ semantics, alreadyDelivered: true }));
      const suppressed = decision.verdict === "duplicate";
      expect(suppressed).toBe(requiresDeduplication(semantics));
    }
  });

  it("delivers a message the ledger has not seen under exactly-once", () => {
    const decision = decideDelivery(
      request({ semantics: "exactly_once", alreadyDelivered: false }),
    );
    expect(decision.verdict).toBe("deliver");
  });

  it("charges a suppressed duplicate no attempt", () => {
    const decision = decideDelivery(request({ semantics: "exactly_once", alreadyDelivered: true }));
    expect(decision.attempt).toBeNull();
    expect(decision.reason).toBeNull();
  });

  it("ends a terminal failure at once and records the fault rather than the bookkeeping", () => {
    const decision = decideDelivery(request({ lastFailure: "payload_rejected", attemptsMade: 1 }));
    expect(decision.verdict).toBe("dead_letter");
    expect(decision.reason).toBe("payload_rejected");
  });

  it("retries a retriable failure while attempts remain", () => {
    const decision = decideDelivery(request({ lastFailure: "timeout", attemptsMade: 1 }));
    expect(decision.verdict).toBe("deliver");
    expect(decision.attempt).toBe(2);
  });

  it("decides every dead-letter reason by whether that reason is retriable", () => {
    for (const reason of DEAD_LETTER_REASONS) {
      const decision = decideDelivery(request({ lastFailure: reason, attemptsMade: 1 }));
      const ended = decision.verdict === "dead_letter";
      expect(ended).toBe(!isRetriableFailure(reason));
    }
  });

  it("abandons rather than dead-letters where the semantics do not retry", () => {
    const decision = decideDelivery(
      request({ semantics: "at_most_once", lastFailure: "timeout", attemptsMade: 1 }),
    );
    expect(decision.verdict).toBe("abandoned");
    expect(decision.reason).toBe("timeout");
  });

  it("abandons exactly where the semantics decline to retry, for every promise", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      const decision = decideDelivery(
        request({ semantics, lastFailure: "timeout", attemptsMade: 1 }),
      );
      const abandoned = decision.verdict === "abandoned";
      expect(abandoned).toBe(!requiresRetry(semantics));
    }
  });

  it("delivers a first attempt under at-most-once, which declines retries and not deliveries", () => {
    const decision = decideDelivery(request({ semantics: "at_most_once" }));
    expect(decision.verdict).toBe("deliver");
    expect(decision.attempt).toBe(FIRST_ATTEMPT);
  });

  it("dead-letters with attempts_exhausted once the ceiling is reached", () => {
    const decision = decideDelivery(
      request({ attemptCeiling: 3, attemptsMade: 3, lastFailure: "consumer_error" }),
    );
    expect(decision.verdict).toBe("dead_letter");
    expect(decision.reason).toBe("attempts_exhausted");
  });

  it("delivers the last attempt the ceiling allows and dead-letters the one after it", () => {
    const last = decideDelivery(
      request({ attemptCeiling: 3, attemptsMade: 2, lastFailure: "timeout" }),
    );
    expect(last.verdict).toBe("deliver");
    expect(last.attempt).toBe(3);

    const next = decideDelivery(
      request({ attemptCeiling: 3, attemptsMade: 3, lastFailure: "timeout" }),
    );
    expect(next.verdict).toBe("dead_letter");
  });

  it("returns the same verdict when asked again about a message it has already dead-lettered", () => {
    const exhausted = request({
      attemptCeiling: 2,
      attemptsMade: 2,
      lastFailure: "attempts_exhausted",
    });
    const first = decideDelivery(exhausted);
    const second = decideDelivery(exhausted);
    expect(first).toEqual(second);
    expect(first.verdict).toBe("dead_letter");
    expect(first.reason).toBe("attempts_exhausted");
  });

  it("delivers under a ceiling of one before anything has been tried", () => {
    const decision = decideDelivery(request({ attemptCeiling: MIN_DELIVERY_ATTEMPTS }));
    expect(decision.verdict).toBe("deliver");
    expect(decision.attempt).toBe(FIRST_ATTEMPT);
  });

  it("checks the subscription ceiling on every decision", () => {
    expect(() => decideDelivery(request({ attemptCeiling: 0 }))).toThrow(
      InvalidAttemptCeilingError,
    );
    expect(() => decideDelivery(request({ attemptCeiling: MAX_DELIVERY_ATTEMPTS + 1 }))).toThrow(
      InvalidAttemptCeilingError,
    );
  });

  it("refuses an attempt count no aggregate could have written", () => {
    for (const attemptsMade of [-1, 1.5, Number.NaN]) {
      expect(() => decideDelivery(request({ attemptsMade }))).toThrow(InvalidMeshCountError);
    }
  });

  it("never names a reason on a verdict that is not an ending", () => {
    const outcomes: readonly DeliveryRequest[] = [
      request(),
      request({ matched: false }),
      request({ semantics: "exactly_once", alreadyDelivered: true }),
    ];
    for (const outcome of outcomes) {
      expect(decideDelivery(outcome).reason).toBeNull();
    }
  });

  it("never authorises an attempt on a verdict that is not a delivery", () => {
    const endings: readonly DeliveryRequest[] = [
      request({ matched: false }),
      request({ semantics: "exactly_once", alreadyDelivered: true }),
      request({ lastFailure: "payload_rejected" }),
      request({ semantics: "at_most_once", lastFailure: "timeout" }),
      request({ attemptCeiling: 2, attemptsMade: 2 }),
    ];
    for (const ending of endings) {
      const decision = decideDelivery(ending);
      expect(decision.verdict).not.toBe("deliver");
      expect(decision.attempt).toBeNull();
    }
  });

  it("delivers under every promise when nothing has failed", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      expect(decideDelivery(request({ semantics })).verdict).toBe("deliver");
    }
  });
});

describe("lagBandFor", () => {
  it("calls a subscription level with the head current", () => {
    const assessment = lagBandFor(lag());
    expect(assessment.band).toBe("current");
    expect(assessment.lag).toBe(0);
  });

  it("keeps a caught-up subscription current however long it has had nothing to do", () => {
    const assessment = lagBandFor(lag({ asOf: after(LAG_STALLED_AFTER_SECONDS * 10) }));
    expect(assessment.band).toBe("current");
    expect(assessment.idleSeconds).toBe(LAG_STALLED_AFTER_SECONDS * 10);
  });

  it("keeps a subscription within the threshold current while it is still advancing", () => {
    const assessment = lagBandFor(
      lag({ committedPosition: 100, streamHead: 100 + LAG_BEHIND_THRESHOLD }),
    );
    expect(assessment.band).toBe("current");
    expect(assessment.lag).toBe(LAG_BEHIND_THRESHOLD);
  });

  it("calls a subscription past the threshold behind", () => {
    const assessment = lagBandFor(
      lag({ committedPosition: 100, streamHead: 101 + LAG_BEHIND_THRESHOLD }),
    );
    expect(assessment.band).toBe("behind");
    expect(assessment.lag).toBe(LAG_BEHIND_THRESHOLD + 1);
  });

  it("calls a stopped consumer stalled at any non-zero lag, however quiet the stream", () => {
    const assessment = lagBandFor(
      lag({ committedPosition: 100, streamHead: 105, asOf: after(LAG_STALLED_AFTER_SECONDS) }),
    );
    expect(assessment.band).toBe("stalled");
    expect(assessment.lag).toBe(5);
  });

  it("prefers stalled to behind, because not advancing is worse than being far back", () => {
    const assessment = lagBandFor(
      lag({
        committedPosition: 0,
        streamHead: LAG_BEHIND_THRESHOLD * 5,
        asOf: after(LAG_STALLED_AFTER_SECONDS + 1),
      }),
    );
    expect(assessment.band).toBe("stalled");
  });

  it("does not call a subscription stalled a second before the threshold", () => {
    const assessment = lagBandFor(
      lag({ committedPosition: 100, streamHead: 105, asOf: after(LAG_STALLED_AFTER_SECONDS - 1) }),
    );
    expect(assessment.band).toBe("current");
  });

  it("reports an uncommitted checkpoint as lagging by the whole stream", () => {
    const assessment = lagBandFor(lag({ committedPosition: UNCOMMITTED_POSITION, streamHead: 42 }));
    expect(assessment.lag).toBe(42);
  });

  it("calls an uncommitted checkpoint on an empty stream current", () => {
    const assessment = lagBandFor(
      lag({ committedPosition: UNCOMMITTED_POSITION, streamHead: UNCOMMITTED_POSITION }),
    );
    expect(assessment.band).toBe("current");
    expect(assessment.lag).toBe(0);
  });

  it("carries the checkpoint it assessed, per partition", () => {
    const assessment = lagBandFor(lag({ partition: 7 }));
    expect(assessment.subscriptionKey).toBe(SUBSCRIPTION_KEY);
    expect(assessment.partition).toBe(7);
  });

  it("freezes the assessment", () => {
    expect(Object.isFrozen(lagBandFor(lag()))).toBe(true);
  });

  it("reports the idle time in whole seconds", () => {
    expect(lagBandFor(lag({ asOf: after(90) })).idleSeconds).toBe(90);
  });

  it("floors the idle time at zero rather than refusing a checkpoint from a skewed clock", () => {
    const assessment = lagBandFor(lag({ committedPosition: 90, asOf: after(-30) }));
    expect(assessment.idleSeconds).toBe(0);
    expect(assessment.band).toBe("current");
  });

  it("refuses a checkpoint ahead of the stream it is a position in", () => {
    expect(() => lagBandFor(lag({ committedPosition: 101, streamHead: 100 }))).toThrow(
      InvalidMeshCountError,
    );
  });

  it("refuses positions that are not whole counts", () => {
    for (const committedPosition of [-1, 1.5, Number.NaN]) {
      expect(() => lagBandFor(lag({ committedPosition }))).toThrow(InvalidMeshCountError);
    }
    for (const streamHead of [-1, 1.5, Number.NaN]) {
      expect(() => lagBandFor(lag({ streamHead, committedPosition: 0 }))).toThrow(
        InvalidMeshCountError,
      );
    }
  });

  it("refuses an instant it cannot read as a moment in time", () => {
    const notAnInstant = "the day before yesterday" as ISODateString;
    expect(() => lagBandFor(lag({ positionMovedAt: notAnInstant }))).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => lagBandFor(lag({ asOf: notAnInstant }))).toThrow(InvalidMeshInstantError);
  });
});
