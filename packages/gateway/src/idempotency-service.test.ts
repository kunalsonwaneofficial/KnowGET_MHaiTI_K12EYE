import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyGatewayKeyError,
  IdempotencyKeyConflictError,
  IdempotencyKeyTooLongError,
  IdempotencyRecordNotFoundError,
  IdempotencyRecordSettledError,
  InvalidGatewayKeyError,
  InvalidRecordedStatusError,
  OperationInFlightError,
} from "./errors";
import { IDEMPOTENCY_CONFLICT_DETECTED } from "./gateway-events";
import { IDEMPOTENCY_RETENTION_SECONDS, MAX_IDEMPOTENCY_KEY_LENGTH } from "./gateway-value";
import type { BeginIdempotentOperationParams, OperationResult } from "./idempotency-record";
import { IdempotencyService } from "./idempotency-service";
import { InMemoryIdempotencyRecordRepository } from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const CONSUMER = "consumer-1" as Uuid;
const SECOND_CONSUMER = "consumer-2" as Uuid;
const MISSING = "record-absent" as Uuid;

/**
 * The instant the operation began, as the composition root observed it.
 *
 * A literal rather than a stamp read off a record, because retention is measured from an argument the caller
 * hands in and never from a clock inside the ledger — so every expiry assertion below is exact.
 */
const BEGAN = "2026-03-01T09:00:00.000Z" as ISODateString;

/** The caller's opaque token, in mixed case, because the ledger is required not to fold it. */
const KEY = "Order-7F3A_2026";
const CAPABILITY = "admissions.applications";
const FINGERPRINT = "sha256:8f14e45fceea167a5a36dedd4bea2543";
const OTHER_FINGERPRINT = "sha256:1f0e3dad99908345f7439f8ffabdffc4";
const RESPONSE = "objectstore:gateway/responses/9f2c";

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

/** Seconds from an instant the caller named, so retention arithmetic is stated rather than approximated. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const gapSeconds = (from: ISODateString, to: ISODateString | null): number =>
  to === null ? Number.NaN : (Date.parse(to) - Date.parse(from)) / 1_000;

const harness = () => {
  const repository = new InMemoryIdempotencyRecordRepository();
  const events = recorder();
  const service = new IdempotencyService({ repository, events });
  return { repository, events, service };
};

const params = (
  overrides: Partial<BeginIdempotentOperationParams> = {},
): BeginIdempotentOperationParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  consumerId: CONSUMER,
  idempotencyKey: KEY,
  capabilityKey: CAPABILITY,
  method: "POST",
  payloadFingerprint: FINGERPRINT,
  asOf: BEGAN,
  ...overrides,
});

const result = (overrides: Partial<OperationResult> = {}): OperationResult => ({
  statusCode: 201,
  responseRef: RESPONSE,
  ...overrides,
});

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("IdempotencyService — claiming a key", () => {
  it("claims an unused key and hands back a record to complete", async () => {
    const { service } = harness();

    const guarded = await service.begin(params());

    expect(guarded.disposition).toBe("proceed");
    expect(guarded.record.state).toBe("in_flight");
    expect(guarded.record.recordedStatus).toBeNull();
    expect(guarded.record.completedAt).toBeNull();
    expect(guarded.verdict.disposition).toBe("proceed");
    expect(guarded.verdict.expired).toBe(false);
  });

  it("measures retention from the instant the caller named, not from a clock inside", async () => {
    const { service } = harness();

    const guarded = await service.begin(params());

    expect(gapSeconds(BEGAN, guarded.record.expiresAt)).toBe(IDEMPOTENCY_RETENTION_SECONDS);
  });

  it("keeps the caller's token as they wrote it, trimming only the transport's whitespace", async () => {
    const { service } = harness();

    const guarded = await service.begin(params({ idempotencyKey: `  ${KEY}  ` }));

    expect(guarded.record.idempotencyKey).toBe(KEY);
  });

  it("never folds case, so two spellings a client believes are distinct stay distinct", async () => {
    const { service, repository } = harness();

    const first = await service.begin(params({ idempotencyKey: "order-7f3a" }));
    const second = await service.begin(params({ idempotencyKey: "ORDER-7F3A" }));

    expect(second.disposition).toBe("proceed");
    expect(second.record.id).not.toBe(first.record.id);
    expect(await repository.listByConsumer(TENANT, CONSUMER)).toHaveLength(2);
  });

  it("normalizes the capability key, which is a name the platform issues rather than a client's token", async () => {
    const { service } = harness();

    const guarded = await service.begin(params({ capabilityKey: "  Admissions.Applications  " }));

    expect(guarded.record.capabilityKey).toBe(CAPABILITY);
  });

  it("holds keys unique within a consumer and not across the tenant", async () => {
    const { service } = harness();
    await service.begin(params());

    const guarded = await service.begin(params({ consumerId: SECOND_CONSUMER }));

    expect(guarded.disposition).toBe("proceed");
  });

  it("does not see another tenant's record under the same key", async () => {
    const { service } = harness();
    await service.begin(params());

    const guarded = await service.begin(params({ tenantId: OTHER }));

    expect(guarded.disposition).toBe("proceed");
  });

  it("refuses a blank key", async () => {
    const { service } = harness();

    await expect(service.begin(params({ idempotencyKey: "   " }))).rejects.toThrow(
      EmptyGatewayKeyError,
    );
  });

  it("refuses a key longer than the platform stores, rather than hashing it behind the caller's back", async () => {
    const { service } = harness();

    await expect(
      service.begin(params({ idempotencyKey: "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1) })),
    ).rejects.toThrow(IdempotencyKeyTooLongError);
  });

  it("accepts a key of exactly the length it stores", async () => {
    const { service } = harness();

    const guarded = await service.begin(
      params({ idempotencyKey: "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH) }),
    );

    expect(guarded.record.idempotencyKey).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
  });

  it("refuses a blank payload fingerprint", async () => {
    const { service } = harness();

    await expect(service.begin(params({ payloadFingerprint: "  " }))).rejects.toThrow(
      EmptyGatewayKeyError,
    );
  });

  it("refuses a capability key that does not fit the platform's grammar", async () => {
    const { service } = harness();

    await expect(
      service.begin(params({ capabilityKey: "admissions applications" })),
    ).rejects.toThrow(InvalidGatewayKeyError);
  });

  it("writes the record where the pair it is addressed with can find it", async () => {
    const { service } = harness();
    const guarded = await service.begin(params());

    expect(await service.getByKey(TENANT, CONSUMER, KEY)).toEqual(guarded.record);
  });

  it("announces nothing on an ordinary claim, because a claim per guarded write is a firehose", async () => {
    const { service, events } = harness();

    await service.begin(params());

    expect(types(events)).toEqual([]);
  });
});

describe("IdempotencyService — replaying an answer", () => {
  it("hands back the answer the first request produced", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    const completed = await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    const guarded = await service.begin(params());

    expect(guarded.disposition).toBe("replay");
    expect(guarded.record).toEqual(completed);
    expect(guarded.verdict.recordedStatus).toBe(201);
    expect(guarded.verdict.recordedAt).toBe(completed.completedAt);
    expect(guarded.verdict.expired).toBe(false);
  });

  it("writes nothing on a replay", async () => {
    const { service, repository } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));
    const before = await service.get(TENANT, first.record.id);

    await service.begin(params());

    expect(await repository.listByConsumer(TENANT, CONSUMER)).toHaveLength(1);
    expect(await service.get(TENANT, first.record.id)).toEqual(before);
  });

  it("announces nothing on a replay", async () => {
    const { service, events } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    await service.begin(params());

    expect(types(events)).toEqual([]);
  });

  it("replays for as long as retention holds", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    const guarded = await service.begin(
      params({ asOf: shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS - 1) }),
    );

    expect(guarded.disposition).toBe("replay");
  });

  it("treats the expiry instant itself as expired, and says the proceed followed one", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    const guarded = await service.begin(
      params({ asOf: shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS) }),
    );

    expect(guarded.disposition).toBe("proceed");
    expect(guarded.verdict.expired).toBe(true);
  });

  it("does not judge a recycled key against what an unrelated operation did with it", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    const guarded = await service.begin(
      params({
        asOf: shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS),
        payloadFingerprint: OTHER_FINGERPRINT,
        capabilityKey: "finance.invoices",
      }),
    );

    expect(guarded.disposition).toBe("proceed");
    expect(guarded.record.state).toBe("in_flight");
    expect(guarded.record.payloadFingerprint).toBe(OTHER_FINGERPRINT);
    expect(guarded.record.capabilityKey).toBe("finance.invoices");
  });

  it("renews the expired row rather than writing beside it, since the store holds one per key", async () => {
    const { service, repository } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));
    const renewedAt = shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS);

    const guarded = await service.begin(params({ asOf: renewedAt }));

    expect(guarded.record.id).toBe(first.record.id);
    expect(await repository.listByConsumer(TENANT, CONSUMER)).toHaveLength(1);
    expect(gapSeconds(renewedAt, guarded.record.expiresAt)).toBe(IDEMPOTENCY_RETENTION_SECONDS);
  });

  it("carries nothing of the expired operation into the one that recycled its key", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    const guarded = await service.begin(
      params({ asOf: shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS) }),
    );

    expect(guarded.record.recordedStatus).toBeNull();
    expect(guarded.record.responseRef).toBeNull();
    expect(guarded.record.completedAt).toBeNull();
    expect(guarded.record.conflictedAt).toBeNull();
  });

  it("answers the renewed key from the new operation once it completes", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));
    const later = shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS);
    const renewed = await service.begin(params({ asOf: later }));
    await service.complete(
      TENANT,
      renewed.record.id,
      result({ statusCode: 202, responseRef: null }),
      shift(later, 3),
    );

    const guarded = await service.begin(params({ asOf: shift(later, 10) }));

    expect(guarded.disposition).toBe("replay");
    expect(guarded.verdict.recordedStatus).toBe(202);
  });
});

describe("IdempotencyService — waiting on one in flight", () => {
  it("refuses a retry that arrived while the first request is still running", async () => {
    const { service } = harness();
    await service.begin(params());

    await expect(service.begin(params({ asOf: shift(BEGAN, 1) }))).rejects.toThrow(
      OperationInFlightError,
    );
  });

  it("leaves the record it is waiting on exactly as it stands", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    await expect(service.begin(params({ asOf: shift(BEGAN, 1) }))).rejects.toThrow(
      OperationInFlightError,
    );
    expect(await service.get(TENANT, first.record.id)).toEqual(first.record);
  });

  it("announces nothing while waiting, because nobody has done anything wrong", async () => {
    const { service, events } = harness();
    await service.begin(params());

    await expect(service.begin(params({ asOf: shift(BEGAN, 1) }))).rejects.toThrow(
      OperationInFlightError,
    );
    expect(types(events)).toEqual([]);
  });
});

describe("IdempotencyService — collision", () => {
  it("refuses a key reused across two different requests", async () => {
    const { service } = harness();
    await service.begin(params());

    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );
  });

  it("poisons a record that was still in flight, because it has no honest answer for either caller", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    const at = shift(BEGAN, 5);

    await expect(
      service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT, asOf: at })),
    ).rejects.toThrow(IdempotencyKeyConflictError);
    const poisoned = await service.get(TENANT, first.record.id);

    expect(poisoned.state).toBe("conflicted");
    expect(poisoned.conflictedAt).toBe(at);
  });

  it("announces the collision it poisoned, carrying the state the record ended in", async () => {
    const { service, events } = harness();
    const first = await service.begin(params());
    const at = shift(BEGAN, 5);

    await expect(
      service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT, asOf: at })),
    ).rejects.toThrow(IdempotencyKeyConflictError);
    const announced = events.published.at(-1);
    const payload = announced?.payload as {
      recordId: Uuid;
      state: string;
      conflictedAt: ISODateString | null;
      capabilityKey: string;
    };

    expect(announced?.type).toBe(IDEMPOTENCY_CONFLICT_DETECTED);
    expect(payload.recordId).toBe(first.record.id);
    expect(payload.state).toBe("conflicted");
    expect(payload.conflictedAt).toBe(at);
    expect(payload.capabilityKey).toBe(CAPABILITY);
  });

  it("carries neither the key nor the fingerprint onto the bus", async () => {
    const { service, events } = harness();
    await service.begin(params());

    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );

    expect(JSON.stringify(events.published)).not.toContain(KEY);
    expect(JSON.stringify(events.published)).not.toContain(FINGERPRINT);
  });

  it("leaves a completed record alone, so the original caller's retry still replays", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    const completed = await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    await expect(
      service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT, asOf: shift(BEGAN, 5) })),
    ).rejects.toThrow(IdempotencyKeyConflictError);

    expect(await service.get(TENANT, first.record.id)).toEqual(completed);
    expect((await service.begin(params({ asOf: shift(BEGAN, 6) }))).disposition).toBe("replay");
  });

  it("announces a collision against a completed record too, carrying the state it kept", async () => {
    const { service, events } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );
    const payload = events.published.at(-1)?.payload as { state: string };

    expect(types(events)).toEqual([IDEMPOTENCY_CONFLICT_DETECTED]);
    expect(payload.state).toBe("completed");
  });

  it("refuses everybody once the key is poisoned, the matching fingerprint included", async () => {
    const { service } = harness();
    await service.begin(params());
    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );

    await expect(service.begin(params({ asOf: shift(BEGAN, 9) }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );
  });

  it("announces each later collision without writing again", async () => {
    const { service, events } = harness();
    const first = await service.begin(params());
    await expect(
      service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT, asOf: shift(BEGAN, 5) })),
    ).rejects.toThrow(IdempotencyKeyConflictError);
    const poisoned = await service.get(TENANT, first.record.id);

    await expect(service.begin(params({ asOf: shift(BEGAN, 9) }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );

    expect(types(events)).toEqual([IDEMPOTENCY_CONFLICT_DETECTED, IDEMPOTENCY_CONFLICT_DETECTED]);
    expect(await service.get(TENANT, first.record.id)).toEqual(poisoned);
  });

  it("refuses the completion of a record that collided while it was running", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );

    await expect(
      service.complete(TENANT, first.record.id, result(), shift(BEGAN, 8)),
    ).rejects.toThrow(IdempotencyRecordSettledError);
  });

  it("lets a poisoned key be claimed again once its retention has run out", async () => {
    const { service } = harness();
    await service.begin(params());
    await expect(service.begin(params({ payloadFingerprint: OTHER_FINGERPRINT }))).rejects.toThrow(
      IdempotencyKeyConflictError,
    );

    const guarded = await service.begin(
      params({ asOf: shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS) }),
    );

    expect(guarded.disposition).toBe("proceed");
    expect(guarded.record.state).toBe("in_flight");
    expect(guarded.record.conflictedAt).toBeNull();
  });
});

describe("IdempotencyService — completing", () => {
  it("records what the operation produced, so the next arrival is answered", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    const at = shift(BEGAN, 2);

    const completed = await service.complete(TENANT, first.record.id, result(), at);

    expect(completed.state).toBe("completed");
    expect(completed.recordedStatus).toBe(201);
    expect(completed.responseRef).toBe(RESPONSE);
    expect(completed.completedAt).toBe(at);
  });

  it("keeps no handle where the operation produced nothing to replay but a status", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    const completed = await service.complete(
      TENANT,
      first.record.id,
      result({ statusCode: 204, responseRef: null }),
      shift(BEGAN, 2),
    );

    expect(completed.recordedStatus).toBe(204);
    expect(completed.responseRef).toBeNull();
  });

  it("reduces a blank handle to none, and trims one that carries whitespace", async () => {
    const { service } = harness();
    const blank = await service.begin(params({ idempotencyKey: "order-blank" }));
    const padded = await service.begin(params({ idempotencyKey: "order-padded" }));

    const first = await service.complete(
      TENANT,
      blank.record.id,
      result({ responseRef: "   " }),
      shift(BEGAN, 2),
    );
    const second = await service.complete(
      TENANT,
      padded.record.id,
      result({ responseRef: `  ${RESPONSE}  ` }),
      shift(BEGAN, 2),
    );

    expect(first.responseRef).toBeNull();
    expect(second.responseRef).toBe(RESPONSE);
  });

  it("refuses a status that is not a status, because this number is replayed to a caller", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    await expect(
      service.complete(TENANT, first.record.id, result({ statusCode: 0 }), shift(BEGAN, 2)),
    ).rejects.toThrow(InvalidRecordedStatusError);
  });

  it("refuses to complete a record twice", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    await expect(
      service.complete(TENANT, first.record.id, result(), shift(BEGAN, 3)),
    ).rejects.toThrow(IdempotencyRecordSettledError);
  });

  it("announces nothing, because a completion is the ordinary end of every guarded write", async () => {
    const { service, events } = harness();
    const first = await service.begin(params());

    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    expect(types(events)).toEqual([]);
  });

  it("404s on a record nobody can resolve", async () => {
    const { service } = harness();

    await expect(service.complete(TENANT, MISSING, result(), BEGAN)).rejects.toThrow(
      IdempotencyRecordNotFoundError,
    );
  });

  it("404s on a record held in another tenant", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    await expect(
      service.complete(OTHER, first.record.id, result(), shift(BEGAN, 2)),
    ).rejects.toThrow(IdempotencyRecordNotFoundError);
  });
});

describe("IdempotencyService — reading", () => {
  it("reads one record back", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    expect(await service.get(TENANT, first.record.id)).toEqual(first.record);
  });

  it("404s on a record nobody can resolve", async () => {
    const { service } = harness();

    await expect(service.get(TENANT, MISSING)).rejects.toThrow(IdempotencyRecordNotFoundError);
  });

  it("does not read across tenants", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    await expect(service.get(OTHER, first.record.id)).rejects.toThrow(
      IdempotencyRecordNotFoundError,
    );
  });

  it("finds a record by the pair an operator holds, trimming the key as the write path did", async () => {
    const { service } = harness();
    const first = await service.begin(params());

    expect(await service.getByKey(TENANT, CONSUMER, `  ${KEY}  `)).toEqual(first.record);
  });

  it("404s by key on a key nobody presented", async () => {
    const { service } = harness();

    await expect(service.getByKey(TENANT, CONSUMER, "order-absent")).rejects.toThrow(
      IdempotencyRecordNotFoundError,
    );
  });

  it("refuses a blank key on the read as firmly as on the write", async () => {
    const { service } = harness();

    await expect(service.getByKey(TENANT, CONSUMER, "   ")).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("does not find one consumer's key under another consumer", async () => {
    const { service } = harness();
    await service.begin(params());

    await expect(service.getByKey(TENANT, SECOND_CONSUMER, KEY)).rejects.toThrow(
      IdempotencyRecordNotFoundError,
    );
  });

  it("lists every guarded write one integration has made, in every state", async () => {
    const { service } = harness();
    const completed = await service.begin(params({ idempotencyKey: "order-1" }));
    await service.complete(TENANT, completed.record.id, result(), shift(BEGAN, 2));
    const running = await service.begin(params({ idempotencyKey: "order-2" }));

    const listed = await service.listByConsumer(TENANT, CONSUMER);

    expect(new Set(listed.map((record) => record.id))).toEqual(
      new Set([completed.record.id, running.record.id]),
    );
  });

  it("does not list one consumer's writes under another", async () => {
    const { service } = harness();
    await service.begin(params());

    expect(await service.listByConsumer(TENANT, SECOND_CONSUMER)).toHaveLength(0);
  });

  it("does not list across tenants", async () => {
    const { service } = harness();
    await service.begin(params());

    expect(await service.listByConsumer(OTHER, CONSUMER)).toHaveLength(0);
  });
});

describe("IdempotencyService — housekeeping", () => {
  it("drops the records whose retention ran out, and says how many went", async () => {
    const { service } = harness();
    await service.begin(params({ idempotencyKey: "order-1" }));
    await service.begin(params({ idempotencyKey: "order-2" }));

    const dropped = await service.purgeExpired(TENANT, shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS));

    expect(dropped).toBe(2);
    expect(await service.listByConsumer(TENANT, CONSUMER)).toHaveLength(0);
  });

  it("keeps a record still inside its window", async () => {
    const { service } = harness();
    await service.begin(params());

    const dropped = await service.purgeExpired(
      TENANT,
      shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS - 1),
    );

    expect(dropped).toBe(0);
    expect(await service.listByConsumer(TENANT, CONSUMER)).toHaveLength(1);
  });

  it("does not reach into another tenant's ledger", async () => {
    const { service } = harness();
    await service.begin(params());

    const dropped = await service.purgeExpired(OTHER, shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS));

    expect(dropped).toBe(0);
    expect(await service.listByConsumer(TENANT, CONSUMER)).toHaveLength(1);
  });

  it("changes no answer the ledger gives, so it can run as late as it likes", async () => {
    const { service } = harness();
    const first = await service.begin(params());
    await service.complete(TENANT, first.record.id, result(), shift(BEGAN, 2));

    await service.purgeExpired(TENANT, shift(BEGAN, IDEMPOTENCY_RETENTION_SECONDS - 1));

    expect((await service.begin(params({ asOf: shift(BEGAN, 5) }))).disposition).toBe("replay");
  });
});
