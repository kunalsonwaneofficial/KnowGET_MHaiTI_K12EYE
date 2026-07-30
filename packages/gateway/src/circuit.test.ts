import { describe, expect, it } from "vitest";
import type { ISODateString } from "@knowget/types";
import { inspectCircuit } from "./circuit";
import { InvalidOutcomeCountError } from "./errors";
import type { OutcomeWindow } from "./gateway-view";

const SINCE = "2026-07-17T10:00:00.000Z" as ISODateString;
const AS_OF = "2026-07-17T10:00:30.000Z" as ISODateString;

const window = (overrides: Partial<OutcomeWindow> = {}): OutcomeWindow => ({
  successes: 0,
  failures: 0,
  consecutiveFailures: 0,
  posture: "closed",
  postureSince: SINCE,
  asOf: AS_OF,
  ...overrides,
});

describe("figures the engine will not work with", () => {
  it("refuses a tally that is not a whole count", () => {
    expect(() => inspectCircuit(window({ successes: -1 }))).toThrow(InvalidOutcomeCountError);
    expect(() => inspectCircuit(window({ failures: 2.5 }))).toThrow(InvalidOutcomeCountError);
    expect(() => inspectCircuit(window({ consecutiveFailures: -2 }))).toThrow(
      InvalidOutcomeCountError,
    );
  });

  it("refuses a run of failures longer than the failures observed", () => {
    expect(() => inspectCircuit(window({ failures: 2, consecutiveFailures: 3 }))).toThrow(
      InvalidOutcomeCountError,
    );
  });

  it("keeps the defect off the operator's screen", () => {
    try {
      inspectCircuit(window({ failures: -1 }));
      expect.unreachable("a negative failure count should not have been assessed");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOutcomeCountError);
      expect((error as InvalidOutcomeCountError).isOperational).toBe(false);
    }
  });
});

describe("a circuit that is closed", () => {
  it("stays closed while the calls are succeeding", () => {
    const verdict = inspectCircuit(window({ successes: 50 }));

    expect(verdict.posture).toBe("closed");
    expect(verdict.changed).toBe(false);
    expect(verdict.probeDue).toBe(false);
  });

  it("opens on a run of failures without waiting for a sample to accumulate", () => {
    const verdict = inspectCircuit(window({ failures: 5, consecutiveFailures: 5 }));

    expect(verdict.posture).toBe("open");
    expect(verdict.changed).toBe(true);
    expect(verdict.observed).toBe(5);
  });

  it("holds one short of the run, which is what stops a blip closing a working integration", () => {
    expect(inspectCircuit(window({ failures: 4, consecutiveFailures: 4 })).posture).toBe("closed");
  });

  it("opens on a failure rate once the sample is large enough to mean anything", () => {
    expect(inspectCircuit(window({ successes: 10, failures: 10 })).posture).toBe("open");
  });

  it("will not open on a rate computed from too few calls", () => {
    const verdict = inspectCircuit(window({ successes: 1, failures: 3 }));

    expect(verdict.failureRatio).toBe(0.75);
    expect(verdict.posture).toBe("closed");
  });

  it("catches the endpoint that fails steadily without ever failing twice in a row", () => {
    const verdict = inspectCircuit(window({ successes: 40, failures: 60, consecutiveFailures: 1 }));

    expect(verdict.posture).toBe("open");
  });

  it("leaves a mostly-working endpoint in service", () => {
    expect(inspectCircuit(window({ successes: 80, failures: 20 })).posture).toBe("closed");
  });
});

describe("a circuit that is open", () => {
  const open = { posture: "open" as const, failures: 5, consecutiveFailures: 5 };

  it("stays shut while the wait is still running", () => {
    const verdict = inspectCircuit(
      window({ ...open, asOf: "2026-07-17T10:00:59.000Z" as ISODateString }),
    );

    expect(verdict.posture).toBe("open");
    expect(verdict.probeDue).toBe(false);
  });

  it("offers a probe once the wait is up, without being asked to", () => {
    const verdict = inspectCircuit(
      window({ ...open, asOf: "2026-07-17T10:01:00.000Z" as ISODateString }),
    );

    expect(verdict.posture).toBe("half_open");
    expect(verdict.probeDue).toBe(true);
    expect(verdict.changed).toBe(true);
  });
});

describe("a circuit that is half open", () => {
  const probing = { posture: "half_open" as const, postureSince: AS_OF };

  it("closes once enough probes have come back", () => {
    const verdict = inspectCircuit(window({ ...probing, successes: 3 }));

    expect(verdict.posture).toBe("closed");
    expect(verdict.changed).toBe(true);
  });

  it("keeps probing while the answer is still incomplete", () => {
    const verdict = inspectCircuit(window({ ...probing, successes: 2 }));

    expect(verdict.posture).toBe("half_open");
    expect(verdict.probeDue).toBe(true);
    expect(verdict.changed).toBe(false);
  });

  it("re-opens on a single failed probe, because a probe is a question with one answer", () => {
    const verdict = inspectCircuit(
      window({ ...probing, successes: 9, failures: 1, consecutiveFailures: 1 }),
    );

    expect(verdict.posture).toBe("open");
  });
});

describe("what the operator is told", () => {
  it("says nothing is known when nothing has been observed", () => {
    const verdict = inspectCircuit(window());

    expect(verdict.health).toBe("unknown");
    expect(verdict.failureRatio).toBeNull();
    expect(verdict.observed).toBe(0);
  });

  it("calls a working endpoint healthy", () => {
    expect(inspectCircuit(window({ successes: 100 })).health).toBe("healthy");
  });

  it("reports the slow bleed as degraded while still calling the endpoint", () => {
    const verdict = inspectCircuit(window({ successes: 88, failures: 12 }));

    expect(verdict.posture).toBe("closed");
    expect(verdict.health).toBe("degraded");
  });

  it("calls an open circuit unreachable whatever the sample behind it says", () => {
    const verdict = inspectCircuit(
      window({ successes: 95, failures: 5, consecutiveFailures: 5, posture: "closed" }),
    );

    expect(verdict.posture).toBe("open");
    expect(verdict.health).toBe("unreachable");
  });

  it("calls an endpoint under probe degraded rather than well", () => {
    expect(
      inspectCircuit(window({ posture: "half_open", postureSince: AS_OF, successes: 2 })).health,
    ).toBe("degraded");
  });

  it("reports the ratio it decided on, so the decision can be checked", () => {
    expect(inspectCircuit(window({ successes: 3, failures: 1 })).failureRatio).toBe(0.25);
  });
});

describe("determinism", () => {
  it("answers for the instant it is asked about rather than for now", () => {
    const open = { posture: "open" as const, failures: 5, consecutiveFailures: 5 };

    const early = inspectCircuit(
      window({ ...open, asOf: "2026-07-17T10:00:01.000Z" as ISODateString }),
    );
    const late = inspectCircuit(
      window({ ...open, asOf: "2026-07-17T11:00:00.000Z" as ISODateString }),
    );

    expect(early.posture).toBe("open");
    expect(late.posture).toBe("half_open");
  });

  it("gives the same verdict for the same window every time", () => {
    expect(inspectCircuit(window({ successes: 7, failures: 3 }))).toEqual(
      inspectCircuit(window({ successes: 7, failures: 3 })),
    );
  });

  it("hands back a verdict nothing downstream can edit", () => {
    const verdict = inspectCircuit(window({ successes: 5 }));

    expect(Object.isFrozen(verdict)).toBe(true);
  });
});
