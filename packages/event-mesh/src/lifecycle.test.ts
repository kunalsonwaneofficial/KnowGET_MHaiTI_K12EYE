import type { ISODateString } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  inspectBindingTransition,
  inspectDeadLetterTransition,
  inspectEventTypeDeprecation,
  inspectEventTypeTransition,
  inspectMeshSubscriptionTransition,
  inspectPublication,
  inspectReplayTransition,
  inspectStreamTransition,
} from "./lifecycle";
import {
  BINDING_STATUSES,
  type BindingStatus,
  DEAD_LETTER_STATUSES,
  type DeadLetterStatus,
  EVENT_TYPE_STATUSES,
  type EventTypeStatus,
  MIN_DEPRECATION_NOTICE_DAYS,
  REPLAY_STATUSES,
  type ReplayStatus,
  STREAM_STATUSES,
  SUBSCRIPTION_STATUSES,
  type StreamStatus,
  type SubscriptionStatus,
} from "./mesh-value";
import type {
  EventTypeDeprecationRequest,
  PublicationRequest,
  TransitionVerdict,
} from "./mesh-view";

const EVENT_TYPE_KEY = "student-lifecycle.enrolment";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const NOW = "2027-01-02T09:15:00.000Z" as ISODateString;

/** The instant a whole number of days from the fixture instant. Negative values run backwards. */
const daysFrom = (days: number): ISODateString =>
  new Date(Date.parse(NOW) + days * 86_400_000).toISOString() as ISODateString;

/**
 * The edges each vocabulary permits, restated here rather than imported.
 *
 * The maps in the engine are private on purpose, and a test that read them would assert only that the engine
 * agrees with itself. Writing them out a second time is what makes a silently added edge fail the suite.
 */
const EVENT_TYPE_EDGES: Readonly<Record<EventTypeStatus, readonly EventTypeStatus[]>> = {
  draft: ["published", "retired"],
  published: ["deprecated"],
  deprecated: ["retired"],
  retired: [],
};

const STREAM_EDGES: Readonly<Record<StreamStatus, readonly StreamStatus[]>> = {
  draft: ["active", "retired"],
  active: ["paused", "retired"],
  paused: ["active", "retired"],
  retired: [],
};

const BINDING_EDGES: Readonly<Record<BindingStatus, readonly BindingStatus[]>> = {
  declared: ["active", "retired"],
  active: ["draining"],
  draining: ["retired"],
  retired: [],
};

const SUBSCRIPTION_EDGES: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  registered: ["active", "retired"],
  active: ["paused", "retired"],
  paused: ["active", "retired"],
  retired: [],
};

const DEAD_LETTER_EDGES: Readonly<Record<DeadLetterStatus, readonly DeadLetterStatus[]>> = {
  open: ["replayed", "discarded"],
  replayed: [],
  discarded: [],
};

const REPLAY_EDGES: Readonly<Record<ReplayStatus, readonly ReplayStatus[]>> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["running", "cancelled"],
  rejected: [],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Walk every ordered pair a vocabulary admits and assert the verdict each one gets.
 *
 * Exhaustive rather than sampled because the interesting cases in a progression map are the pairs nobody thought
 * to write a test for: a resumed retirement, a reopened dead letter, a rejected replay being run anyway.
 */
const expectProgression = <TStatus extends string>(
  statuses: readonly TStatus[],
  edges: Readonly<Record<TStatus, readonly TStatus[]>>,
  inspect: (from: TStatus, to: TStatus) => TransitionVerdict,
): void => {
  for (const from of statuses) {
    for (const to of statuses) {
      const verdict = inspect(from, to);
      expect(Object.isFrozen(verdict)).toBe(true);

      if (from === to) {
        expect(verdict).toEqual({ allowed: false, refusal: "same_status" });
      } else if (edges[from].length === 0) {
        expect(verdict).toEqual({ allowed: false, refusal: "terminal_status" });
      } else if (edges[from].includes(to)) {
        expect(verdict).toEqual({ allowed: true, refusal: null });
      } else {
        expect(verdict).toEqual({ allowed: false, refusal: "not_permitted" });
      }
    }
  }
};

describe("status progression", () => {
  it("moves an event type through the notice period and never around it", () => {
    expectProgression(EVENT_TYPE_STATUSES, EVENT_TYPE_EDGES, inspectEventTypeTransition);
    expect(inspectEventTypeTransition("published", "retired").allowed).toBe(false);
    expect(inspectEventTypeTransition("deprecated", "published").allowed).toBe(false);
  });

  it("lets a stream be paused and resumed, and retires it permanently", () => {
    expectProgression(STREAM_STATUSES, STREAM_EDGES, inspectStreamTransition);
    expect(inspectStreamTransition("paused", "active").allowed).toBe(true);
    expect(inspectStreamTransition("retired", "active").refusal).toBe("terminal_status");
  });

  it("makes a carrying binding drain before it retires", () => {
    expectProgression(BINDING_STATUSES, BINDING_EDGES, inspectBindingTransition);
    expect(inspectBindingTransition("active", "retired").refusal).toBe("not_permitted");
    expect(inspectBindingTransition("declared", "retired").allowed).toBe(true);
    expect(inspectBindingTransition("draining", "active").allowed).toBe(false);
  });

  it("lets a subscription be paused and resumed, and releases its checkpoint once", () => {
    expectProgression(SUBSCRIPTION_STATUSES, SUBSCRIPTION_EDGES, inspectMeshSubscriptionTransition);
    expect(inspectMeshSubscriptionTransition("paused", "active").allowed).toBe(true);
    expect(inspectMeshSubscriptionTransition("retired", "active").refusal).toBe("terminal_status");
  });

  it("closes a dead letter one way and refuses to reopen it", () => {
    expectProgression(DEAD_LETTER_STATUSES, DEAD_LETTER_EDGES, inspectDeadLetterTransition);
    expect(inspectDeadLetterTransition("discarded", "open").refusal).toBe("terminal_status");
    expect(inspectDeadLetterTransition("replayed", "discarded").refusal).toBe("terminal_status");
  });

  it("keeps the three terminal replay failures apart and leaves the stop button reachable", () => {
    expectProgression(REPLAY_STATUSES, REPLAY_EDGES, inspectReplayTransition);
    expect(inspectReplayTransition("running", "cancelled").allowed).toBe(true);
    expect(inspectReplayTransition("rejected", "approved").refusal).toBe("terminal_status");
    expect(inspectReplayTransition("requested", "running").refusal).toBe("not_permitted");
  });

  it("reports a resubmission as such rather than as a lifecycle complaint", () => {
    for (const status of STREAM_STATUSES) {
      expect(inspectStreamTransition(status, status).refusal).toBe("same_status");
    }
    for (const status of REPLAY_STATUSES) {
      expect(inspectReplayTransition(status, status).refusal).toBe("same_status");
    }
  });
});

const publication = (overrides: Partial<PublicationRequest> = {}): PublicationRequest => ({
  eventTypeKey: EVENT_TYPE_KEY,
  version: 2,
  status: "published",
  deprecatedAt: null,
  retireAt: null,
  asOf: NOW,
  ...overrides,
});

describe("inspectPublication", () => {
  it("accepts a published version that nobody has deprecated", () => {
    const verdict = inspectPublication(publication());

    expect(verdict).toEqual({
      publishable: true,
      deprecated: false,
      daysUntilRetirement: null,
      reason: "within_notice",
    });
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("refuses a draft, which is a shape nobody has agreed to yet", () => {
    expect(inspectPublication(publication({ status: "draft" }))).toEqual({
      publishable: false,
      deprecated: false,
      daysUntilRetirement: null,
      reason: "event_type_not_publishable",
    });
  });

  it("refuses a retired version whatever the calendar says", () => {
    const verdict = inspectPublication(
      publication({ status: "retired", deprecatedAt: daysFrom(-200), retireAt: daysFrom(-10) }),
    );

    expect(verdict.publishable).toBe(false);
    expect(verdict.reason).toBe("event_type_retired");
    expect(verdict.daysUntilRetirement).toBe(0);
  });

  it("reports a version as undeprecated at an instant before its announcement", () => {
    const verdict = inspectPublication(
      publication({
        status: "deprecated",
        deprecatedAt: daysFrom(10),
        retireAt: daysFrom(120),
      }),
    );

    expect(verdict).toEqual({
      publishable: true,
      deprecated: false,
      daysUntilRetirement: null,
      reason: "within_notice",
    });
  });

  it("treats the announcement instant itself as announced", () => {
    const verdict = inspectPublication(
      publication({ status: "deprecated", deprecatedAt: NOW, retireAt: daysFrom(90) }),
    );

    expect(verdict.deprecated).toBe(true);
    expect(verdict.daysUntilRetirement).toBe(90);
  });

  it("counts down whole days to a retirement that has been set", () => {
    const verdict = inspectPublication(
      publication({ status: "deprecated", deprecatedAt: daysFrom(-30), retireAt: daysFrom(60) }),
    );

    expect(verdict).toEqual({
      publishable: true,
      deprecated: true,
      daysUntilRetirement: 60,
      reason: "within_notice",
    });
  });

  it("keeps publishing a deprecated version for which no retirement date has been set", () => {
    const verdict = inspectPublication(
      publication({ status: "deprecated", deprecatedAt: daysFrom(-30), retireAt: null }),
    );

    expect(verdict).toEqual({
      publishable: true,
      deprecated: true,
      daysUntilRetirement: null,
      reason: "within_notice",
    });
  });

  it("stops accepting publications the moment the retirement instant arrives", () => {
    const verdict = inspectPublication(
      publication({ status: "deprecated", deprecatedAt: daysFrom(-90), retireAt: NOW }),
    );

    expect(verdict).toEqual({
      publishable: false,
      deprecated: true,
      daysUntilRetirement: 0,
      reason: "event_type_retired",
    });
  });

  it("refuses a version whose retirement has passed although its status has not caught up", () => {
    const verdict = inspectPublication(
      publication({ status: "deprecated", deprecatedAt: daysFrom(-120), retireAt: daysFrom(-5) }),
    );

    expect(verdict.publishable).toBe(false);
    expect(verdict.daysUntilRetirement).toBe(0);
  });
});

const deprecation = (
  overrides: Partial<EventTypeDeprecationRequest> = {},
): EventTypeDeprecationRequest => ({
  eventTypeKey: EVENT_TYPE_KEY,
  version: 2,
  status: "published",
  announcedAt: NOW,
  retireAt: daysFrom(MIN_DEPRECATION_NOTICE_DAYS),
  ...overrides,
});

describe("inspectEventTypeDeprecation", () => {
  it("accepts a notice exactly as long as the floor, which is the floor rather than the far side", () => {
    const verdict = inspectEventTypeDeprecation(deprecation());

    expect(verdict).toEqual({
      allowed: true,
      noticeDays: MIN_DEPRECATION_NOTICE_DAYS,
      refusal: null,
    });
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("deprecates only a published version", () => {
    for (const status of EVENT_TYPE_STATUSES) {
      const verdict = inspectEventTypeDeprecation(deprecation({ status }));
      if (status === "published") {
        expect(verdict.allowed).toBe(true);
      } else {
        expect(verdict).toEqual({ allowed: false, noticeDays: 0, refusal: "not_published" });
      }
    }
  });

  it("names a transposed pair of dates as such rather than as short notice", () => {
    const verdict = inspectEventTypeDeprecation(
      deprecation({ announcedAt: daysFrom(30), retireAt: NOW }),
    );

    expect(verdict).toEqual({
      allowed: false,
      noticeDays: 0,
      refusal: "retirement_before_announcement",
    });
  });

  it("refuses one day short of the floor and reports the notice actually offered", () => {
    const verdict = inspectEventTypeDeprecation(
      deprecation({ retireAt: daysFrom(MIN_DEPRECATION_NOTICE_DAYS - 1) }),
    );

    expect(verdict).toEqual({
      allowed: false,
      noticeDays: MIN_DEPRECATION_NOTICE_DAYS - 1,
      refusal: "notice_too_short",
    });
  });

  it("refuses a retirement announced for the same day", () => {
    expect(inspectEventTypeDeprecation(deprecation({ retireAt: NOW }))).toEqual({
      allowed: false,
      noticeDays: 0,
      refusal: "notice_too_short",
    });
  });

  it("accepts notice longer than the floor requires", () => {
    const verdict = inspectEventTypeDeprecation(
      deprecation({ retireAt: daysFrom(MIN_DEPRECATION_NOTICE_DAYS + 275) }),
    );

    expect(verdict.allowed).toBe(true);
    expect(verdict.noticeDays).toBe(MIN_DEPRECATION_NOTICE_DAYS + 275);
  });
});
