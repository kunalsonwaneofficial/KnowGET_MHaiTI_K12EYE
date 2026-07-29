import { describe, expect, it } from "vitest";
import type { ISODateString, Uuid } from "@knowget/types";
import { planBackoff } from "./backoff";
import { InvalidAttemptNumberError } from "./errors";
import { BACKOFF_BASE_SECONDS, BACKOFF_JITTER_RATIO, MAX_DELIVERY_ATTEMPTS } from "./gateway-value";
import type { BackoffRequest } from "./gateway-view";

const DELIVERY = "5f2c1b90-3a44-4e21-9c77-8a1d6e0b42f3" as Uuid;
const ATTEMPTED = "2026-07-17T10:00:00.000Z" as ISODateString;

const request = (overrides: Partial<BackoffRequest> = {}): BackoffRequest => ({
  deliveryId: DELIVERY,
  attempt: 0,
  lastAttemptedAt: ATTEMPTED,
  ...overrides,
});

const idAt = (index: number): Uuid =>
  `5f2c1b90-3a44-4e21-9c77-${String(index).padStart(12, "0")}` as Uuid;

const secondsBetween = (from: ISODateString, to: ISODateString): number =>
  (Date.parse(to) - Date.parse(from)) / 1_000;

describe("attempt counts the engine will not plan against", () => {
  it("refuses a count that is not a whole number of attempts", () => {
    expect(() => planBackoff(request({ attempt: -1 }))).toThrow(InvalidAttemptNumberError);
    expect(() => planBackoff(request({ attempt: 1.5 }))).toThrow(InvalidAttemptNumberError);
    expect(() => planBackoff(request({ attempt: Number.NaN }))).toThrow(InvalidAttemptNumberError);
  });

  it("keeps a defect in our own counter off the integrator's screen", () => {
    try {
      planBackoff(request({ attempt: -3 }));
      expect.unreachable("a negative attempt count should not have produced a schedule");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAttemptNumberError);
      expect((error as InvalidAttemptNumberError).isOperational).toBe(false);
    }
  });
});

describe("the first attempt", () => {
  it("is due at once, because backoff is a schedule of retries", () => {
    const plan = planBackoff(request({ attempt: 0 }));

    expect(plan.delaySeconds).toBe(0);
    expect(plan.nextAttemptAt).toBe(ATTEMPTED);
    expect(plan.exhausted).toBe(false);
  });

  it("names itself as attempt one and reports the whole allowance still standing", () => {
    const plan = planBackoff(request({ attempt: 0 }));

    expect(plan.attempt).toBe(1);
    expect(plan.attemptsRemaining).toBe(MAX_DELIVERY_ATTEMPTS);
  });
});

describe("the published schedule", () => {
  it("keeps every retry within the jitter band of its documented interval", () => {
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      const base = BACKOFF_BASE_SECONDS[attempt - 1] ?? 0;
      const plan = planBackoff(request({ attempt }));

      expect(plan.delaySeconds).toBeGreaterThanOrEqual(
        Math.round(base * (1 - BACKOFF_JITTER_RATIO)),
      );
      expect(plan.delaySeconds).toBeLessThanOrEqual(Math.round(base * (1 + BACKOFF_JITTER_RATIO)));
    }
  });

  it("never schedules a retry for the same instant the attempt failed", () => {
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      expect(planBackoff(request({ attempt })).delaySeconds).toBeGreaterThan(0);
    }
  });

  it("lengthens the wait as the receiver keeps failing", () => {
    const first = planBackoff(request({ attempt: 1 })).delaySeconds;
    const third = planBackoff(request({ attempt: 3 })).delaySeconds;

    expect(third).toBeGreaterThan(first);
  });

  it("measures the next attempt from the one that just failed", () => {
    const plan = planBackoff(request({ attempt: 2 }));

    expect(plan.nextAttemptAt).not.toBeNull();
    expect(secondsBetween(ATTEMPTED, plan.nextAttemptAt as ISODateString)).toBe(plan.delaySeconds);
  });

  it("counts the allowance down as it goes", () => {
    for (let attempt = 0; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      expect(planBackoff(request({ attempt })).attemptsRemaining).toBe(
        MAX_DELIVERY_ATTEMPTS - attempt,
      );
    }
  });
});

describe("running out of attempts", () => {
  it("reports exhaustion rather than an error, because giving up is an ordinary end", () => {
    const plan = planBackoff(request({ attempt: MAX_DELIVERY_ATTEMPTS }));

    expect(plan.exhausted).toBe(true);
    expect(plan.nextAttemptAt).toBeNull();
    expect(plan.delaySeconds).toBe(0);
    expect(plan.attemptsRemaining).toBe(0);
  });

  it("still names the attempt that will not happen", () => {
    expect(planBackoff(request({ attempt: MAX_DELIVERY_ATTEMPTS })).attempt).toBe(
      MAX_DELIVERY_ATTEMPTS + 1,
    );
  });

  it("stays exhausted for a count that has somehow gone past the allowance", () => {
    const plan = planBackoff(request({ attempt: MAX_DELIVERY_ATTEMPTS + 5 }));

    expect(plan.exhausted).toBe(true);
    expect(plan.attemptsRemaining).toBe(0);
  });
});

describe("jitter that is derived rather than drawn", () => {
  it("gives the same delivery the same schedule every time it is asked", () => {
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      const first = planBackoff(request({ attempt }));
      const second = planBackoff(request({ attempt }));

      expect(second.delaySeconds).toBe(first.delaySeconds);
      expect(second.nextAttemptAt).toBe(first.nextAttemptAt);
    }
  });

  it("spreads a herd of deliveries failed by one outage across the interval", () => {
    const delays = new Set<number>();
    for (let index = 0; index < 100; index += 1) {
      delays.add(
        planBackoff({ deliveryId: idAt(index), attempt: 1, lastAttemptedAt: ATTEMPTED })
          .delaySeconds,
      );
    }

    expect(delays.size).toBeGreaterThan(5);
  });

  it("re-draws the order at every step instead of reshuffling the herd once", () => {
    const ratios = new Set<string>();
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      const base = BACKOFF_BASE_SECONDS[attempt - 1] ?? 1;
      ratios.add((planBackoff(request({ attempt })).delaySeconds / base).toFixed(2));
    }

    expect(ratios.size).toBeGreaterThan(1);
  });

  it("never reaches for a random source, so a schedule can be recomputed months later", () => {
    const plan = planBackoff(request({ attempt: 4 }));
    const recomputed = planBackoff(request({ attempt: 4 }));

    expect(recomputed).toStrictEqual(plan);
  });
});

describe("what a plan is", () => {
  it("hands back something a caller cannot quietly amend", () => {
    expect(Object.isFrozen(planBackoff(request({ attempt: 1 })))).toBe(true);
    expect(Object.isFrozen(planBackoff(request({ attempt: MAX_DELIVERY_ATTEMPTS })))).toBe(true);
  });
});
