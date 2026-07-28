import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateLeverKeyError,
  DuplicateScenarioKeyError,
  EmptyLeverKeyError,
  EmptyScenarioError,
  EmptyScenarioKeyError,
  EmptyScenarioNameError,
  InadmissibleLeverError,
  InvalidScenarioTransitionError,
  LeverNotFoundError,
  PublishedScenarioImmutableError,
  ScenarioNotPublishedError,
} from "./errors";
import type { LeverInput, Scenario, ScenarioParams } from "./scenario";
import {
  addLever,
  addLevers,
  amendLever,
  amendScenario,
  archiveScenario,
  declareScenario,
  guardScenarioKeyAvailable,
  isScenarioSimulable,
  leverAt,
  leverCount,
  overridesBaseline,
  publishScenario,
  removeLever,
  requirePublishedScenario,
  reviseScenario,
  scenarioReference,
  variedAssumptionKeys,
} from "./scenario";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;

const lever = (overrides: Partial<LeverInput> = {}): LeverInput => ({
  leverKey: "enrolment.growth",
  kind: "growth_rate",
  magnitude: 1.04,
  ...overrides,
});

const params = (overrides: Partial<ScenarioParams> = {}): ScenarioParams => ({
  tenantId: TENANT,
  organizationId: ORGANIZATION,
  scenarioKey: "budget.austerity.2027",
  name: "Austerity case 2027",
  ...overrides,
});

const draft = (overrides: Partial<ScenarioParams> = {}): Scenario =>
  declareScenario(params({ levers: [lever()], ...overrides }));

const published = (overrides: Partial<ScenarioParams> = {}): Scenario =>
  publishScenario(draft(overrides));

const leverKeys = (scenario: Scenario): readonly string[] =>
  scenario.levers.map((entry) => entry.leverKey);

describe("declareScenario", () => {
  it("starts as an editable draft at version 1", () => {
    const scenario = declareScenario(params());

    expect(scenario.status).toBe("draft");
    expect(scenario.version).toBe(1);
    expect(scenario.levers).toEqual([]);
    expect(scenario.publishedAt).toBeNull();
    expect(scenario.archivedAt).toBeNull();
    expect(scenario.updatedAt).toBe(scenario.createdAt);
  });

  it("normalizes the scenario key and trims the name", () => {
    const scenario = declareScenario(
      params({ scenarioKey: "  Budget.Austerity.2027 ", name: "  Austerity case 2027  " }),
    );

    expect(scenario.scenarioKey).toBe("budget.austerity.2027");
    expect(scenario.name).toBe("Austerity case 2027");
  });

  it("defaults the description to null and trims one that is supplied", () => {
    expect(declareScenario(params()).description).toBeNull();
    expect(declareScenario(params({ description: "  Board case B  " })).description).toBe(
      "Board case B",
    );
  });

  it("refuses a blank scenario key", () => {
    expect(() => declareScenario(params({ scenarioKey: "   " }))).toThrow(EmptyScenarioKeyError);
  });

  it("refuses a blank name", () => {
    expect(() => declareScenario(params({ name: "  " }))).toThrow(EmptyScenarioNameError);
  });

  it("accepts levers at declaration and holds them in application order", () => {
    const scenario = declareScenario(
      params({
        levers: [
          lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 250 }),
          lever({ leverKey: "grant.fixed", kind: "override", magnitude: 4_000_000 }),
          lever({ leverKey: "enrolment.growth", kind: "growth_rate", magnitude: 1.04 }),
        ],
      }),
    );

    expect(leverKeys(scenario)).toEqual(["grant.fixed", "enrolment.growth", "fee.uplift"]);
    expect(scenario.version).toBe(1);
  });

  it("refuses a duplicate lever key inside the declaration batch", () => {
    expect(() =>
      declareScenario(params({ levers: [lever(), lever({ magnitude: 1.06 })] })),
    ).toThrow(DuplicateLeverKeyError);
  });
});

describe("amendScenario", () => {
  it("restates the name without advancing the version", () => {
    const scenario = draft();
    const amended = amendScenario(scenario, { name: "  Austerity case, revised  " });

    expect(amended.name).toBe("Austerity case, revised");
    expect(amended.version).toBe(scenario.version);
  });

  it("clears the description when null is supplied and leaves it when nothing is", () => {
    const scenario = draft({ description: "Board case B" });

    expect(amendScenario(scenario, { description: null }).description).toBeNull();
    expect(amendScenario(scenario, { name: "Renamed" }).description).toBe("Board case B");
  });

  it("refuses a blank name", () => {
    expect(() => amendScenario(draft(), { name: "   " })).toThrow(EmptyScenarioNameError);
  });

  it("refuses to touch a published scenario", () => {
    expect(() => amendScenario(published(), { name: "Renamed" })).toThrow(
      PublishedScenarioImmutableError,
    );
  });
});

describe("managing levers", () => {
  it("appends one lever and advances the version", () => {
    const scenario = addLever(
      draft(),
      lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 250 }),
    );

    expect(leverCount(scenario)).toBe(2);
    expect(scenario.version).toBe(2);
  });

  it("advances the version once for a batch, not once per lever", () => {
    const scenario = addLevers(draft(), [
      lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 250 }),
      lever({ leverKey: "staff.costs", kind: "multiplicative", magnitude: 1.08 }),
    ]);

    expect(leverCount(scenario)).toBe(3);
    expect(scenario.version).toBe(2);
  });

  it("returns the scenario untouched for an empty batch", () => {
    const scenario = draft();

    expect(addLevers(scenario, [])).toBe(scenario);
  });

  it("keeps levers in application order as they arrive", () => {
    const scenario = addLevers(declareScenario(params()), [
      lever({ leverKey: "z.additive", kind: "additive", magnitude: 1 }),
      lever({ leverKey: "a.additive", kind: "additive", magnitude: 2 }),
      lever({ leverKey: "m.override", kind: "override", magnitude: 3 }),
    ]);

    expect(leverKeys(scenario)).toEqual(["m.override", "a.additive", "z.additive"]);
  });

  it("normalizes the lever and assumption keys and rounds the magnitude", () => {
    const scenario = addLever(
      declareScenario(params()),
      lever({
        leverKey: "  Enrolment.Growth  ",
        kind: "multiplicative",
        magnitude: 1.234_567_89,
        assumptionKey: "  Enrolment.Trend  ",
      }),
    );

    expect(leverAt(scenario, "enrolment.growth")).toEqual({
      leverKey: "enrolment.growth",
      kind: "multiplicative",
      magnitude: 1.234_568,
      fromHorizon: 1,
      assumptionKey: "enrolment.trend",
    });
  });

  it("defaults fromHorizon to 1 and the assumption key to null", () => {
    const stored = leverAt(draft(), "enrolment.growth");

    expect(stored?.fromHorizon).toBe(1);
    expect(stored?.assumptionKey).toBeNull();
  });

  it("treats a blank assumption key as no assumption at all", () => {
    const scenario = addLever(
      declareScenario(params()),
      lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 1, assumptionKey: "   " }),
    );

    expect(leverAt(scenario, "fee.uplift")?.assumptionKey).toBeNull();
  });

  it("refuses a blank lever key", () => {
    expect(() => addLever(draft(), lever({ leverKey: "  " }))).toThrow(EmptyLeverKeyError);
  });

  it("refuses a lever key the scenario already carries, however it was cased", () => {
    expect(() => addLever(draft(), lever({ leverKey: "Enrolment.Growth" }))).toThrow(
      DuplicateLeverKeyError,
    );
  });

  it("leaves the scenario untouched when one lever in a batch is refused", () => {
    const scenario = draft();

    expect(() =>
      addLevers(scenario, [
        lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 250 }),
        lever({ leverKey: "staff.costs", kind: "multiplicative", magnitude: 99 }),
      ]),
    ).toThrow(InadmissibleLeverError);
    expect(leverCount(scenario)).toBe(1);
  });

  it("restates a lever and advances the version", () => {
    const scenario = amendLever(draft(), "enrolment.growth", { magnitude: 1.06, fromHorizon: 3 });

    expect(leverAt(scenario, "enrolment.growth")?.magnitude).toBe(1.06);
    expect(leverAt(scenario, "enrolment.growth")?.fromHorizon).toBe(3);
    expect(scenario.version).toBe(2);
  });

  it("returns the same scenario when an amendment changes nothing", () => {
    const scenario = draft();

    expect(amendLever(scenario, "enrolment.growth", { magnitude: 1.04 })).toBe(scenario);
  });

  it("clears a lever's assumption when null is supplied", () => {
    const scenario = draft({
      levers: [lever({ assumptionKey: "enrolment.trend" })],
    });
    const amended = amendLever(scenario, "enrolment.growth", { assumptionKey: null });

    expect(leverAt(amended, "enrolment.growth")?.assumptionKey).toBeNull();
  });

  it("re-validates a lever against its new kind", () => {
    const scenario = draft({
      levers: [lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 250 })],
    });

    expect(() => amendLever(scenario, "fee.uplift", { kind: "multiplicative" })).toThrow(
      InadmissibleLeverError,
    );
  });

  it("refuses to amend a lever the scenario does not carry", () => {
    expect(() => amendLever(draft(), "absent.lever", { magnitude: 2 })).toThrow(LeverNotFoundError);
  });

  it("removes a lever and advances the version", () => {
    const scenario = removeLever(draft(), "Enrolment.Growth");

    expect(leverCount(scenario)).toBe(0);
    expect(scenario.version).toBe(2);
  });

  it("refuses to remove a lever the scenario does not carry", () => {
    expect(() => removeLever(draft(), "absent.lever")).toThrow(LeverNotFoundError);
  });

  it("refuses every lever operation on a published scenario", () => {
    const scenario = published();

    expect(() => addLever(scenario, lever({ leverKey: "fee.uplift" }))).toThrow(
      PublishedScenarioImmutableError,
    );
    expect(() => amendLever(scenario, "enrolment.growth", { magnitude: 2 })).toThrow(
      PublishedScenarioImmutableError,
    );
    expect(() => removeLever(scenario, "enrolment.growth")).toThrow(
      PublishedScenarioImmutableError,
    );
  });
});

describe("what a lever refuses", () => {
  const reject = (overrides: Partial<LeverInput>): void => {
    expect(() => addLever(declareScenario(params()), lever(overrides))).toThrow(
      InadmissibleLeverError,
    );
  };

  it("refuses a magnitude that is not a number", () => {
    reject({ kind: "additive", magnitude: Number.NaN });
    reject({ kind: "additive", magnitude: Number.POSITIVE_INFINITY });
  });

  it("refuses a multiplicative factor beyond the admissible band", () => {
    reject({ kind: "multiplicative", magnitude: 10.5 });
    reject({ kind: "multiplicative", magnitude: -1 });
  });

  it("accepts a multiplicative factor at the edge of the band", () => {
    const scenario = addLever(
      declareScenario(params()),
      lever({ kind: "multiplicative", magnitude: 10 }),
    );

    expect(leverAt(scenario, "enrolment.growth")?.magnitude).toBe(10);
  });

  it("refuses a growth factor of zero", () => {
    reject({ kind: "growth_rate", magnitude: 0 });
  });

  it("refuses a factor that rounds away to nothing", () => {
    reject({ kind: "multiplicative", magnitude: 1e-9 });
  });

  it("refuses a starting horizon that is not a whole period at or after the first", () => {
    reject({ kind: "additive", magnitude: 1, fromHorizon: 0 });
    reject({ kind: "additive", magnitude: 1, fromHorizon: 1.5 });
  });

  it("puts no ceiling on an additive or override magnitude", () => {
    const scenario = addLevers(declareScenario(params()), [
      lever({ leverKey: "fee.uplift", kind: "additive", magnitude: 1e9 }),
      lever({ leverKey: "grant.fixed", kind: "override", magnitude: -5000 }),
    ]);

    expect(leverCount(scenario)).toBe(2);
  });
});

describe("publishScenario", () => {
  it("freezes the draft and stamps the publication", () => {
    const scenario = published();

    expect(scenario.status).toBe("published");
    expect(scenario.publishedAt).not.toBeNull();
  });

  it("does not advance the version", () => {
    const before = draft();

    expect(publishScenario(before).version).toBe(before.version);
  });

  it("refuses a scenario that moves nothing", () => {
    expect(() => publishScenario(declareScenario(params()))).toThrow(EmptyScenarioError);
  });

  it("refuses anything that is not a draft", () => {
    expect(() => publishScenario(published())).toThrow(InvalidScenarioTransitionError);
  });
});

describe("archiveScenario", () => {
  it("archives a published scenario and stamps it", () => {
    const scenario = archiveScenario(published());

    expect(scenario.status).toBe("archived");
    expect(scenario.archivedAt).not.toBeNull();
  });

  it("refuses a draft, which was never on the record", () => {
    expect(() => archiveScenario(draft())).toThrow(InvalidScenarioTransitionError);
  });
});

describe("reviseScenario", () => {
  it("opens a new draft under a new key, carrying the levers forward", () => {
    const original = published();
    const revised = reviseScenario(original, "  Budget.Austerity.2028  ");

    expect(revised.id).not.toBe(original.id);
    expect(revised.scenarioKey).toBe("budget.austerity.2028");
    expect(revised.status).toBe("draft");
    expect(revised.version).toBe(1);
    expect(revised.publishedAt).toBeNull();
    expect(leverKeys(revised)).toEqual(leverKeys(original));
  });

  it("leaves the scenario being revised exactly as it was", () => {
    const original = published();
    reviseScenario(original, "budget.austerity.2028");

    expect(original.status).toBe("published");
    expect(original.scenarioKey).toBe("budget.austerity.2027");
  });

  it("applies an amendment to the new draft", () => {
    const revised = reviseScenario(published(), "budget.austerity.2028", {
      name: "Austerity case 2028",
    });

    expect(revised.name).toBe("Austerity case 2028");
  });

  it("revises an archived scenario too", () => {
    const revised = reviseScenario(archiveScenario(published()), "budget.austerity.2028");

    expect(revised.status).toBe("draft");
  });

  it("refuses to revise a draft, which is already editable", () => {
    expect(() => reviseScenario(draft(), "budget.austerity.2028")).toThrow(
      InvalidScenarioTransitionError,
    );
  });
});

describe("guards", () => {
  it("passes a scenario key nothing has taken", () => {
    expect(() =>
      guardScenarioKeyAvailable("budget.growth.2027", ["budget.austerity.2027"]),
    ).not.toThrow();
  });

  it("refuses a taken scenario key however either side was cased", () => {
    expect(() =>
      guardScenarioKeyAvailable("  Budget.Austerity.2027 ", ["BUDGET.AUSTERITY.2027"]),
    ).toThrow(DuplicateScenarioKeyError);
  });

  it("returns a published scenario unchanged", () => {
    const scenario = published();

    expect(requirePublishedScenario(scenario)).toBe(scenario);
  });

  it("refuses to simulate a draft or an archived scenario", () => {
    expect(() => requirePublishedScenario(draft())).toThrow(ScenarioNotPublishedError);
    expect(() => requirePublishedScenario(archiveScenario(published()))).toThrow(
      ScenarioNotPublishedError,
    );
  });
});

describe("reading", () => {
  it("finds a lever by normalized key and reports absence as null", () => {
    const scenario = draft();

    expect(leverAt(scenario, "  ENROLMENT.GROWTH ")?.kind).toBe("growth_rate");
    expect(leverAt(scenario, "absent.lever")).toBeNull();
  });

  it("is simulable only once published and only while it moves something", () => {
    expect(isScenarioSimulable(draft())).toBe(false);
    expect(isScenarioSimulable(published())).toBe(true);
    expect(isScenarioSimulable(archiveScenario(published()))).toBe(false);
  });

  it("reports whether any lever replaces the baseline outright", () => {
    expect(overridesBaseline(draft())).toBe(false);
    expect(
      overridesBaseline(
        addLever(draft(), lever({ leverKey: "grant.fixed", kind: "override", magnitude: 4e6 })),
      ),
    ).toBe(true);
  });

  it("lists the distinct beliefs varied, in the order their levers are applied", () => {
    const scenario = declareScenario(
      params({
        levers: [
          lever({
            leverKey: "a.add",
            kind: "additive",
            magnitude: 10,
            assumptionKey: "enrolment.trend",
          }),
          lever({
            leverKey: "b.growth",
            kind: "growth_rate",
            magnitude: 1.04,
            assumptionKey: "enrolment.trend",
          }),
          lever({
            leverKey: "c.mult",
            kind: "multiplicative",
            magnitude: 1.1,
            assumptionKey: "fee.uplift",
          }),
          lever({ leverKey: "d.plain", kind: "additive", magnitude: 5 }),
        ],
      }),
    );

    expect(variedAssumptionKeys(scenario)).toEqual(["enrolment.trend", "fee.uplift"]);
  });

  it("reports no varied beliefs when no lever names one", () => {
    expect(variedAssumptionKeys(draft())).toEqual([]);
  });

  it("refers to itself by key and lever-set version", () => {
    const scenario = published();

    expect(scenarioReference(scenario)).toEqual({
      scenarioKey: "budget.austerity.2027",
      scenarioVersion: scenario.version,
    });
  });
});
