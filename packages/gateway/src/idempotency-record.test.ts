import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyGatewayKeyError,
  IdempotencyKeyConflictError,
  IdempotencyKeyTooLongError,
  IdempotencyRecordSettledError,
  InvalidGatewayKeyError,
  InvalidRecordedStatusError,
  OperationInFlightError,
} from "./errors";
import { IDEMPOTENCY_RETENTION_SECONDS, MAX_IDEMPOTENCY_KEY_LENGTH } from "./gateway-value";
import type { IdempotencyProbe } from "./gateway-view";
import {
  type BeginIdempotentOperationParams,
  type IdempotencyRecord,
  beginIdempotentOperation,
  completeIdempotentOperation,
  inspectIdempotency,
  isIdempotencyRecordExpired,
  isIdempotencyRecordSettled,
  markIdempotencyConflict,
  requireIdempotencyKey,
  requireUsableIdempotency,
} from "./idempotency-record";

const TENANT = "6f1c0e2a-9b3d-4a17-8c25-1d7e4b9a0c33" as TenantId;
const ORG = "b2d4a6c8-0e1f-4a3b-9c5d-7e8f0a1b2c3d" as Uuid;
const CONSUMER = "3c9e1f52-7a84-4d16-b0c9-2e5f8a7d4b61" as Uuid;
const KEY = "6b1f8a90-4c2d-4e77-9a13-5d0e8f2b7c46";
const FINGERPRINT = "sha256:9f2c1b3d4e5a6f708192a3b4c5d6e7f8";
const OTHER_FINGERPRINT = "sha256:0102030405060708090a0b0c0d0e0f10";
const AT = "2026-07-17T10:00:00.000Z" as ISODateString;

/** Instants are derived from a record's own stamps, so no assertion here depends on the wall clock. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const params = (
  overrides: Partial<BeginIdempotentOperationParams> = {},
): BeginIdempotentOperationParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  consumerId: CONSUMER,
  idempotencyKey: KEY,
  capabilityKey: "admissions.application.submit",
  method: "POST",
  payloadFingerprint: FINGERPRINT,
  asOf: AT,
  ...overrides,
});

const begun = (overrides: Partial<BeginIdempotentOperationParams> = {}): IdempotencyRecord =>
  beginIdempotentOperation(params(overrides));

const completed = (statusCode = 201): IdempotencyRecord =>
  completeIdempotentOperation(begun(), { statusCode, responseRef: "store:responses/7f3a" }, AT);

const probe = (overrides: Partial<IdempotencyProbe> = {}): IdempotencyProbe => ({
  idempotencyKey: KEY,
  payloadFingerprint: FINGERPRINT,
  asOf: AT,
  ...overrides,
});

describe("claiming a key", () => {
  it("opens the ledger in flight, with nothing recorded against it yet", () => {
    const record = begun();

    expect(record.state).toBe("in_flight");
    expect(record.recordedStatus).toBeNull();
    expect(record.responseRef).toBeNull();
    expect(record.completedAt).toBeNull();
    expect(record.conflictedAt).toBeNull();
  });

  it("stamps the lifetime on the row, measured from the instant the caller supplied", () => {
    const record = begun();

    expect(record.expiresAt).toBe(shift(AT, IDEMPOTENCY_RETENTION_SECONDS));
  });

  it("keeps the caller's key exactly as they wrote it, apart from transport whitespace", () => {
    expect(begun({ idempotencyKey: "  Order-99/A  " }).idempotencyKey).toBe("Order-99/A");
  });

  it("normalises the platform's own key, because that one names something we resolve", () => {
    expect(begun({ capabilityKey: "  Admissions.Application.Submit " }).capabilityKey).toBe(
      "admissions.application.submit",
    );
  });

  it("refuses a blank key and a blank fingerprint", () => {
    expect(() => begun({ idempotencyKey: "   " })).toThrow(EmptyGatewayKeyError);
    expect(() => begun({ payloadFingerprint: "  " })).toThrow(EmptyGatewayKeyError);
  });

  it("refuses a key too long to be a key rather than hashing it into one", () => {
    const oversized = "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1);

    expect(() => begun({ idempotencyKey: oversized })).toThrow(IdempotencyKeyTooLongError);
    expect(
      begun({ idempotencyKey: "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH) }).idempotencyKey,
    ).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
  });

  it("refuses a capability key that does not fit the platform's grammar", () => {
    expect(() => begun({ capabilityKey: "admissions..submit" })).toThrow(InvalidGatewayKeyError);
  });

  it("accepts a digest of any shape, because the algorithm is not this module's business", () => {
    expect(begun({ payloadFingerprint: "blake3-7c1a" }).payloadFingerprint).toBe("blake3-7c1a");
  });

  it("records what the key was spent on, so a stale row can still be explained", () => {
    const record = begun({ capabilityKey: "finance.invoice.issue", method: "PUT" });

    expect(record.capabilityKey).toBe("finance.invoice.issue");
    expect(record.method).toBe("PUT");
  });
});

describe("recording what happened", () => {
  it("keeps the status a replay will answer with, and a handle to the body", () => {
    const record = completed(201);

    expect(record.state).toBe("completed");
    expect(record.recordedStatus).toBe(201);
    expect(record.responseRef).toBe("store:responses/7f3a");
    expect(record.completedAt).toBe(AT);
  });

  it("accepts an operation that produced no body at all", () => {
    const record = completeIdempotentOperation(begun(), { statusCode: 204, responseRef: null }, AT);

    expect(record.recordedStatus).toBe(204);
    expect(record.responseRef).toBeNull();
  });

  it("reads a blank handle as no body rather than as a handle to nothing", () => {
    const record = completeIdempotentOperation(begun(), { statusCode: 200, responseRef: "  " }, AT);

    expect(record.responseRef).toBeNull();
  });

  it("completes a refusal as readily as a success, because a refusal is repeatable too", () => {
    expect(completed(422).recordedStatus).toBe(422);
  });

  it("refuses a status that is not a status, since this number is replayed to a caller", () => {
    expect(() =>
      completeIdempotentOperation(begun(), { statusCode: 0, responseRef: null }, AT),
    ).toThrow(InvalidRecordedStatusError);
    expect(() =>
      completeIdempotentOperation(begun(), { statusCode: 1_200, responseRef: null }, AT),
    ).toThrow(InvalidRecordedStatusError);
  });

  it("keeps a defect in our own handler off the integrator's screen", () => {
    try {
      completeIdempotentOperation(begun(), { statusCode: -1, responseRef: null }, AT);
      expect.unreachable("a nonsense status should not have been recorded");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRecordedStatusError);
      expect((error as InvalidRecordedStatusError).isOperational).toBe(false);
    }
  });

  it("refuses a second completion, so one key cannot come to mean two answers", () => {
    const record = completed();

    expect(() =>
      completeIdempotentOperation(record, { statusCode: 200, responseRef: null }, AT),
    ).toThrow(IdempotencyRecordSettledError);
  });
});

describe("a key two different requests are outstanding under", () => {
  it("marks the claim collided while it is still in flight", () => {
    const record = markIdempotencyConflict(begun(), AT);

    expect(record.state).toBe("conflicted");
    expect(record.conflictedAt).toBe(AT);
  });

  it("refuses the completion that arrives afterwards", () => {
    const record = markIdempotencyConflict(begun(), AT);

    expect(() =>
      completeIdempotentOperation(record, { statusCode: 201, responseRef: null }, AT),
    ).toThrow(IdempotencyRecordSettledError);
  });

  it("leaves a completed record alone, because its answer belongs to a known request", () => {
    expect(() => markIdempotencyConflict(completed(), AT)).toThrow(IdempotencyRecordSettledError);
  });

  it("does not collide twice", () => {
    const record = markIdempotencyConflict(begun(), AT);

    expect(() => markIdempotencyConflict(record, AT)).toThrow(IdempotencyRecordSettledError);
  });
});

describe("how long a record lasts", () => {
  it("honours the record right up to the instant retention runs out", () => {
    const record = begun();
    const lastMoment = shift(record.expiresAt, -1);

    expect(isIdempotencyRecordExpired(record, lastMoment)).toBe(false);
    expect(isIdempotencyRecordExpired(record, record.expiresAt)).toBe(true);
  });

  it("expires a completed record as readily as an unfinished one", () => {
    const record = completed();

    expect(isIdempotencyRecordExpired(record, shift(record.expiresAt, 60))).toBe(true);
  });

  it("says whether the record can still be written against", () => {
    expect(isIdempotencyRecordSettled(begun())).toBe(false);
    expect(isIdempotencyRecordSettled(completed())).toBe(true);
    expect(isIdempotencyRecordSettled(markIdempotencyConflict(begun(), AT))).toBe(true);
  });
});

describe("what the ledger says about a key", () => {
  it("lets an unseen key straight through", () => {
    expect(inspectIdempotency(null, probe())).toEqual({
      disposition: "proceed",
      recordedStatus: null,
      recordedAt: null,
      expired: false,
    });
  });

  it("hands back the earlier answer for the same request", () => {
    const record = completed(201);

    expect(inspectIdempotency(record, probe())).toEqual({
      disposition: "replay",
      recordedStatus: 201,
      recordedAt: AT,
      expired: false,
    });
  });

  it("makes a concurrent retry wait rather than doubling the work", () => {
    expect(inspectIdempotency(begun(), probe()).disposition).toBe("in_flight");
  });

  it("refuses a key reused for a different request", () => {
    const verdict = inspectIdempotency(
      completed(),
      probe({ payloadFingerprint: OTHER_FINGERPRINT }),
    );

    expect(verdict.disposition).toBe("conflict");
    expect(verdict.recordedStatus).toBeNull();
    expect(verdict.recordedAt).toBeNull();
  });

  it("tells nobody anything once the key has collided, however well their fingerprint matches", () => {
    const record = markIdempotencyConflict(begun(), AT);

    expect(inspectIdempotency(record, probe()).disposition).toBe("conflict");
  });

  it("treats keys as case-sensitive, whatever collation the store looked them up under", () => {
    const record = begun({ idempotencyKey: "Order-99" });

    expect(inspectIdempotency(record, probe({ idempotencyKey: "order-99" })).disposition).toBe(
      "conflict",
    );
  });

  it("proceeds past a record that has aged out, and says that is what happened", () => {
    const record = completed();
    const verdict = inspectIdempotency(record, probe({ asOf: shift(record.expiresAt, 1) }));

    expect(verdict.disposition).toBe("proceed");
    expect(verdict.expired).toBe(true);
    expect(verdict.recordedStatus).toBeNull();
  });

  it("judges a recycled key on nothing an unrelated operation left behind", () => {
    const record = completed();
    const verdict = inspectIdempotency(
      record,
      probe({ asOf: shift(record.expiresAt, 1), payloadFingerprint: OTHER_FINGERPRINT }),
    );

    expect(verdict.disposition).toBe("proceed");
  });

  it("refuses a probe carrying no key or no fingerprint before it consults anything", () => {
    expect(() => inspectIdempotency(null, probe({ idempotencyKey: " " }))).toThrow(
      EmptyGatewayKeyError,
    );
    expect(() => inspectIdempotency(null, probe({ payloadFingerprint: "" }))).toThrow(
      EmptyGatewayKeyError,
    );
  });

  it("hands back something a caller cannot quietly amend", () => {
    expect(Object.isFrozen(inspectIdempotency(null, probe()))).toBe(true);
    expect(Object.isFrozen(inspectIdempotency(completed(), probe()))).toBe(true);
  });
});

describe("turning a verdict into a response", () => {
  it("says nothing about the two dispositions that are successes", () => {
    expect(() => requireUsableIdempotency(inspectIdempotency(null, probe()), KEY)).not.toThrow();
    expect(() =>
      requireUsableIdempotency(inspectIdempotency(completed(), probe()), KEY),
    ).not.toThrow();
  });

  it("asks a caller who arrived too early to come back", () => {
    expect(() => requireUsableIdempotency(inspectIdempotency(begun(), probe()), KEY)).toThrow(
      OperationInFlightError,
    );
  });

  it("tells a caller who reused a key that they have a bug, not that they should retry", () => {
    const verdict = inspectIdempotency(
      completed(),
      probe({ payloadFingerprint: OTHER_FINGERPRINT }),
    );

    expect(() => requireUsableIdempotency(verdict, KEY)).toThrow(IdempotencyKeyConflictError);
  });
});

describe("accepting a key on its own", () => {
  it("trims a key and refuses an empty or oversized one", () => {
    expect(requireIdempotencyKey(" abc ")).toBe("abc");
    expect(() => requireIdempotencyKey("\t\n")).toThrow(EmptyGatewayKeyError);
    expect(() => requireIdempotencyKey("k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1))).toThrow(
      IdempotencyKeyTooLongError,
    );
  });
});
