import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyMeshKeyError,
  FilterValueMismatchError,
  InvalidAttemptCeilingError,
  InvalidMeshKeyError,
  InvalidMeshSubscriptionProgressionError,
  MeshSubscriptionRetiredError,
  TooManyFilterPredicatesError,
  UnknownFilterAttributeError,
} from "./errors";
import {
  type MeshSubscription,
  type RegisterMeshSubscriptionParams,
  activateMeshSubscription,
  isMeshSubscriptionDeliverable,
  pauseMeshSubscription,
  refilterMeshSubscription,
  registerMeshSubscription,
  retireMeshSubscription,
  reviseSubscriptionDelivery,
  subscriptionRequiresDeduplication,
  subscriptionRequiresRetry,
} from "./mesh-subscription";
import {
  DEFAULT_DELIVERY_ATTEMPTS,
  DEFAULT_DELIVERY_SEMANTICS,
  DELIVERY_SEMANTICS,
  type FilterPredicate,
  INITIAL_SUBSCRIPTION_STATUS,
  MAX_DELIVERY_ATTEMPTS,
  MAX_FILTER_PREDICATES,
  MIN_DELIVERY_ATTEMPTS,
  SUBSCRIPTION_STATUSES,
} from "./mesh-value";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPERATOR = "person-1" as Uuid;

const predicate = (attribute: string, values: readonly string[]): FilterPredicate => ({
  attribute,
  operator: "in",
  values,
});

const params = (
  overrides: Partial<RegisterMeshSubscriptionParams> = {},
): RegisterMeshSubscriptionParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionKey: "finance.ledger-projector",
  streamKey: "student-lifecycle.enrolment",
  consumerGroup: "finance.ledger",
  title: "Ledger projector",
  ...overrides,
});

const registered = (overrides: Partial<RegisterMeshSubscriptionParams> = {}): MeshSubscription =>
  registerMeshSubscription(params(overrides));

const active = (overrides: Partial<RegisterMeshSubscriptionParams> = {}): MeshSubscription =>
  activateMeshSubscription(registered(overrides), OPERATOR);

const paused = (overrides: Partial<RegisterMeshSubscriptionParams> = {}): MeshSubscription =>
  pauseMeshSubscription(active(overrides));

const retired = (overrides: Partial<RegisterMeshSubscriptionParams> = {}): MeshSubscription =>
  retireMeshSubscription(registered(overrides));

describe("registering a subscription", () => {
  it("registers a subscription that receives nothing until somebody activates it", () => {
    const subscription = registered();

    expect(subscription.status).toBe(INITIAL_SUBSCRIPTION_STATUS);
    expect(subscription.status).toBe("registered");
    expect(subscription.activatedAt).toBeNull();
    expect(subscription.activatedBy).toBeNull();
    expect(subscription.pausedAt).toBeNull();
    expect(subscription.retiredAt).toBeNull();
    expect(isMeshSubscriptionDeliverable(subscription)).toBe(false);
  });

  it("promises delivery until acknowledged unless the consumer asks for something else", () => {
    expect(registered().semantics).toBe(DEFAULT_DELIVERY_SEMANTICS);
    expect(registered().semantics).toBe("at_least_once");
    expect(registered().maxAttempts).toBe(DEFAULT_DELIVERY_ATTEMPTS);
  });

  it("takes no predicates by default, which is everything the stream carries", () => {
    expect(registered().filter).toEqual([]);
  });

  it("normalises all three keys, so one consumer spelled two ways is one consumer", () => {
    const subscription = registered({
      subscriptionKey: "  Finance.Ledger-Projector ",
      streamKey: "Student-Lifecycle.Enrolment",
      consumerGroup: " Finance.Ledger ",
    });

    expect(subscription.subscriptionKey).toBe("finance.ledger-projector");
    expect(subscription.streamKey).toBe("student-lifecycle.enrolment");
    expect(subscription.consumerGroup).toBe("finance.ledger");
  });

  it("refuses a blank key wherever one is blank", () => {
    expect(() => registered({ subscriptionKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => registered({ streamKey: "  " })).toThrow(EmptyMeshKeyError);
    expect(() => registered({ consumerGroup: "  " })).toThrow(EmptyMeshKeyError);
  });

  it("refuses a consumer group that is not a key, since a checkpoint is filed under it", () => {
    expect(() => registered({ consumerGroup: "finance ledger!" })).toThrow(InvalidMeshKeyError);
  });

  it("records a ceiling under every promise, including the one that never reaches it", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      const subscription = registered({ semantics, maxAttempts: 3 });
      expect(subscription.semantics).toBe(semantics);
      expect(subscription.maxAttempts).toBe(3);
    }
  });

  it("accepts the ends of the attempt range and refuses a step beyond either", () => {
    expect(registered({ maxAttempts: MIN_DELIVERY_ATTEMPTS }).maxAttempts).toBe(
      MIN_DELIVERY_ATTEMPTS,
    );
    expect(registered({ maxAttempts: MAX_DELIVERY_ATTEMPTS }).maxAttempts).toBe(
      MAX_DELIVERY_ATTEMPTS,
    );
    expect(() => registered({ maxAttempts: MIN_DELIVERY_ATTEMPTS - 1 })).toThrow(
      InvalidAttemptCeilingError,
    );
    expect(() => registered({ maxAttempts: MAX_DELIVERY_ATTEMPTS + 1 })).toThrow(
      InvalidAttemptCeilingError,
    );
  });

  it("stores a validated filter frozen, so nothing edits it after the rules were applied", () => {
    const subscription = registered({
      filter: [predicate("eventTypeKey", [" student.enrolled ", "student.transferred"])],
    });

    expect(subscription.filter).toHaveLength(1);
    expect(subscription.filter[0]?.values).toEqual(["student.enrolled", "student.transferred"]);
    expect(Object.isFrozen(subscription.filter)).toBe(true);
  });

  it("refuses a filter the routing engine could not evaluate against an envelope", () => {
    expect(() => registered({ filter: [predicate("payload.total", ["1"])] })).toThrow(
      UnknownFilterAttributeError,
    );
    expect(() => registered({ filter: [predicate("eventTypeKey", [])] })).toThrow(
      FilterValueMismatchError,
    );
  });

  it("refuses more predicates than a subscription may hold, a query rather than a subscription", () => {
    const many = Array.from({ length: MAX_FILTER_PREDICATES + 1 }, () =>
      predicate("eventTypeKey", ["student.enrolled"]),
    );

    expect(() => registered({ filter: many })).toThrow(TooManyFilterPredicatesError);
  });
});

describe("revising what a subscription wants", () => {
  it("replaces the filter whole, on a subscription that is already receiving", () => {
    const subscription = refilterMeshSubscription(
      active({ filter: [predicate("eventTypeKey", ["student.enrolled"])] }),
      [predicate("producerKey", ["admissions"])],
    );

    expect(subscription.filter).toHaveLength(1);
    expect(subscription.filter[0]?.attribute).toBe("producerKey");
    expect(subscription.status).toBe("active");
  });

  it("empties a filter back to everything the stream carries", () => {
    const subscription = refilterMeshSubscription(
      active({ filter: [predicate("eventTypeKey", ["student.enrolled"])] }),
      [],
    );

    expect(subscription.filter).toEqual([]);
  });

  it("applies the same rules to a revised filter as to the first one", () => {
    expect(() => refilterMeshSubscription(active(), [predicate("payload.total", ["1"])])).toThrow(
      UnknownFilterAttributeError,
    );
  });

  it("refuses to refilter a retired subscription, which receives nothing further", () => {
    expect(() => refilterMeshSubscription(retired(), [])).toThrow(MeshSubscriptionRetiredError);
  });

  it("moves the promise and the effort together", () => {
    const subscription = reviseSubscriptionDelivery(active(), "exactly_once", 2);

    expect(subscription.semantics).toBe("exactly_once");
    expect(subscription.maxAttempts).toBe(2);
    expect(subscriptionRequiresDeduplication(subscription)).toBe(true);
  });

  it("applies the attempt range to a revision as it did to the registration", () => {
    expect(() =>
      reviseSubscriptionDelivery(active(), "at_least_once", MAX_DELIVERY_ATTEMPTS + 1),
    ).toThrow(InvalidAttemptCeilingError);
  });

  it("refuses to revise the delivery of a retired subscription", () => {
    expect(() => reviseSubscriptionDelivery(retired(), "at_most_once", 1)).toThrow(
      MeshSubscriptionRetiredError,
    );
  });
});

describe("moving a subscription through its life", () => {
  it("stamps who started it receiving, and when", () => {
    const subscription = active();

    expect(subscription.status).toBe("active");
    expect(subscription.activatedBy).toBe(OPERATOR);
    expect(subscription.activatedAt).not.toBeNull();
    expect(isMeshSubscriptionDeliverable(subscription)).toBe(true);
  });

  it("holds the checkpoint on a pause and records when the backlog began accruing", () => {
    const subscription = paused();

    expect(subscription.status).toBe("paused");
    expect(subscription.pausedAt).not.toBeNull();
    expect(isMeshSubscriptionDeliverable(subscription)).toBe(false);
  });

  it("resumes through the same operation that started it, and clears the pause", () => {
    const resumed = activateMeshSubscription(paused(), OPERATOR);

    expect(resumed.status).toBe("active");
    expect(resumed.pausedAt).toBeNull();
  });

  it("keeps the instant it first went live across every pause after it", () => {
    const first = active();
    const resumed = activateMeshSubscription(pauseMeshSubscription(first), "person-2" as Uuid);

    expect(resumed.activatedAt).toBe(first.activatedAt);
    expect(resumed.activatedBy).toBe(OPERATOR);
  });

  it("refuses to activate a subscription that is already receiving", () => {
    expect(() => activateMeshSubscription(active(), OPERATOR)).toThrow(
      InvalidMeshSubscriptionProgressionError,
    );
  });

  it("refuses to pause a subscription that has never been activated", () => {
    expect(() => pauseMeshSubscription(registered())).toThrow(
      InvalidMeshSubscriptionProgressionError,
    );
  });

  it("retires a subscription that was never activated, which is how one is withdrawn", () => {
    const subscription = retired();

    expect(subscription.status).toBe("retired");
    expect(subscription.retiredAt).not.toBeNull();
    expect(subscription.activatedAt).toBeNull();
  });

  it("refuses every move out of retirement, whichever move it is", () => {
    const subscription = retired();
    expect(() => activateMeshSubscription(subscription, OPERATOR)).toThrow(
      MeshSubscriptionRetiredError,
    );
    expect(() => pauseMeshSubscription(subscription)).toThrow(MeshSubscriptionRetiredError);
    expect(() => retireMeshSubscription(subscription)).toThrow(MeshSubscriptionRetiredError);
  });

  it("reports itself deliverable for exactly one status", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const subscription: MeshSubscription = { ...registered(), status };
      expect(isMeshSubscriptionDeliverable(subscription)).toBe(status === "active");
    }
  });
});

describe("reading a subscription's promise", () => {
  it("keeps a ledger only for the promise that requires one", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      const subscription = registered({ semantics });
      expect(subscriptionRequiresDeduplication(subscription)).toBe(semantics === "exactly_once");
    }
  });

  it("retries for every promise except the one that chose to lose a message instead", () => {
    for (const semantics of DELIVERY_SEMANTICS) {
      const subscription = registered({ semantics });
      expect(subscriptionRequiresRetry(subscription)).toBe(semantics !== "at_most_once");
    }
  });
});
