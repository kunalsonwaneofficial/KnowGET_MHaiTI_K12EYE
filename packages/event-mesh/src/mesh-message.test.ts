import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyMeshKeyError,
  InvalidMeshCountError,
  MissingPayloadDigestError,
  PayloadNotRetainedError,
} from "./errors";
import {
  type MeshMessage,
  type RecordMeshMessageParams,
  forgetMeshMessagePayload,
  isMeshMessageReplayable,
  meshMessagePayload,
  recordMeshMessage,
} from "./mesh-message";
import {
  DEFAULT_PARTITION_COUNT,
  FIRST_SEQUENCE,
  PAYLOAD_RETENTIONS,
  isReplayable,
} from "./mesh-value";
import type { MeshEnvelope, PartitionDeclaration } from "./mesh-view";
import { FIRST_PARTITION, partitionFor } from "./partitioning";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const EVENT_ID = "event-1" as Uuid;
const STUDENT = "student-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;
const STREAM_KEY = "student-lifecycle.enrolment";
const DIGEST = "sha256:9f2c1a";
const PAYLOAD = { studentId: STUDENT, grade: "VII" };

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;

const envelope = (overrides: Partial<MeshEnvelope> = {}): MeshEnvelope => ({
  eventId: EVENT_ID,
  eventTypeKey: "student-lifecycle.enrolment-confirmed",
  eventTypeVersion: 2,
  tenantId: TENANT,
  aggregate: { aggregateType: "student", aggregateId: STUDENT },
  producerKey: "student-lifecycle",
  correlationId: CORRELATION,
  causationId: null,
  traceId: "trace-1",
  streamKey: STREAM_KEY,
  partitionKey: STUDENT,
  occurredAt: OCCURRED_AT,
  recordedAt: RECORDED_AT,
  ...overrides,
});

const partitioning = (overrides: Partial<PartitionDeclaration> = {}): PartitionDeclaration => ({
  streamKey: STREAM_KEY,
  ordering: "partition",
  partitionCount: DEFAULT_PARTITION_COUNT,
  partitionKeyPath: "aggregate.aggregateId",
  ...overrides,
});

const params = (overrides: Partial<RecordMeshMessageParams> = {}): RecordMeshMessageParams => ({
  organizationId: ORG,
  envelope: envelope(),
  partitioning: partitioning(),
  sequence: FIRST_SEQUENCE,
  retention: "full",
  payloadDigest: DIGEST,
  payload: PAYLOAD,
  ...overrides,
});

const recorded = (overrides: Partial<RecordMeshMessageParams> = {}): MeshMessage =>
  recordMeshMessage(params(overrides));

describe("recording a message", () => {
  it("flattens the envelope, so the row says what the producer actually published", () => {
    const message = recorded();

    expect(message.eventId).toBe(EVENT_ID);
    expect(message.eventTypeKey).toBe("student-lifecycle.enrolment-confirmed");
    expect(message.eventTypeVersion).toBe(2);
    expect(message.aggregateType).toBe("student");
    expect(message.aggregateId).toBe(STUDENT);
    expect(message.producerKey).toBe("student-lifecycle");
    expect(message.correlationId).toBe(CORRELATION);
    expect(message.causationId).toBeNull();
    expect(message.traceId).toBe("trace-1");
    expect(message.streamKey).toBe(STREAM_KEY);
    expect(message.occurredAt).toBe(OCCURRED_AT);
  });

  it("takes the tenant from the envelope, so a message cannot be filed under another", () => {
    const message = recorded({ envelope: envelope({ tenantId: "t2" as TenantId }) });

    expect(message.tenantId).toBe("t2");
    expect(message.organizationId).toBe(ORG);
  });

  it("keeps when the mesh accepted the event apart from when the row was written", () => {
    const message = recorded();

    expect(message.recordedAt).toBe(RECORDED_AT);
    expect(message.createdAt).not.toBe(message.recordedAt);
    expect(message.updatedAt).toBe(message.createdAt);
    expect(message.payloadForgottenAt).toBeNull();
  });

  it("derives the partition from the key the envelope already fixed", () => {
    const message = recorded();

    expect(message.partitionKey).toBe(STUDENT);
    expect(message.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(message.partition).toBe(partitionFor(STUDENT, DEFAULT_PARTITION_COUNT));
  });

  it("puts every message about one aggregate on one partition", () => {
    const first = recorded();
    const second = recorded({
      sequence: FIRST_SEQUENCE + 1,
      envelope: envelope({ eventId: "event-2" as Uuid, eventTypeVersion: 3 }),
    });

    expect(second.partition).toBe(first.partition);
    expect(second.partitionKey).toBe(first.partitionKey);
  });

  it("puts a globally ordered stream on the only partition it has", () => {
    const message = recorded({
      partitioning: partitioning({ ordering: "global", partitionCount: 1, partitionKeyPath: null }),
    });

    expect(message.partition).toBe(FIRST_PARTITION);
    expect(message.partitionCount).toBe(1);
  });

  it("refuses an envelope that carries no partition key", () => {
    expect(() => recorded({ envelope: envelope({ partitionKey: "   " }) })).toThrow(
      EmptyMeshKeyError,
    );
  });

  it("refuses a partition count the stream's own ordering forbids", () => {
    expect(() => recorded({ partitioning: partitioning({ ordering: "global" }) })).toThrow(
      InvalidMeshCountError,
    );
  });

  it("refuses a sequence that is not a position on a stream", () => {
    for (const sequence of [0, -1, 1.5, FIRST_SEQUENCE - 1]) {
      expect(() => recorded({ sequence })).toThrow(InvalidMeshCountError);
    }
  });

  it("accepts the first sequence a stream can hold", () => {
    expect(recorded({ sequence: FIRST_SEQUENCE }).sequence).toBe(FIRST_SEQUENCE);
  });
});

describe("keeping what the stream promised to keep", () => {
  it("keeps a payload only where the stream promised to hold one", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const message = recorded({ retention });

      expect(message.retention).toBe(retention);
      expect(message.payload).toBe(retention === "full" ? PAYLOAD : null);
      expect(message.payloadForgottenAt).toBeNull();
    }
  });

  it("keeps a digest on every stream that promised one, and on no other", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const message = recorded({ retention });

      expect(message.payloadDigest).toBe(retention === "none" ? null : DIGEST);
    }
  });

  it("trims the digest it stores", () => {
    expect(recorded({ payloadDigest: `  ${DIGEST}  ` }).payloadDigest).toBe(DIGEST);
  });

  it("refuses a blank digest on a stream whose messages are worth nothing without one", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const record = (): MeshMessage => recorded({ retention, payloadDigest: "   " });

      if (retention === "none") {
        expect(record).not.toThrow();
      } else {
        expect(record).toThrow(MissingPayloadDigestError);
      }
    }
  });

  it("refuses a missing digest the same way it refuses a blank one", () => {
    expect(() => recorded({ retention: "digest", payloadDigest: undefined })).toThrow(
      MissingPayloadDigestError,
    );
  });
});

describe("forgetting a payload", () => {
  it("drops the payload and keeps the envelope that described it", () => {
    const message = recorded();
    const forgotten = forgetMeshMessagePayload(message);

    expect(forgotten.payload).toBeNull();
    expect(forgotten.payloadForgottenAt).toBe(forgotten.updatedAt);
    expect(forgotten.payloadDigest).toBe(DIGEST);
    expect(forgotten.eventId).toBe(message.eventId);
    expect(forgotten.sequence).toBe(message.sequence);
    expect(forgotten.correlationId).toBe(message.correlationId);
  });

  it("hands back the same message when there is no payload left to forget", () => {
    const forgotten = forgetMeshMessagePayload(recorded());
    const digestOnly = recorded({ retention: "digest" });

    expect(forgetMeshMessagePayload(forgotten)).toBe(forgotten);
    expect(forgetMeshMessagePayload(digestOnly)).toBe(digestOnly);
  });
});

describe("reading a payload back", () => {
  it("gives back the payload a full stream is still holding", () => {
    expect(meshMessagePayload(recorded())).toBe(PAYLOAD);
  });

  it("refuses the payload once the retention sweep has taken it", () => {
    const forgotten = forgetMeshMessagePayload(recorded());

    expect(isMeshMessageReplayable(forgotten)).toBe(false);
    expect(() => meshMessagePayload(forgotten)).toThrow(PayloadNotRetainedError);
  });

  it("keeps the plan and the act in step on every retention a stream can declare", () => {
    for (const retention of PAYLOAD_RETENTIONS) {
      const message = recorded({ retention });

      expect(isMeshMessageReplayable(message)).toBe(isReplayable(retention));
      if (isMeshMessageReplayable(message)) {
        expect(meshMessagePayload(message)).toBe(PAYLOAD);
      } else {
        expect(() => meshMessagePayload(message)).toThrow(PayloadNotRetainedError);
      }
    }
  });
});
