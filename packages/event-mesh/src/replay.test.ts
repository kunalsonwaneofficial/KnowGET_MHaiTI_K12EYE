import type { ISODateString, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidMeshCountError, InvalidMeshInstantError } from "./errors";
import {
  DEFAULT_RETENTION_SECONDS,
  MAX_REPLAY_MESSAGES,
  MAX_REPLAY_WINDOW_SECONDS,
  MAX_RETENTION_SECONDS,
  PAYLOAD_RETENTIONS,
  REPLAY_STATUSES,
  STREAM_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./mesh-value";
import type { ReplayApprovalRequest, ReplayWindowRequest } from "./mesh-view";
import { inspectReplayApproval, inspectReplayWindow } from "./replay";
import { retentionCutoff } from "./retention";

const SUBSCRIPTION_KEY = "finance.ledger-projector";
const STREAM_KEY = "student-lifecycle.enrolment";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const NOW = "2027-01-02T09:15:00.000Z" as ISODateString;

/** The instant a whole number of seconds from the fixture instant. Negative values run backwards. */
const secondsFrom = (seconds: number): ISODateString =>
  new Date(Date.parse(NOW) + seconds * 1_000).toISOString() as ISODateString;

const HOUR = 3_600;
const DAY = 86_400;

const UNREADABLE = "the Tuesday after next" as ISODateString;

const REQUESTER = "1f0a5c62-0f0d-4b6a-9a2e-7d4c1b8e33a1" as Uuid;
const APPROVER = "2c7b4d19-6e5f-4a3b-8c1d-9e0f2a4b6c8d" as Uuid;
const REPLAY_ID = "3d8c5e2a-7f6a-4b5c-9d2e-0a1b3c5d7e9f" as Uuid;

/** A replay everything permits: an hour of a full-payload stream, an hour ago, to a live subscription. */
const request = (overrides: Partial<ReplayWindowRequest> = {}): ReplayWindowRequest => ({
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  fromInstant: secondsFrom(-2 * HOUR),
  toInstant: secondsFrom(-HOUR),
  messageCount: 1_000,
  retention: "full",
  retentionSeconds: DEFAULT_RETENTION_SECONDS,
  streamStatus: "active",
  subscriptionStatus: "active",
  asOf: NOW,
  ...overrides,
});

describe("inspectReplayWindow", () => {
  it("allows a window inside retention on a stream that kept its payloads", () => {
    const verdict = inspectReplayWindow(request());

    expect(verdict).toEqual({
      subscriptionKey: SUBSCRIPTION_KEY,
      allowed: true,
      refusal: null,
      windowSeconds: HOUR,
      messageCount: 1_000,
      retentionCutoff: retentionCutoff(NOW, DEFAULT_RETENTION_SECONDS),
    });
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("allows a window covering a single instant, which is nought seconds wide rather than one", () => {
    const instant = secondsFrom(-HOUR);
    const verdict = inspectReplayWindow(request({ fromInstant: instant, toInstant: instant }));

    expect(verdict.allowed).toBe(true);
    expect(verdict.windowSeconds).toBe(0);
  });

  it("carries the retention cutoff on refusals too, so a requester can re-ask unaided", () => {
    const verdict = inspectReplayWindow(
      request({ fromInstant: secondsFrom(-40 * DAY), toInstant: secondsFrom(-39 * DAY) }),
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.retentionCutoff).toBe(retentionCutoff(NOW, DEFAULT_RETENTION_SECONDS));
  });

  it("refuses a window that ends before it starts", () => {
    const verdict = inspectReplayWindow(
      request({ fromInstant: NOW, toInstant: secondsFrom(-DAY) }),
    );

    expect(verdict.refusal).toBe("window_inverted");
    expect(verdict.windowSeconds).toBe(0);
  });

  it("reports an inverted window before anything else, because a negative width clears every ceiling", () => {
    const verdict = inspectReplayWindow(
      request({
        fromInstant: NOW,
        toInstant: secondsFrom(-40 * DAY),
        retention: "none",
        streamStatus: "draft",
        subscriptionStatus: "paused",
      }),
    );

    expect(verdict.refusal).toBe("window_inverted");
  });

  it("refuses a replay of payloads the stream never kept", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const verdict = inspectReplayWindow(request({ retention }));
      if (retention === "full") {
        expect(verdict.allowed).toBe(true);
      } else {
        expect(verdict.refusal).toBe("payload_not_retained");
      }
    }
  });

  it("reports a stream that kept nothing before one that cannot be read, no request fixing either", () => {
    const verdict = inspectReplayWindow(request({ retention: "none", streamStatus: "draft" }));

    expect(verdict.refusal).toBe("payload_not_retained");
  });

  it("reads history from a retired stream, which is the replay that matters most", () => {
    for (const streamStatus of STREAM_STATUSES) {
      const verdict = inspectReplayWindow(request({ streamStatus }));
      if (streamStatus === "draft") {
        expect(verdict.refusal).toBe("stream_not_readable");
      } else {
        expect(verdict.allowed).toBe(true);
      }
    }
  });

  it("refuses to replay to a subscription that is not taking deliveries", () => {
    for (const subscriptionStatus of SUBSCRIPTION_STATUSES) {
      const verdict = inspectReplayWindow(request({ subscriptionStatus }));
      if (subscriptionStatus === "active") {
        expect(verdict.allowed).toBe(true);
      } else {
        expect(verdict.refusal).toBe("subscription_not_deliverable");
      }
    }
  });

  it("reports an unreadable stream before an undeliverable subscription", () => {
    const verdict = inspectReplayWindow(
      request({ streamStatus: "draft", subscriptionStatus: "paused" }),
    );

    expect(verdict.refusal).toBe("stream_not_readable");
  });

  it("refuses a window whose start has aged out rather than returning the part that survives", () => {
    const verdict = inspectReplayWindow(
      request({ fromInstant: secondsFrom(-31 * DAY), toInstant: secondsFrom(-HOUR) }),
    );

    expect(verdict.refusal).toBe("window_outside_retention");
  });

  it("judges retention on the start of the window, the instant that ages out first", () => {
    const justInside = inspectReplayWindow(
      request({ fromInstant: secondsFrom(-DEFAULT_RETENTION_SECONDS + 60) }),
    );
    const justOutside = inspectReplayWindow(
      request({
        fromInstant: secondsFrom(-DEFAULT_RETENTION_SECONDS - 60),
        toInstant: secondsFrom(-DEFAULT_RETENTION_SECONDS + 60),
      }),
    );

    expect(justInside.allowed).toBe(true);
    expect(justOutside.refusal).toBe("window_outside_retention");
  });

  it("reports what the world is like before what policy says about the request", () => {
    const verdict = inspectReplayWindow(
      request({ fromInstant: secondsFrom(-40 * DAY), toInstant: NOW }),
    );

    expect(verdict.refusal).toBe("window_outside_retention");
  });

  it("accepts a window exactly as wide as the ceiling and refuses one second more", () => {
    const atCeiling = inspectReplayWindow(
      request({
        fromInstant: secondsFrom(-MAX_REPLAY_WINDOW_SECONDS),
        toInstant: NOW,
        retentionSeconds: MAX_RETENTION_SECONDS,
      }),
    );
    const overCeiling = inspectReplayWindow(
      request({
        fromInstant: secondsFrom(-MAX_REPLAY_WINDOW_SECONDS - 1),
        toInstant: NOW,
        retentionSeconds: MAX_RETENTION_SECONDS,
      }),
    );

    expect(atCeiling.allowed).toBe(true);
    expect(atCeiling.windowSeconds).toBe(MAX_REPLAY_WINDOW_SECONDS);
    expect(overCeiling.refusal).toBe("window_too_wide");
  });

  it("accepts exactly the message ceiling and refuses one message more", () => {
    const atCeiling = inspectReplayWindow(request({ messageCount: MAX_REPLAY_MESSAGES }));
    const overCeiling = inspectReplayWindow(request({ messageCount: MAX_REPLAY_MESSAGES + 1 }));

    expect(atCeiling.allowed).toBe(true);
    expect(overCeiling.refusal).toBe("window_too_many_messages");
    expect(overCeiling.messageCount).toBe(MAX_REPLAY_MESSAGES + 1);
  });

  it("reports the width the requester typed before the count the store returned", () => {
    const verdict = inspectReplayWindow(
      request({
        fromInstant: secondsFrom(-MAX_REPLAY_WINDOW_SECONDS - DAY),
        toInstant: NOW,
        retentionSeconds: MAX_RETENTION_SECONDS,
        messageCount: MAX_REPLAY_MESSAGES + 1,
      }),
    );

    expect(verdict.refusal).toBe("window_too_wide");
  });

  it("refuses instants it cannot read rather than judging a window it does not understand", () => {
    expect(() => inspectReplayWindow(request({ fromInstant: UNREADABLE }))).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => inspectReplayWindow(request({ toInstant: UNREADABLE }))).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => inspectReplayWindow(request({ asOf: UNREADABLE }))).toThrow(
      InvalidMeshInstantError,
    );
  });

  it("treats a message count that is not a count as an internal fault rather than a refusal", () => {
    for (const messageCount of [-1, 1.5, Number.NaN]) {
      expect(() => inspectReplayWindow(request({ messageCount }))).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses a retention window no validated stream record could be carrying", () => {
    expect(() => inspectReplayWindow(request({ retentionSeconds: 0 }))).toThrow(
      InvalidMeshCountError,
    );
    expect(() =>
      inspectReplayWindow(request({ retentionSeconds: MAX_RETENTION_SECONDS + 1 })),
    ).toThrow(InvalidMeshCountError);
  });
});

const approval = (overrides: Partial<ReplayApprovalRequest> = {}): ReplayApprovalRequest => ({
  replayId: REPLAY_ID,
  status: "requested",
  requestedBy: REQUESTER,
  approvedBy: APPROVER,
  ...overrides,
});

describe("inspectReplayApproval", () => {
  it("accepts an approval by somebody other than the requester", () => {
    const verdict = inspectReplayApproval(approval());

    expect(verdict).toEqual({ allowed: true, refusal: null });
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("refuses an approval by the person who asked, however senior they are", () => {
    const verdict = inspectReplayApproval(approval({ approvedBy: REQUESTER }));

    expect(verdict).toEqual({ allowed: false, refusal: "self_approval" });
  });

  it("approves only a request that is still awaiting a decision", () => {
    for (const status of REPLAY_STATUSES) {
      const verdict = inspectReplayApproval(approval({ status }));
      if (status === "requested") {
        expect(verdict.allowed).toBe(true);
      } else {
        expect(verdict).toEqual({ allowed: false, refusal: "not_awaiting_approval" });
      }
    }
  });

  it("tells a late approver the decision was made rather than that they are the wrong person", () => {
    const verdict = inspectReplayApproval(approval({ status: "approved", approvedBy: REQUESTER }));

    expect(verdict.refusal).toBe("not_awaiting_approval");
  });
});
