import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyMeshKeyError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
  InvalidReplayProgressionError,
  ReasonTooLongError,
  ReasonTooShortError,
  ReplayNotApprovedError,
  ReplayRefusedError,
  ReplaySettledError,
  ReplayWindowInvertedError,
  SelfApprovedReplayError,
} from "./errors";
import {
  INITIAL_REPLAY_STATUS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  REPLAY_REFUSAL_REASONS,
  REPLAY_STATUSES,
  type ReplayStatus,
} from "./mesh-value";
import type { ReplayWindowVerdict } from "./mesh-view";
import {
  type ReplayRequest,
  type RequestReplayParams,
  approveReplay,
  cancelReplay,
  completeReplay,
  failReplay,
  isReplayRunning,
  isReplaySettled,
  rejectReplay,
  replayNeedsApproval,
  requestReplay,
  startReplay,
} from "./replay-request";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const REQUESTER = "person-1" as Uuid;
const APPROVER = "person-2" as Uuid;

/** One fixed instant and the window around it, so no assertion below depends on when the suite runs. */
const FROM = "2027-01-02T09:15:00.000Z" as ISODateString;
const TO = "2027-01-02T10:15:00.000Z" as ISODateString;
const CUTOFF = "2026-12-02T09:15:00.000Z" as ISODateString;

const REASON = "Reconciling the ledger after the projector was paused for maintenance";

/** The four ways a request ends, written out rather than derived, so the reader is checked against a list. */
const ENDINGS: readonly ReplayStatus[] = ["rejected", "completed", "failed", "cancelled"];

const verdict = (overrides: Partial<ReplayWindowVerdict> = {}): ReplayWindowVerdict => ({
  subscriptionKey: "finance.ledger-projector",
  allowed: true,
  refusal: null,
  windowSeconds: 3_600,
  messageCount: 128,
  retentionCutoff: CUTOFF,
  ...overrides,
});

const params = (overrides: Partial<RequestReplayParams> = {}): RequestReplayParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  subscriptionKey: "finance.ledger-projector",
  streamKey: "student-lifecycle.enrolment",
  fromInstant: FROM,
  toInstant: TO,
  reason: REASON,
  requestedBy: REQUESTER,
  ...overrides,
});

const settlement = { settledBy: APPROVER, reason: REASON };

const requested = (overrides: Partial<RequestReplayParams> = {}): ReplayRequest =>
  requestReplay(params(overrides));

const approved = (overrides: Partial<RequestReplayParams> = {}): ReplayRequest =>
  approveReplay(requested(overrides), { approvedBy: APPROVER, verdict: verdict() });

const running = (overrides: Partial<RequestReplayParams> = {}): ReplayRequest =>
  startReplay(approved(overrides));

const completed = (overrides: Partial<RequestReplayParams> = {}): ReplayRequest =>
  completeReplay(running(overrides), 128);

describe("raising a replay request", () => {
  it("raises a request that sends nothing until a second person agrees", () => {
    const request = requested();

    expect(request.status).toBe(INITIAL_REPLAY_STATUS);
    expect(request.status).toBe("requested");
    expect(request.approvedBy).toBeNull();
    expect(request.approvedAt).toBeNull();
    expect(request.messageCount).toBeNull();
    expect(request.startedAt).toBeNull();
    expect(request.settledAt).toBeNull();
    expect(request.deliveredCount).toBeNull();
    expect(replayNeedsApproval(request)).toBe(true);
  });

  it("names the one subscription the window goes to, because a replay is never a broadcast", () => {
    expect(requested().subscriptionId).toBe(SUBSCRIPTION);
    expect(requested().requestedBy).toBe(REQUESTER);
  });

  it("normalises both keys, so one consumer spelled two ways is one consumer", () => {
    const request = requested({
      subscriptionKey: " Finance.Ledger-Projector ",
      streamKey: "Student-Lifecycle.Enrolment",
    });

    expect(request.subscriptionKey).toBe("finance.ledger-projector");
    expect(request.streamKey).toBe("student-lifecycle.enrolment");
  });

  it("refuses a blank key wherever one is blank, and one that is not a key at all", () => {
    expect(() => requested({ subscriptionKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => requested({ streamKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => requested({ streamKey: "student lifecycle!" })).toThrow(InvalidMeshKeyError);
  });

  it("normalises both bounds to the width the window is compared at", () => {
    const request = requested({
      fromInstant: "2027-01-02T09:15:00Z" as ISODateString,
      toInstant: "2027-01-02T11:15:00+01:00" as ISODateString,
    });

    expect(request.fromInstant).toBe("2027-01-02T09:15:00.000Z");
    expect(request.toInstant).toBe("2027-01-02T10:15:00.000Z");
  });

  it("refuses a bound it cannot read as a moment in time, at either end", () => {
    expect(() => requested({ fromInstant: "last tuesday" as ISODateString })).toThrow(
      InvalidMeshInstantError,
    );
    expect(() => requested({ toInstant: "soon" as ISODateString })).toThrow(
      InvalidMeshInstantError,
    );
  });

  it("refuses a window that ends before it starts, which nobody could sensibly approve", () => {
    expect(() => requested({ fromInstant: TO, toInstant: FROM })).toThrow(
      ReplayWindowInvertedError,
    );
  });

  it("accepts a window from a moment to itself, since both bounds are inclusive", () => {
    const request = requested({ toInstant: FROM });

    expect(request.fromInstant).toBe(FROM);
    expect(request.toInstant).toBe(FROM);
  });

  it("insists on a justification an approver can actually read", () => {
    expect(() => requested({ reason: "x".repeat(MIN_REASON_LENGTH - 1) })).toThrow(
      ReasonTooShortError,
    );
    expect(() => requested({ reason: "x".repeat(MAX_REASON_LENGTH + 1) })).toThrow(
      ReasonTooLongError,
    );
  });

  it("trims the justification, so padding is not what makes one long enough to accept", () => {
    expect(requested({ reason: `  ${REASON}  ` }).reason).toBe(REASON);
    expect(() => requested({ reason: `    ${"x".repeat(MIN_REASON_LENGTH - 1)}    ` })).toThrow(
      ReasonTooShortError,
    );
  });
});

describe("approving a replay request", () => {
  it("records who agreed, when, and the count they were shown", () => {
    const request = approved();

    expect(request.status).toBe("approved");
    expect(request.approvedBy).toBe(APPROVER);
    expect(request.approvedAt).not.toBeNull();
    expect(request.messageCount).toBe(128);
    expect(replayNeedsApproval(request)).toBe(false);
  });

  it("refuses an approval by the person who asked, whoever that person is", () => {
    expect(() => approveReplay(requested(), { approvedBy: REQUESTER, verdict: verdict() })).toThrow(
      SelfApprovedReplayError,
    );
  });

  it("refuses an approval granted against a refusing verdict, for every reason there is", () => {
    for (const refusal of REPLAY_REFUSAL_REASONS) {
      expect(() =>
        approveReplay(requested(), {
          approvedBy: APPROVER,
          verdict: verdict({ allowed: false, refusal }),
        }),
      ).toThrow(ReplayRefusedError);
    }
  });

  it("asks who is approving before it asks about the window", () => {
    expect(() =>
      approveReplay(requested(), {
        approvedBy: REQUESTER,
        verdict: verdict({ allowed: false, refusal: "window_too_wide" }),
      }),
    ).toThrow(SelfApprovedReplayError);
  });

  it("refuses to approve a request that somebody has already approved", () => {
    expect(() => approveReplay(approved(), { approvedBy: APPROVER, verdict: verdict() })).toThrow(
      InvalidReplayProgressionError,
    );
  });

  it("reports an ended request as ended rather than as an illegal move", () => {
    const request = rejectReplay(requested(), settlement);

    expect(() => approveReplay(request, { approvedBy: APPROVER, verdict: verdict() })).toThrow(
      ReplaySettledError,
    );
  });
});

describe("running a replay request", () => {
  it("refuses to start a request nobody has approved, naming the approval rather than the move", () => {
    expect(() => startReplay(requested())).toThrow(ReplayNotApprovedError);
  });

  it("stamps the instant the messages start going out", () => {
    const request = running();

    expect(request.status).toBe("running");
    expect(request.startedAt).not.toBeNull();
    expect(isReplayRunning(request)).toBe(true);
    expect(request.settledAt).toBeNull();
  });

  it("keeps the approval on the record once the run has started", () => {
    const request = running();

    expect(request.approvedBy).toBe(APPROVER);
    expect(request.messageCount).toBe(128);
  });

  it("refuses to start a run that is already running", () => {
    expect(() => startReplay(running())).toThrow(InvalidReplayProgressionError);
  });

  it("refuses to start a request that has already ended", () => {
    expect(() => startReplay(cancelReplay(approved(), settlement))).toThrow(ReplaySettledError);
  });
});

describe("ending a replay request", () => {
  it("completes with the count that actually went out, and names nobody", () => {
    const request = completed();

    expect(request.status).toBe("completed");
    expect(request.deliveredCount).toBe(128);
    expect(request.settledAt).not.toBeNull();
    expect(request.settledBy).toBeNull();
    expect(isReplaySettled(request)).toBe(true);
  });

  it("completes a run that delivered nothing, which is a legitimate answer", () => {
    expect(completeReplay(running(), 0).deliveredCount).toBe(0);
  });

  it("records the gap between what was approved and what went out", () => {
    const request = completeReplay(running(), 6);

    expect(request.messageCount).toBe(128);
    expect(request.deliveredCount).toBe(6);
  });

  it("fails with what stopped the run and how far it had got", () => {
    const request = failReplay(running(), { deliveredCount: 40, reason: REASON });

    expect(request.status).toBe("failed");
    expect(request.deliveredCount).toBe(40);
    expect(request.settlementReason).toBe(REASON);
    expect(request.settledBy).toBeNull();
    expect(isReplaySettled(request)).toBe(true);
  });

  it("treats a delivered count that is not a count as an internal fault rather than a refusal", () => {
    for (const deliveredCount of [-1, 1.5, Number.NaN]) {
      expect(() => completeReplay(running(), deliveredCount)).toThrow(InvalidMeshCountError);
      expect(() => failReplay(running(), { deliveredCount, reason: REASON })).toThrow(
        InvalidMeshCountError,
      );
    }
  });

  it("refuses to end a run that never started", () => {
    expect(() => completeReplay(approved(), 0)).toThrow(InvalidReplayProgressionError);
    expect(() => failReplay(approved(), { deliveredCount: 0, reason: REASON })).toThrow(
      InvalidReplayProgressionError,
    );
  });

  it("declines a request before it runs, naming who declined it and why", () => {
    const request = rejectReplay(requested(), settlement);

    expect(request.status).toBe("rejected");
    expect(request.settledBy).toBe(APPROVER);
    expect(request.settlementReason).toBe(REASON);
    expect(request.deliveredCount).toBeNull();
    expect(isReplaySettled(request)).toBe(true);
  });

  it("refuses to decline a request that is already running, which is a cancellation instead", () => {
    expect(() => rejectReplay(running(), settlement)).toThrow(InvalidReplayProgressionError);
  });

  it("calls the whole thing off from every state before it has ended", () => {
    expect(cancelReplay(requested(), settlement).status).toBe("cancelled");
    expect(cancelReplay(approved(), settlement).status).toBe("cancelled");
    expect(cancelReplay(running(), settlement).status).toBe("cancelled");
  });

  it("records no delivered count on a cancellation, because the figure would be the wrong one", () => {
    const request = cancelReplay(running(), settlement);

    expect(request.deliveredCount).toBeNull();
    expect(request.settledBy).toBe(APPROVER);
    expect(request.settlementReason).toBe(REASON);
  });

  it("insists on an explanation for a rejection and for a cancellation alike", () => {
    const tooShort = { settledBy: APPROVER, reason: "x".repeat(MIN_REASON_LENGTH - 1) };
    const tooLong = { settledBy: APPROVER, reason: "x".repeat(MAX_REASON_LENGTH + 1) };

    expect(() => rejectReplay(requested(), tooShort)).toThrow(ReasonTooShortError);
    expect(() => cancelReplay(requested(), tooLong)).toThrow(ReasonTooLongError);
  });

  it("insists on an explanation for a failure too, so a failed row says what to do next", () => {
    expect(() =>
      failReplay(running(), { deliveredCount: 0, reason: "x".repeat(MIN_REASON_LENGTH - 1) }),
    ).toThrow(ReasonTooShortError);
  });

  it("refuses every move out of an ended request, whichever move it is", () => {
    const request = completed();

    expect(() => approveReplay(request, { approvedBy: APPROVER, verdict: verdict() })).toThrow(
      ReplaySettledError,
    );
    expect(() => startReplay(request)).toThrow(ReplaySettledError);
    expect(() => completeReplay(request, 0)).toThrow(ReplaySettledError);
    expect(() => failReplay(request, { deliveredCount: 0, reason: REASON })).toThrow(
      ReplaySettledError,
    );
    expect(() => rejectReplay(request, settlement)).toThrow(ReplaySettledError);
    expect(() => cancelReplay(request, settlement)).toThrow(ReplaySettledError);
  });

  it("keeps the window and the justification on the record after it has ended", () => {
    const request = completed();

    expect(request.fromInstant).toBe(FROM);
    expect(request.toInstant).toBe(TO);
    expect(request.reason).toBe(REASON);
    expect(request.requestedBy).toBe(REQUESTER);
  });
});

describe("reading a replay request", () => {
  it("reports itself running for exactly one status", () => {
    for (const status of REPLAY_STATUSES) {
      const request: ReplayRequest = { ...requested(), status };
      expect(isReplayRunning(request)).toBe(status === "running");
    }
  });

  it("reports itself awaiting approval for exactly one status", () => {
    for (const status of REPLAY_STATUSES) {
      const request: ReplayRequest = { ...requested(), status };
      expect(replayNeedsApproval(request)).toBe(status === "requested");
    }
  });

  it("reports itself ended for exactly the four endings", () => {
    for (const status of REPLAY_STATUSES) {
      const request: ReplayRequest = { ...requested(), status };
      expect(isReplaySettled(request)).toBe(ENDINGS.includes(status));
    }
  });
});
