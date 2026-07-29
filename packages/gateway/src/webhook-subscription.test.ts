import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSubscriptionKeyError,
  EmptyGatewayKeyError,
  InvalidGatewayKeyError,
  InvalidSubscriptionProgressionError,
  NoEventTypesSubscribedError,
  PlaintextCredentialError,
  SubscriptionNotSendingError,
  SubscriptionRevokedError,
} from "./errors";
import {
  type CreateWebhookSubscriptionParams,
  type WebhookSubscription,
  createWebhookSubscription,
  isSubscriptionInterestedIn,
  isWebhookSubscriptionSending,
  pauseWebhookSubscription,
  rebindSubscriptionEndpoint,
  recordSubscriptionOutcome,
  renameWebhookSubscription,
  requireSendingSubscription,
  requireUnusedSubscriptionKey,
  resubscribeWebhookSubscription,
  resumeWebhookSubscription,
  revokeWebhookSubscription,
  rotateSubscriptionSecret,
  suspendWebhookSubscription,
  toSubscriptionView,
} from "./webhook-subscription";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const CONSUMER = "consumer1" as Uuid;
const OTHER_CONSUMER = "consumer2" as Uuid;
const ENDPOINT = "endpoint1" as Uuid;
const OTHER_ENDPOINT = "endpoint2" as Uuid;
const AT = "2026-07-17T10:00:00.000Z" as ISODateString;
const LATER = "2026-07-17T10:05:00.000Z" as ISODateString;

const params = (
  overrides: Partial<CreateWebhookSubscriptionParams> = {},
): CreateWebhookSubscriptionParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  consumerId: CONSUMER,
  subscriptionKey: "enrolments",
  displayName: "Enrolment feed",
  endpointId: ENDPOINT,
  eventTypes: ["admissions.application.submitted"],
  secretRef: "vault:webhooks/enrolments",
  ...overrides,
});

const created = (overrides: Partial<CreateWebhookSubscriptionParams> = {}): WebhookSubscription =>
  createWebhookSubscription(params(overrides));

describe("subscribing a consumer to events", () => {
  it("starts sending immediately, because nothing new needs verifying", () => {
    const subscription = created();

    expect(subscription.status).toBe("active");
    expect(isWebhookSubscriptionSending(subscription)).toBe(true);
  });

  it("keeps the destination as a reference rather than a second copy of the address", () => {
    const subscription = created();

    expect(subscription.endpointId).toBe(ENDPOINT);
    expect(Object.keys(subscription)).not.toContain("url");
  });

  it("retries by default, because a missed event is usually worse than a late one", () => {
    expect(created().deliveryMode).toBe("at_least_once");
    expect(created({ deliveryMode: "at_most_once" }).deliveryMode).toBe("at_most_once");
  });

  it("opens with a clean failure run and nothing delivered", () => {
    const subscription = created();

    expect(subscription.consecutiveFailures).toBe(0);
    expect(subscription.lastDeliveryAt).toBeNull();
    expect(subscription.lastSuccessAt).toBeNull();
    expect(subscription.revokedAt).toBeNull();
  });

  it("normalises the key it will be referred to by", () => {
    expect(created({ subscriptionKey: "  Enrolments  " }).subscriptionKey).toBe("enrolments");
  });

  it("refuses a key that is blank or does not fit the platform's grammar", () => {
    expect(() => created({ subscriptionKey: "   " })).toThrow(EmptyGatewayKeyError);
    expect(() => created({ subscriptionKey: "enrolments!" })).toThrow(InvalidGatewayKeyError);
  });
});

describe("the set of events subscribed to", () => {
  it("holds a sorted, de-duplicated set so two identical configurations compare equal", () => {
    const subscription = created({
      eventTypes: ["student.enrolled", "admissions.offer.made", "student.enrolled"],
    });

    expect(subscription.eventTypes).toStrictEqual(["admissions.offer.made", "student.enrolled"]);
  });

  it("normalises each type on the way in", () => {
    expect(created({ eventTypes: ["  Student.Enrolled  "] }).eventTypes).toStrictEqual([
      "student.enrolled",
    ]);
  });

  it("refuses a subscription that would deliver nothing forever", () => {
    expect(() => created({ eventTypes: [] })).toThrow(NoEventTypesSubscribedError);
    expect(() => created({ eventTypes: ["  ", ""] })).toThrow(NoEventTypesSubscribedError);
  });

  it("refuses a malformed event type rather than dropping it quietly", () => {
    expect(() => created({ eventTypes: ["student.enrolled", "Student Enrolled"] })).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("hands back a set nobody downstream can extend", () => {
    expect(Object.isFrozen(created().eventTypes)).toBe(true);
  });

  it("replaces the whole set when a consumer resubscribes", () => {
    const subscription = resubscribeWebhookSubscription(created(), [
      "fees.invoice.issued",
      "fees.payment.received",
    ]);

    expect(subscription.eventTypes).toStrictEqual(["fees.invoice.issued", "fees.payment.received"]);
  });

  it("will not let a resubscription empty the set", () => {
    expect(() => resubscribeWebhookSubscription(created(), [])).toThrow(
      NoEventTypesSubscribedError,
    );
  });
});

describe("the signing secret", () => {
  it("holds a handle and never a secret", () => {
    expect(created().secretRef).toBe("vault:webhooks/enrolments");
  });

  it("refuses anything that looks like the secret itself", () => {
    expect(() => created({ secretRef: "whsec_9f2c1b903a44" })).toThrow(PlaintextCredentialError);
    expect(() => created({ secretRef: "https://vault.example/secret" })).toThrow(
      PlaintextCredentialError,
    );
  });

  it("permits a consumer who verifies deliveries another way", () => {
    expect(created({ secretRef: null }).secretRef).toBeNull();
    expect(created({ secretRef: "   " }).secretRef).toBeNull();
  });

  it("rotates to a new handle without learning what either one resolves to", () => {
    const rotated = rotateSubscriptionSecret(created(), "kms:webhooks/enrolments-2026");

    expect(rotated.secretRef).toBe("kms:webhooks/enrolments-2026");
  });

  it("refuses a rotation onto a plaintext value", () => {
    expect(() => rotateSubscriptionSecret(created(), "whsec_live")).toThrow(
      PlaintextCredentialError,
    );
  });
});

describe("subscription keys within a consumer", () => {
  it("refuses a key the same consumer already uses", () => {
    expect(() => requireUnusedSubscriptionKey([created()], CONSUMER, "Enrolments")).toThrow(
      DuplicateSubscriptionKeyError,
    );
  });

  it("lets two integrators both call theirs enrolments", () => {
    expect(() =>
      requireUnusedSubscriptionKey([created()], OTHER_CONSUMER, "enrolments"),
    ).not.toThrow();
  });

  it("permits a key nobody holds", () => {
    expect(() => requireUnusedSubscriptionKey([created()], CONSUMER, "fees")).not.toThrow();
  });
});

describe("editing a live subscription", () => {
  it("changes the label without moving the key deliveries are attributed to", () => {
    const renamed = renameWebhookSubscription(created(), "  Enrolment webhook  ");

    expect(renamed.displayName).toBe("Enrolment webhook");
    expect(renamed.subscriptionKey).toBe("enrolments");
  });

  it("sends through a different endpoint without disturbing the filter", () => {
    const rebound = rebindSubscriptionEndpoint(created(), OTHER_ENDPOINT);

    expect(rebound.endpointId).toBe(OTHER_ENDPOINT);
    expect(rebound.eventTypes).toStrictEqual(created().eventTypes);
  });

  it("refuses every edit once the consumer has ended it", () => {
    const revoked = revokeWebhookSubscription(created());

    expect(() => renameWebhookSubscription(revoked, "Anything")).toThrow(SubscriptionRevokedError);
    expect(() => rebindSubscriptionEndpoint(revoked, OTHER_ENDPOINT)).toThrow(
      SubscriptionRevokedError,
    );
    expect(() => resubscribeWebhookSubscription(revoked, ["fees.invoice.issued"])).toThrow(
      SubscriptionRevokedError,
    );
    expect(() => rotateSubscriptionSecret(revoked, null)).toThrow(SubscriptionRevokedError);
  });
});

describe("the consumer's pause and the platform's suspension", () => {
  it("stops sending at the consumer's own request, asking no reason", () => {
    const paused = pauseWebhookSubscription(created());

    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).not.toBeNull();
    expect(paused.suspendedReason).toBeNull();
    expect(isWebhookSubscriptionSending(paused)).toBe(false);
  });

  it("records what the platform concluded when it stops sending itself", () => {
    const suspended = suspendWebhookSubscription(created(), "  endpoint quarantined  ");

    expect(suspended.status).toBe("suspended");
    expect(suspended.suspendedReason).toBe("endpoint quarantined");
    expect(suspended.suspendedAt).not.toBeNull();
  });

  it("will not suspend without saying why", () => {
    expect(() => suspendWebhookSubscription(created(), "   ")).toThrow(EmptyGatewayKeyError);
  });

  it("keeps the two absences from turning into each other", () => {
    const paused = pauseWebhookSubscription(created());

    expect(() => suspendWebhookSubscription(paused, "endpoint quarantined")).toThrow(
      InvalidSubscriptionProgressionError,
    );
  });

  it("clears the failure run and both stamps on resumption", () => {
    const failing = recordSubscriptionOutcome(created(), "failed", AT);
    const resumed = resumeWebhookSubscription(
      suspendWebhookSubscription(failing, "endpoint quarantined"),
    );

    expect(resumed.status).toBe("active");
    expect(resumed.consecutiveFailures).toBe(0);
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.suspendedAt).toBeNull();
    expect(resumed.suspendedReason).toBeNull();
  });

  it("treats a repeated pause as a resubmission rather than a new refusal", () => {
    const paused = pauseWebhookSubscription(created());

    expect(() => pauseWebhookSubscription(paused)).toThrow(InvalidSubscriptionProgressionError);
  });
});

describe("ending a subscription", () => {
  it("ends from wherever it is, and keeps the record readable", () => {
    for (const subscription of [
      created(),
      pauseWebhookSubscription(created()),
      suspendWebhookSubscription(created(), "endpoint quarantined"),
    ]) {
      const revoked = revokeWebhookSubscription(subscription);

      expect(revoked.status).toBe("revoked");
      expect(revoked.revokedAt).not.toBeNull();
      expect(revoked.subscriptionKey).toBe("enrolments");
    }
  });

  it("cannot be brought back", () => {
    const revoked = revokeWebhookSubscription(created());

    expect(() => resumeWebhookSubscription(revoked)).toThrow(SubscriptionRevokedError);
    expect(() => revokeWebhookSubscription(revoked)).toThrow(SubscriptionRevokedError);
  });
});

describe("recording how deliveries have gone", () => {
  it("counts failures in a row and never changes the status itself", () => {
    const once = recordSubscriptionOutcome(created(), "failed", AT);
    const twice = recordSubscriptionOutcome(once, "failed", LATER);

    expect(twice.consecutiveFailures).toBe(2);
    expect(twice.status).toBe("active");
  });

  it("resets the run on any success", () => {
    const failing = recordSubscriptionOutcome(created(), "failed", AT);
    const recovered = recordSubscriptionOutcome(failing, "succeeded", LATER);

    expect(recovered.consecutiveFailures).toBe(0);
  });

  it("tells a quiet subscription apart from one failing every five minutes", () => {
    const failing = recordSubscriptionOutcome(created(), "failed", AT);

    expect(failing.lastDeliveryAt).toBe(AT);
    expect(failing.lastSuccessAt).toBeNull();

    const delivered = recordSubscriptionOutcome(failing, "succeeded", LATER);

    expect(delivered.lastDeliveryAt).toBe(LATER);
    expect(delivered.lastSuccessAt).toBe(LATER);
  });

  it("will not record against a subscription the consumer ended", () => {
    expect(() =>
      recordSubscriptionOutcome(revokeWebhookSubscription(created()), "failed", AT),
    ).toThrow(SubscriptionRevokedError);
  });
});

describe("what the fabric asks before sending", () => {
  it("sends only for an active subscription", () => {
    expect(() => requireSendingSubscription(created())).not.toThrow();
    expect(() => requireSendingSubscription(pauseWebhookSubscription(created()))).toThrow(
      SubscriptionNotSendingError,
    );
  });

  it("names the status, because the three ways to stop have three different remedies", () => {
    try {
      requireSendingSubscription(suspendWebhookSubscription(created(), "endpoint quarantined"));
      expect.unreachable("a suspended subscription should not have been sent to");
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionNotSendingError);
      expect((error as SubscriptionNotSendingError).message).toContain("suspended");
      expect((error as SubscriptionNotSendingError).message).toContain("enrolments");
    }
  });

  it("matches an event type exactly, without wildcards nobody decided to widen", () => {
    const subscription = created({ eventTypes: ["student.enrolled"] });

    expect(isSubscriptionInterestedIn(subscription, "Student.Enrolled")).toBe(true);
    expect(isSubscriptionInterestedIn(subscription, "student.enrolled.v2")).toBe(false);
    expect(isSubscriptionInterestedIn(subscription, "student.medical_note.created")).toBe(false);
  });
});

describe("what the consumer is shown", () => {
  it("keeps the institution's vault path out of the projection", () => {
    const view = toSubscriptionView(created());

    expect(Object.keys(view)).not.toContain("secretRef");
    expect(JSON.stringify(view)).not.toContain("vault:");
  });

  it("carries what a consumer needs to explain their own feed", () => {
    const view = toSubscriptionView(recordSubscriptionOutcome(created(), "failed", AT));

    expect(view.subscriptionKey).toBe("enrolments");
    expect(view.eventTypes).toStrictEqual(["admissions.application.submitted"]);
    expect(view.deliveryMode).toBe("at_least_once");
    expect(view.status).toBe("active");
    expect(view.consecutiveFailures).toBe(1);
  });

  it("hands back something a caller cannot quietly amend", () => {
    expect(Object.isFrozen(toSubscriptionView(created()))).toBe(true);
  });
});
