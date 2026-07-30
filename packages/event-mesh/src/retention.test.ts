import type { ISODateString } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidMeshCountError, InvalidMeshInstantError, InvalidRetentionError } from "./errors";
import {
  DEFAULT_PAYLOAD_RETENTION,
  DEFAULT_RETENTION_SECONDS,
  MAX_RETENTION_SECONDS,
  MIN_RETENTION_SECONDS,
  PAYLOAD_RETENTIONS,
  isReplayable,
} from "./mesh-value";
import type { RetentionRequest } from "./mesh-view";
import {
  assessRetention,
  isRetained,
  retentionCutoff,
  retentionExpiry,
  validateRetention,
} from "./retention";

const STREAM_KEY = "student-lifecycle.enrolment";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const RECORDED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;

/** The instant a given number of seconds after the message was recorded. */
const after = (seconds: number): ISODateString =>
  new Date(Date.parse(RECORDED_AT) + seconds * 1_000).toISOString() as ISODateString;

const UNREADABLE = "the Tuesday after next" as ISODateString;

/** Windows no validated stream record could be carrying, which is what makes them engine guards. */
const IMPOSSIBLE_WINDOWS = [
  0,
  -1,
  1.5,
  MIN_RETENTION_SECONDS - 1,
  MAX_RETENTION_SECONDS + 1,
  Number.NaN,
];

const request = (overrides: Partial<RetentionRequest> = {}): RetentionRequest => ({
  streamKey: STREAM_KEY,
  retention: DEFAULT_PAYLOAD_RETENTION,
  retentionSeconds: DEFAULT_RETENTION_SECONDS,
  recordedAt: RECORDED_AT,
  asOf: after(60),
  ...overrides,
});

describe("validateRetention", () => {
  it("accepts the window a stream is given when it declares none", () => {
    expect(validateRetention(STREAM_KEY, DEFAULT_RETENTION_SECONDS)).toBe(
      DEFAULT_RETENTION_SECONDS,
    );
  });

  it("accepts both bounds, which are the range rather than the far side of it", () => {
    expect(validateRetention(STREAM_KEY, MIN_RETENTION_SECONDS)).toBe(MIN_RETENTION_SECONDS);
    expect(validateRetention(STREAM_KEY, MAX_RETENTION_SECONDS)).toBe(MAX_RETENTION_SECONDS);
  });

  it("refuses a window too short to survive a consumer restart", () => {
    expect(() => validateRetention(STREAM_KEY, MIN_RETENTION_SECONDS - 1)).toThrow(
      InvalidRetentionError,
    );
  });

  it("refuses a window that would make the mesh an undeclared archive", () => {
    expect(() => validateRetention(STREAM_KEY, MAX_RETENTION_SECONDS + 1)).toThrow(
      InvalidRetentionError,
    );
  });

  it("refuses a window that is not a whole number of seconds", () => {
    for (const seconds of [3_600.5, -1, 0, Number.NaN]) {
      expect(() => validateRetention(STREAM_KEY, seconds)).toThrow(InvalidRetentionError);
    }
  });
});

describe("retentionExpiry", () => {
  it("adds the window to the moment the mesh took custody", () => {
    expect(retentionExpiry(RECORDED_AT, MIN_RETENTION_SECONDS)).toBe(after(MIN_RETENTION_SECONDS));
    expect(retentionExpiry(RECORDED_AT, DEFAULT_RETENTION_SECONDS)).toBe(
      after(DEFAULT_RETENTION_SECONDS),
    );
  });

  it("gives an instant in the fixed width the stored column is compared in", () => {
    for (const seconds of [
      MIN_RETENTION_SECONDS,
      DEFAULT_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    ]) {
      expect(retentionExpiry(RECORDED_AT, seconds)).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    }
  });

  it("orders lexically the way it orders in time, which is what the stored column relies on", () => {
    const earlier = retentionExpiry(RECORDED_AT, MIN_RETENTION_SECONDS);
    const later = retentionExpiry(RECORDED_AT, MAX_RETENTION_SECONDS);
    expect(earlier < later).toBe(true);
  });

  it("refuses a window no validated stream record could be carrying", () => {
    for (const seconds of IMPOSSIBLE_WINDOWS) {
      expect(() => retentionExpiry(RECORDED_AT, seconds)).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses an instant it cannot read rather than computing from a NaN", () => {
    expect(() => retentionExpiry(UNREADABLE, DEFAULT_RETENTION_SECONDS)).toThrow(
      InvalidMeshInstantError,
    );
  });
});

describe("retentionCutoff", () => {
  it("subtracts the window from the moment the sweep is being run at", () => {
    const asOf = after(DEFAULT_RETENTION_SECONDS);
    expect(retentionCutoff(asOf, DEFAULT_RETENTION_SECONDS)).toBe(RECORDED_AT);
  });

  it("is the expiry arithmetic read from the other end", () => {
    for (const seconds of [
      MIN_RETENTION_SECONDS,
      DEFAULT_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    ]) {
      const asOf = after(MAX_RETENTION_SECONDS);
      expect(retentionExpiry(retentionCutoff(asOf, seconds), seconds)).toBe(asOf);
    }
  });

  it("agrees with the predicate the read paths ask, so a swept message is never served", () => {
    const asOf = after(DEFAULT_RETENTION_SECONDS);
    const cutoff = retentionCutoff(asOf, DEFAULT_RETENTION_SECONDS);
    expect(isRetained(cutoff, DEFAULT_RETENTION_SECONDS, asOf)).toBe(false);
  });

  it("refuses a window no validated stream record could be carrying", () => {
    for (const seconds of IMPOSSIBLE_WINDOWS) {
      expect(() => retentionCutoff(RECORDED_AT, seconds)).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses an instant it cannot read", () => {
    expect(() => retentionCutoff(UNREADABLE, DEFAULT_RETENTION_SECONDS)).toThrow(
      InvalidMeshInstantError,
    );
  });
});

describe("isRetained", () => {
  it("keeps a message at the moment it was recorded", () => {
    expect(isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, RECORDED_AT)).toBe(true);
  });

  it("keeps a message one second before its window closes", () => {
    expect(isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, after(MIN_RETENTION_SECONDS - 1))).toBe(
      true,
    );
  });

  it("drops a message at exactly its expiry, the window being half-open", () => {
    expect(isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, after(MIN_RETENTION_SECONDS))).toBe(
      false,
    );
  });

  it("drops a message after its window has closed", () => {
    expect(isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, after(MIN_RETENTION_SECONDS + 1))).toBe(
      false,
    );
  });

  it("reads a message published late by a recovered relay as freshly retained", () => {
    const recordedLate = after(MAX_RETENTION_SECONDS);
    expect(isRetained(recordedLate, MIN_RETENTION_SECONDS, recordedLate)).toBe(true);
  });

  it("refuses a window no validated stream record could be carrying", () => {
    for (const seconds of IMPOSSIBLE_WINDOWS) {
      expect(() => isRetained(RECORDED_AT, seconds, after(60))).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses either instant when it cannot read it", () => {
    expect(() => isRetained(UNREADABLE, MIN_RETENTION_SECONDS, after(60))).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, UNREADABLE)).toThrow(
      InvalidMeshInstantError,
    );
  });
});

describe("assessRetention", () => {
  it("hands back a frozen verdict naming the stream it was asked about", () => {
    const verdict = assessRetention(request());
    expect(verdict.streamKey).toBe(STREAM_KEY);
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("expires where the expiry function says it does", () => {
    for (const seconds of [
      MIN_RETENTION_SECONDS,
      DEFAULT_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    ]) {
      expect(assessRetention(request({ retentionSeconds: seconds })).expiresAt).toBe(
        retentionExpiry(RECORDED_AT, seconds),
      );
    }
  });

  it("retains exactly where the predicate the read paths ask retains", () => {
    for (const elapsed of [
      0,
      1,
      MIN_RETENTION_SECONDS - 1,
      MIN_RETENTION_SECONDS,
      MIN_RETENTION_SECONDS + 1,
    ]) {
      const asOf = after(elapsed);
      expect(
        assessRetention(request({ retentionSeconds: MIN_RETENTION_SECONDS, asOf })).retained,
      ).toBe(isRetained(RECORDED_AT, MIN_RETENTION_SECONDS, asOf));
    }
  });

  it("counts down the window in whole seconds", () => {
    const verdict = assessRetention(request({ retentionSeconds: MIN_RETENTION_SECONDS }));
    expect(verdict.remainingSeconds).toBe(MIN_RETENTION_SECONDS - 60);
  });

  it("floors the remainder at zero rather than reporting a subtraction", () => {
    const verdict = assessRetention(
      request({
        retentionSeconds: MIN_RETENTION_SECONDS,
        asOf: after(MIN_RETENTION_SECONDS * 2),
      }),
    );
    expect(verdict.retained).toBe(false);
    expect(verdict.remainingSeconds).toBe(0);
    expect(verdict.expiresAt).toBe(after(MIN_RETENTION_SECONDS));
  });

  it("reports nothing remaining at exactly the expiry instant", () => {
    const verdict = assessRetention(
      request({ retentionSeconds: MIN_RETENTION_SECONDS, asOf: after(MIN_RETENTION_SECONDS) }),
    );
    expect(verdict.retained).toBe(false);
    expect(verdict.remainingSeconds).toBe(0);
  });

  it("is replayable exactly where the stream keeps a payload and the window is still open", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      for (const elapsed of [0, 60, MIN_RETENTION_SECONDS, MIN_RETENTION_SECONDS + 1]) {
        const verdict = assessRetention(
          request({ retention, retentionSeconds: MIN_RETENTION_SECONDS, asOf: after(elapsed) }),
        );
        expect(verdict.replayable).toBe(verdict.retained && isReplayable(retention));
      }
    }
  });

  it("refuses a replay of an expired message however much payload the stream kept", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const verdict = assessRetention(
        request({
          retention,
          retentionSeconds: MIN_RETENTION_SECONDS,
          asOf: after(MIN_RETENTION_SECONDS),
        }),
      );
      expect(verdict.replayable).toBe(false);
    }
  });

  it("separates a retained message that cannot be replayed from an expired one", () => {
    const kept = assessRetention(request({ retention: "none" }));
    expect(kept.retained).toBe(true);
    expect(kept.replayable).toBe(false);

    const aged = assessRetention(
      request({
        retention: "full",
        retentionSeconds: MIN_RETENTION_SECONDS,
        asOf: after(MIN_RETENTION_SECONDS),
      }),
    );
    expect(aged.retained).toBe(false);
    expect(aged.replayable).toBe(false);
  });

  it("refuses a stream record carrying a window the aggregate could not have written", () => {
    for (const retentionSeconds of IMPOSSIBLE_WINDOWS) {
      expect(() => assessRetention(request({ retentionSeconds }))).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses either instant when it cannot read it", () => {
    expect(() => assessRetention(request({ recordedAt: UNREADABLE }))).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => assessRetention(request({ asOf: UNREADABLE }))).toThrow(InvalidMeshInstantError);
  });
});
