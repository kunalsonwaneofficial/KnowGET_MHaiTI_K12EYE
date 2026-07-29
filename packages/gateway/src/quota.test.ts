import { describe, expect, it } from "vitest";
import type { ISODateString } from "@knowget/types";
import { InvalidQuotaFigureError } from "./errors";
import type { QuotaRequest } from "./gateway-view";
import { assessQuota } from "./quota";

const WINDOW_START = "2026-07-17T10:00:00.000Z" as ISODateString;
const AS_OF = "2026-07-17T10:00:30.000Z" as ISODateString;

const request = (overrides: Partial<QuotaRequest> = {}): QuotaRequest => ({
  consumed: 0,
  cost: 1,
  limit: 100,
  burstAllowance: null,
  window: "minute",
  windowStartedAt: WINDOW_START,
  asOf: AS_OF,
  ...overrides,
});

describe("figures the engine will not work with", () => {
  it("refuses a consumption that is not a count", () => {
    expect(() => assessQuota(request({ consumed: -1 }))).toThrow(InvalidQuotaFigureError);
    expect(() => assessQuota(request({ consumed: 2.5 }))).toThrow(InvalidQuotaFigureError);
  });

  it("refuses a call that would cost nothing to make", () => {
    expect(() => assessQuota(request({ cost: 0 }))).toThrow(InvalidQuotaFigureError);
    expect(() => assessQuota(request({ cost: -3 }))).toThrow(InvalidQuotaFigureError);
    expect(() => assessQuota(request({ cost: 1.5 }))).toThrow(InvalidQuotaFigureError);
  });

  it("checks the arithmetic before it checks whether anything is being counted", () => {
    expect(() => assessQuota(request({ limit: null, window: null, cost: 0 }))).toThrow(
      InvalidQuotaFigureError,
    );
  });

  it("keeps the defect off the consumer's screen", () => {
    try {
      assessQuota(request({ cost: 0 }));
      expect.unreachable("a cost of nothing should not have been assessed");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidQuotaFigureError);
      expect((error as InvalidQuotaFigureError).isOperational).toBe(false);
    }
  });
});

describe("a request nothing is counting", () => {
  it("is served, with no numbers a transport could turn into a header", () => {
    const verdict = assessQuota(request({ limit: null, window: null }));

    expect(verdict.decision).toBe("allow");
    expect(verdict.reason).toBe("within_limits");
    expect(verdict.remaining).toBeNull();
    expect(verdict.windowResetsAt).toBeNull();
    expect(verdict.currentWindowStartedAt).toBeNull();
    expect(verdict.retryAfterSeconds).toBeNull();
  });

  it("reports no window as expired, so no ledger rolls a row that does not exist", () => {
    expect(assessQuota(request({ limit: null, window: null })).windowExpired).toBe(false);
  });

  it("counts nothing when either half of the rate limit is missing", () => {
    expect(assessQuota(request({ limit: null })).remaining).toBeNull();
    expect(assessQuota(request({ window: null })).remaining).toBeNull();
  });
});

describe("inside the allowance", () => {
  it("serves the request and counts down what is left", () => {
    const verdict = assessQuota(request({ consumed: 10 }));

    expect(verdict.decision).toBe("allow");
    expect(verdict.reason).toBe("within_limits");
    expect(verdict.remaining).toBe(89);
    expect(verdict.retryAfterSeconds).toBeNull();
  });

  it("charges the whole cost of a batch call rather than one", () => {
    expect(assessQuota(request({ cost: 25 })).remaining).toBe(75);
  });

  it("serves the request that lands exactly on the limit", () => {
    const verdict = assessQuota(request({ consumed: 99 }));

    expect(verdict.decision).toBe("allow");
    expect(verdict.remaining).toBe(0);
  });

  it("says when the window turns over even when nothing is wrong", () => {
    const verdict = assessQuota(request());

    expect(verdict.windowResetsAt).toBe("2026-07-17T10:01:00.000Z");
    expect(verdict.currentWindowStartedAt).toBe(WINDOW_START);
    expect(verdict.windowExpired).toBe(false);
  });
});

describe("over the allowance", () => {
  it("throttles rather than denying, because the same call works later", () => {
    const verdict = assessQuota(request({ consumed: 100 }));

    expect(verdict.decision).toBe("throttle");
    expect(verdict.remaining).toBe(0);
  });

  it("refuses a batch whose cost crosses the limit the calls before it did not", () => {
    expect(assessQuota(request({ consumed: 90, cost: 25 })).decision).toBe("throttle");
  });

  it("tells a caller going too fast apart from one who has spent an allocation", () => {
    const over = { consumed: 100 };

    expect(assessQuota(request({ ...over, window: "minute" })).reason).toBe("rate_limit_exceeded");
    expect(assessQuota(request({ ...over, window: "hour" })).reason).toBe("rate_limit_exceeded");
    expect(assessQuota(request({ ...over, window: "day" })).reason).toBe("quota_exhausted");
    expect(assessQuota(request({ ...over, window: "month" })).reason).toBe("quota_exhausted");
  });

  it("never denies, whichever way the allowance ran out", () => {
    const decisions = (["minute", "hour", "day", "month"] as const).map(
      (window) => assessQuota(request({ consumed: 100, window })).decision,
    );

    expect(decisions).toEqual(["throttle", "throttle", "throttle", "throttle"]);
  });

  it("says how long the wait is rather than leaving the client to guess", () => {
    expect(assessQuota(request({ consumed: 100 })).retryAfterSeconds).toBe(30);
  });

  it("never tells anyone to come back in no time at all", () => {
    const verdict = assessQuota(
      request({ consumed: 100, asOf: "2026-07-17T10:00:59.500Z" as ISODateString }),
    );

    expect(verdict.retryAfterSeconds).toBe(1);
  });
});

describe("the burst allowance", () => {
  it("serves a request above the sustained limit but under the ceiling", () => {
    const verdict = assessQuota(request({ consumed: 100, burstAllowance: 150 }));

    expect(verdict.decision).toBe("allow");
    expect(verdict.reason).toBe("within_limits");
  });

  it("shows nothing left while serving from the burst, which is the signal to ease off", () => {
    expect(assessQuota(request({ consumed: 100, burstAllowance: 150 })).remaining).toBe(0);
  });

  it("refuses above the ceiling the burst sets", () => {
    expect(assessQuota(request({ consumed: 150, burstAllowance: 150 })).decision).toBe("throttle");
  });

  it("changes nothing when it equals the limit, which is how no burst is written", () => {
    const withBurst = assessQuota(request({ consumed: 100, burstAllowance: 100 }));
    const without = assessQuota(request({ consumed: 100 }));

    expect(withBurst).toEqual(without);
  });
});

describe("a window that has turned over", () => {
  const stale = { consumed: 100, asOf: "2026-07-17T10:05:30.000Z" as ISODateString };

  it("reads a count from a window that is over as no count at all", () => {
    const verdict = assessQuota(request(stale));

    expect(verdict.decision).toBe("allow");
    expect(verdict.remaining).toBe(99);
  });

  it("says the window elapsed, so a ledger knows to roll the row", () => {
    expect(assessQuota(request(stale)).windowExpired).toBe(true);
  });

  it("keeps the phase of the original window rather than restarting at the current instant", () => {
    const verdict = assessQuota(request(stale));

    expect(verdict.currentWindowStartedAt).toBe("2026-07-17T10:05:00.000Z");
    expect(verdict.windowResetsAt).toBe("2026-07-17T10:06:00.000Z");
  });

  it("realigns a row left untouched for months in one step", () => {
    const verdict = assessQuota(
      request({
        window: "day",
        windowStartedAt: "2026-01-01T00:00:00.000Z" as ISODateString,
        asOf: "2026-07-17T10:00:00.000Z" as ISODateString,
      }),
    );

    expect(verdict.currentWindowStartedAt).toBe("2026-07-17T00:00:00.000Z");
    expect(verdict.windowResetsAt).toBe("2026-07-18T00:00:00.000Z");
  });

  it("turns over the instant the window is up rather than a moment after", () => {
    const atBoundary = assessQuota(
      request({ consumed: 100, asOf: "2026-07-17T10:01:00.000Z" as ISODateString }),
    );

    expect(atBoundary.windowExpired).toBe(true);
    expect(atBoundary.currentWindowStartedAt).toBe("2026-07-17T10:01:00.000Z");
  });

  it("stays in the recorded window when asked about a moment before it started", () => {
    const verdict = assessQuota(
      request({ consumed: 100, asOf: "2026-07-17T09:59:00.000Z" as ISODateString }),
    );

    expect(verdict.windowExpired).toBe(false);
    expect(verdict.currentWindowStartedAt).toBe(WINDOW_START);
    expect(verdict.retryAfterSeconds).toBe(120);
  });
});

describe("determinism", () => {
  it("answers for the instant it is asked about rather than for now", () => {
    const pinned = { consumed: 100, window: "hour" as const };

    const early = assessQuota(
      request({ ...pinned, asOf: "2026-07-17T10:00:01.000Z" as ISODateString }),
    );
    const late = assessQuota(
      request({ ...pinned, asOf: "2026-07-17T10:59:00.000Z" as ISODateString }),
    );

    expect(early.retryAfterSeconds).toBe(3_599);
    expect(late.retryAfterSeconds).toBe(60);
  });

  it("gives the same verdict for the same figures every time", () => {
    expect(assessQuota(request({ consumed: 42 }))).toEqual(assessQuota(request({ consumed: 42 })));
  });
});
