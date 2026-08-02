import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  BindingNotDrainedError,
  BindingRetiredError,
  EmptyMeshKeyError,
  InvalidBindingProgressionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  PlaintextTransportCredentialError,
} from "./errors";
import {
  BINDING_STATUSES,
  DEFAULT_TRANSPORT_KIND,
  INITIAL_BINDING_STATUS,
  TRANSPORT_KINDS,
  TRANSPORT_REF_PROVIDERS,
} from "./mesh-value";
import {
  type DeclareStreamBindingParams,
  type StreamBinding,
  activateStreamBinding,
  bindingTransportProvider,
  declareStreamBinding,
  drainStreamBinding,
  isStreamBindingCarrying,
  isStreamBindingDraining,
  retargetStreamBinding,
  retireStreamBinding,
} from "./stream-binding";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPERATOR = "person-1" as Uuid;

const params = (
  overrides: Partial<DeclareStreamBindingParams> = {},
): DeclareStreamBindingParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: "student-lifecycle.enrolment",
  transportRef: "config:kafka-primary",
  ...overrides,
});

const declared = (overrides: Partial<DeclareStreamBindingParams> = {}): StreamBinding =>
  declareStreamBinding(params(overrides));

const active = (overrides: Partial<DeclareStreamBindingParams> = {}): StreamBinding =>
  activateStreamBinding(declared(overrides), OPERATOR);

const draining = (overrides: Partial<DeclareStreamBindingParams> = {}): StreamBinding =>
  drainStreamBinding(active(overrides));

const retired = (overrides: Partial<DeclareStreamBindingParams> = {}): StreamBinding =>
  retireStreamBinding(draining(overrides), 0);

describe("declaring a binding", () => {
  it("declares a binding that carries nothing until somebody activates it", () => {
    const binding = declared();

    expect(binding.status).toBe(INITIAL_BINDING_STATUS);
    expect(binding.status).toBe("declared");
    expect(binding.activatedAt).toBeNull();
    expect(binding.activatedBy).toBeNull();
    expect(binding.drainingSince).toBeNull();
    expect(binding.retiredAt).toBeNull();
    expect(isStreamBindingCarrying(binding)).toBe(false);
  });

  it("defaults to the outbox, the one backbone that survives a crash without a second system", () => {
    expect(declared().transport).toBe(DEFAULT_TRANSPORT_KIND);
    expect(declared().transport).toBe("outbox");
  });

  it("declares any backbone the platform names, whether or not a deployment can serve it", () => {
    for (const transport of TRANSPORT_KINDS) {
      expect(declared({ transport }).transport).toBe(transport);
    }
  });

  it("normalises the stream key so two spellings of one channel bind the same thing", () => {
    expect(declared({ streamKey: "  Student-Lifecycle.Enrolment  " }).streamKey).toBe(
      "student-lifecycle.enrolment",
    );
  });

  it("refuses a blank stream key and one that is not a key at all", () => {
    expect(() => declared({ streamKey: "   " })).toThrow(EmptyMeshKeyError);
    expect(() => declared({ streamKey: "student lifecycle!" })).toThrow(InvalidMeshKeyError);
  });

  it("accepts a reference through every provider the platform resolves", () => {
    for (const provider of TRANSPORT_REF_PROVIDERS) {
      const binding = declared({ transportRef: `${provider}:kafka-primary` });
      expect(bindingTransportProvider(binding)).toBe(provider);
    }
  });

  it("keeps the case of a reference, because a vault path is a path and not a key", () => {
    expect(declared({ transportRef: "secretstore:Kafka/Prod" }).transportRef).toBe(
      "secretstore:Kafka/Prod",
    );
  });

  it("refuses a reference that is the connection settings rather than a handle to them", () => {
    expect(() => declared({ transportRef: "kafka://user:hunter2@broker:9092" })).toThrow(
      PlaintextTransportCredentialError,
    );
    expect(() => declared({ transportRef: "broker-1:9092,broker-2:9092 acks=all" })).toThrow(
      PlaintextTransportCredentialError,
    );
    expect(() => declared({ transportRef: "kafka-primary" })).toThrow(
      PlaintextTransportCredentialError,
    );
    expect(() => declared({ transportRef: "   " })).toThrow(PlaintextTransportCredentialError);
  });

  it("withholds the rejected reference from the refusal, which is the point of the refusal", () => {
    const secret = "kafka://admin:hunter2@broker:9092";

    expect(() => declared({ transportRef: secret })).toThrow(PlaintextTransportCredentialError);
    expect(() => declared({ transportRef: secret })).not.toThrow(/hunter2/);
  });
});

describe("re-pointing a binding", () => {
  it("re-points a declared binding at a different handle", () => {
    const binding = retargetStreamBinding(declared(), "vault:mesh/kafka-primary");

    expect(binding.transportRef).toBe("vault:mesh/kafka-primary");
    expect(bindingTransportProvider(binding)).toBe("vault");
  });

  it("re-points a binding that is carrying, because that is how a credential is rotated", () => {
    const binding = retargetStreamBinding(active(), "vault:mesh/kafka-rotated");

    expect(binding.transportRef).toBe("vault:mesh/kafka-rotated");
    expect(binding.status).toBe("active");
  });

  it("leaves the backbone alone, since a different backbone is a different binding", () => {
    const binding = retargetStreamBinding(active({ transport: "kafka" }), "env:KAFKA_SETTINGS");

    expect(binding.transport).toBe("kafka");
  });

  it("refuses to re-point a retired binding, which resolves to nothing either way", () => {
    expect(() => retargetStreamBinding(retired(), "config:kafka-secondary")).toThrow(
      BindingRetiredError,
    );
  });

  it("refuses a new reference that is the settings themselves, on the same rule as the first one", () => {
    expect(() => retargetStreamBinding(declared(), "broker-1:9092 sasl.jaas.config=x")).toThrow(
      PlaintextTransportCredentialError,
    );
  });
});

describe("moving a binding through its life", () => {
  it("stamps who started it carrying, and when", () => {
    const binding = active();

    expect(binding.status).toBe("active");
    expect(binding.activatedBy).toBe(OPERATOR);
    expect(binding.activatedAt).not.toBeNull();
    expect(isStreamBindingCarrying(binding)).toBe(true);
  });

  it("drains before it retires, recording when the wait began", () => {
    const binding = draining();

    expect(binding.status).toBe("draining");
    expect(binding.drainingSince).not.toBeNull();
    expect(isStreamBindingCarrying(binding)).toBe(false);
    expect(isStreamBindingDraining(binding)).toBe(true);
  });

  it("refuses to retire a binding that is still carrying, which is the whole reason draining exists", () => {
    expect(() => retireStreamBinding(active(), 0)).toThrow(InvalidBindingProgressionError);
  });

  it("refuses to reactivate a draining binding, which would leave the stream with two carriers", () => {
    expect(() => activateStreamBinding(draining(), OPERATOR)).toThrow(
      InvalidBindingProgressionError,
    );
  });

  it("refuses to activate a binding that is already carrying", () => {
    expect(() => activateStreamBinding(active(), OPERATOR)).toThrow(InvalidBindingProgressionError);
  });

  it("refuses to drain a binding that never carried anything", () => {
    expect(() => drainStreamBinding(declared())).toThrow(InvalidBindingProgressionError);
  });

  it("retires a declared binding directly, which is how one that will never carry is withdrawn", () => {
    const binding = retireStreamBinding(declared(), 0);

    expect(binding.status).toBe("retired");
    expect(binding.retiredAt).not.toBeNull();
    expect(binding.activatedAt).toBeNull();
  });

  it("refuses to retire a drained binding that still holds messages nobody has received", () => {
    expect(() => retireStreamBinding(draining(), 9)).toThrow(BindingNotDrainedError);
  });

  it("reports a retired binding before asking it to drain something it no longer holds", () => {
    expect(() => retireStreamBinding(retired(), 9)).toThrow(BindingRetiredError);
  });

  it("treats an undelivered count that is not a count as an internal fault rather than a refusal", () => {
    for (const undelivered of [-1, 1.5, Number.NaN]) {
      expect(() => retireStreamBinding(draining(), undelivered)).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses every move out of retirement, whichever move it is", () => {
    const binding = retired();
    expect(() => activateStreamBinding(binding, OPERATOR)).toThrow(BindingRetiredError);
    expect(() => drainStreamBinding(binding)).toThrow(BindingRetiredError);
    expect(() => retireStreamBinding(binding, 0)).toThrow(BindingRetiredError);
  });

  it("reports carrying for exactly one status and draining for exactly one other", () => {
    for (const status of BINDING_STATUSES) {
      const binding: StreamBinding = { ...declared(), status };
      expect(isStreamBindingCarrying(binding)).toBe(status === "active");
      expect(isStreamBindingDraining(binding)).toBe(status === "draining");
    }
  });

  it("keeps the instant it began carrying on the record after it has stopped", () => {
    const carrying = active();
    const finished = retireStreamBinding(drainStreamBinding(carrying), 0);

    expect(finished.activatedAt).toBe(carrying.activatedAt);
    expect(finished.activatedBy).toBe(OPERATOR);
  });
});
