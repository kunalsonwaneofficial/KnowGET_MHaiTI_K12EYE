import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  type DeadLetter,
  type RecordDeadLetterParams,
  discardDeadLetter,
  isDeadLetterOpen,
  isDeadLetterRetriable,
  recordDeadLetter,
  replayDeadLetter,
} from "./dead-letter";
import { RETRIABLE_FAILURE_REASONS } from "./delivery";
import {
  DeadLetterNotReplayableError,
  DeadLetterSettledError,
  EmptyMeshKeyError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
  ReasonTooLongError,
  ReasonTooShortError,
} from "./errors";
import {
  DEAD_LETTER_REASONS,
  DEAD_LETTER_STATUSES,
  INITIAL_DEAD_LETTER_STATUS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "./mesh-value";
import { FIRST_PARTITION } from "./partitioning";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPERATOR = "person-1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const MESSAGE = "message-1" as Uuid;
const EVENT = "event-1" as Uuid;
const REPLAY = "replay-1" as Uuid;

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const FAILED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;

const DISCARD_REASON = "Superseded by a corrected enrolment raised the following morning";

const params = (overrides: Partial<RecordDeadLetterParams> = {}): RecordDeadLetterParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  subscriptionKey: "finance.ledger-projector",
  streamKey: "student-lifecycle.enrolment",
  messageId: MESSAGE,
  eventId: EVENT,
  eventTypeKey: "student.enrolled",
  partition: 3,
  sequence: 412,
  reason: "consumer_error",
  attempts: 5,
  traceId: "trace-8f21",
  failedAt: FAILED_AT,
  ...overrides,
});

const recorded = (overrides: Partial<RecordDeadLetterParams> = {}): DeadLetter =>
  recordDeadLetter(params(overrides));

const replayed = (overrides: Partial<RecordDeadLetterParams> = {}): DeadLetter =>
  replayDeadLetter(recorded(overrides), REPLAY, OPERATOR);

const discarded = (overrides: Partial<RecordDeadLetterParams> = {}): DeadLetter =>
  discardDeadLetter(recorded(overrides), { discardedBy: OPERATOR, reason: DISCARD_REASON });

describe("recording a dead letter", () => {
  it("records a letter nobody has decided about, pointing at no replay and no reason", () => {
    const letter = recorded();

    expect(letter.status).toBe(INITIAL_DEAD_LETTER_STATUS);
    expect(letter.status).toBe("open");
    expect(letter.settledAt).toBeNull();
    expect(letter.settledBy).toBeNull();
    expect(letter.discardReason).toBeNull();
    expect(letter.replayId).toBeNull();
    expect(isDeadLetterOpen(letter)).toBe(true);
  });

  it("keeps the message, the event and the position, which is everything a replay would need", () => {
    const letter = recorded();

    expect(letter.messageId).toBe(MESSAGE);
    expect(letter.eventId).toBe(EVENT);
    expect(letter.partition).toBe(3);
    expect(letter.sequence).toBe(412);
    expect(letter.attempts).toBe(5);
    expect(letter.traceId).toBe("trace-8f21");
  });

  it("normalises all three keys, so one failing consumer is one thing to group by", () => {
    const letter = recorded({
      subscriptionKey: "  Finance.Ledger-Projector ",
      streamKey: "Student-Lifecycle.Enrolment",
      eventTypeKey: " Student.Enrolled ",
    });

    expect(letter.subscriptionKey).toBe("finance.ledger-projector");
    expect(letter.streamKey).toBe("student-lifecycle.enrolment");
    expect(letter.eventTypeKey).toBe("student.enrolled");
  });

  it("refuses a blank key wherever one is blank", () => {
    expect(() => recorded({ subscriptionKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => recorded({ streamKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => recorded({ eventTypeKey: "  " })).toThrow(EmptyMeshKeyError);
  });

  it("refuses a key that is not one, since a triage screen groups by all three", () => {
    expect(() => recorded({ subscriptionKey: "finance ledger!" })).toThrow(InvalidMeshKeyError);
    expect(() => recorded({ eventTypeKey: "student enrolled!" })).toThrow(InvalidMeshKeyError);
  });

  it("normalises the failure instant to the width the column has to sort on", () => {
    const letter = recorded({ failedAt: "2027-01-02T09:15:00Z" as ISODateString });

    expect(letter.failedAt).toBe("2027-01-02T09:15:00.000Z");
  });

  it("refuses an instant it cannot read as a moment in time", () => {
    expect(() => recorded({ failedAt: "yesterday" as ISODateString })).toThrow(
      InvalidMeshInstantError,
    );
  });

  it("records every reason the mesh is able to give up for", () => {
    for (const reason of DEAD_LETTER_REASONS) {
      expect(recorded({ reason }).reason).toBe(reason);
    }
  });

  it("accepts the first partition, the first sequence and a single attempt", () => {
    const letter = recorded({ partition: FIRST_PARTITION, sequence: 1, attempts: 1 });

    expect(letter.partition).toBe(FIRST_PARTITION);
    expect(letter.sequence).toBe(1);
    expect(letter.attempts).toBe(1);
  });

  it("treats a position that is not a position as an internal fault rather than a refusal", () => {
    for (const partition of [-1, 1.5, Number.NaN]) {
      expect(() => recorded({ partition })).toThrow(InvalidMeshCountError);
    }
    for (const sequence of [0, -1, 2.5]) {
      expect(() => recorded({ sequence })).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses an attempt count below one, because a message nobody tried has not failed", () => {
    for (const attempts of [0, -1, 1.5, Number.NaN]) {
      expect(() => recorded({ attempts })).toThrow(InvalidMeshCountError);
    }
  });
});

describe("settling a dead letter", () => {
  it("closes it against the replay that sent the message again, and names who ran it", () => {
    const letter = replayed();

    expect(letter.status).toBe("replayed");
    expect(letter.replayId).toBe(REPLAY);
    expect(letter.settledBy).toBe(OPERATOR);
    expect(letter.settledAt).not.toBeNull();
    expect(isDeadLetterOpen(letter)).toBe(false);
  });

  it("closes it with the reason somebody gave for losing the fact permanently", () => {
    const letter = discarded();

    expect(letter.status).toBe("discarded");
    expect(letter.discardReason).toBe(DISCARD_REASON);
    expect(letter.settledBy).toBe(OPERATOR);
    expect(letter.settledAt).not.toBeNull();
    expect(isDeadLetterOpen(letter)).toBe(false);
  });

  it("leaves the discard reason unset on a replay and the replay unset on a discard", () => {
    expect(replayed().discardReason).toBeNull();
    expect(discarded().replayId).toBeNull();
  });

  it("refuses to replay a discarded letter, which would reverse a decision nobody recorded", () => {
    expect(() => replayDeadLetter(discarded(), REPLAY, OPERATOR)).toThrow(
      DeadLetterNotReplayableError,
    );
  });

  it("refuses to replay a letter that was already replayed, since the second one is a new letter", () => {
    expect(() => replayDeadLetter(replayed(), REPLAY, OPERATOR)).toThrow(
      DeadLetterNotReplayableError,
    );
  });

  it("refuses to discard a letter that was already settled, whichever way it was settled", () => {
    const discard = { discardedBy: OPERATOR, reason: DISCARD_REASON };

    expect(() => discardDeadLetter(replayed(), discard)).toThrow(DeadLetterSettledError);
    expect(() => discardDeadLetter(discarded(), discard)).toThrow(DeadLetterSettledError);
  });

  it("insists on an explanation long enough to be one and short enough to be a record", () => {
    expect(() =>
      discardDeadLetter(recorded(), {
        discardedBy: OPERATOR,
        reason: "x".repeat(MIN_REASON_LENGTH - 1),
      }),
    ).toThrow(ReasonTooShortError);
    expect(() =>
      discardDeadLetter(recorded(), {
        discardedBy: OPERATOR,
        reason: "x".repeat(MAX_REASON_LENGTH + 1),
      }),
    ).toThrow(ReasonTooLongError);
  });

  it("accepts both ends of the range an explanation may occupy", () => {
    const shortest = discardDeadLetter(recorded(), {
      discardedBy: OPERATOR,
      reason: "x".repeat(MIN_REASON_LENGTH),
    });
    const longest = discardDeadLetter(recorded(), {
      discardedBy: OPERATOR,
      reason: "x".repeat(MAX_REASON_LENGTH),
    });

    expect(shortest.discardReason).toHaveLength(MIN_REASON_LENGTH);
    expect(longest.discardReason).toHaveLength(MAX_REASON_LENGTH);
  });

  it("trims the explanation, so padding is not what makes one long enough to accept", () => {
    expect(() =>
      discardDeadLetter(recorded(), {
        discardedBy: OPERATOR,
        reason: `    ${"x".repeat(MIN_REASON_LENGTH - 1)}    `,
      }),
    ).toThrow(ReasonTooShortError);
  });

  it("keeps what failed and when on the record after somebody has settled it", () => {
    const letter = discarded();

    expect(letter.reason).toBe("consumer_error");
    expect(letter.attempts).toBe(5);
    expect(letter.failedAt).toBe(FAILED_AT);
    expect(letter.traceId).toBe("trace-8f21");
  });
});

describe("reading a dead letter", () => {
  it("reports itself open for exactly one status", () => {
    for (const status of DEAD_LETTER_STATUSES) {
      const letter: DeadLetter = { ...recorded(), status };
      expect(isDeadLetterOpen(letter)).toBe(status === "open");
    }
  });

  it("answers the retriable question from the same list the delivery engine acted on", () => {
    for (const reason of DEAD_LETTER_REASONS) {
      expect(isDeadLetterRetriable(recorded({ reason }))).toBe(
        RETRIABLE_FAILURE_REASONS.includes(reason),
      );
    }
  });

  it("calls a discarded letter retriable where its failure was, which is a hint and not a state", () => {
    const letter = discarded({ reason: "timeout" });

    expect(isDeadLetterRetriable(letter)).toBe(true);
    expect(letter.status).toBe("discarded");
    expect(isDeadLetterOpen(letter)).toBe(false);
  });
});
