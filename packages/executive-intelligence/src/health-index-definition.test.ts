import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { INDEX_STATUSES } from "./command-value";
import type { PillarInput, PillarWeight } from "./command-view";
import {
  EmptyIndexKeyError,
  EmptyIndexNameError,
  FrozenIndexDefinitionError,
  IndexWeightsFrozenError,
  InvalidIndexTransitionError,
  SelfSupersedingIndexError,
  UnusableIndexWeightsError,
} from "./errors";
import {
  type DefineHealthIndexParams,
  type HealthIndexDefinition,
  declaredPillars,
  defineHealthIndex,
  isHealthIndexPublishable,
  isHealthIndexPublished,
  publishHealthIndex,
  renameHealthIndex,
  retireHealthIndex,
  reweightHealthIndex,
  runHealthIndex,
  supersedeHealthIndex,
} from "./health-index-definition";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const SUCCESSOR = "def-2" as Uuid;

/** Six of ten pillars, each inside the admissible band, totalling one. What publication accepts. */
const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

/** Two faults in one set: it spans a single pillar, and that pillar is most of the index. */
const BROKEN_WEIGHTS: readonly PillarWeight[] = [{ pillar: "academic_outcomes", weight: 0.9 }];

const base: DefineHealthIndexParams = {
  tenantId: TENANT,
  organizationId: ORG,
  indexKey: "institutional.health",
  name: "Institutional health",
  grain: "term",
  weights: WEIGHTS,
};

const draft = (patch: Partial<DefineHealthIndexParams> = {}): HealthIndexDefinition =>
  defineHealthIndex({ ...base, ...patch });

const published = (patch: Partial<DefineHealthIndexParams> = {}): HealthIndexDefinition =>
  publishHealthIndex(draft(patch));

const superseded = (patch: Partial<DefineHealthIndexParams> = {}): HealthIndexDefinition =>
  supersedeHealthIndex(published(patch), SUCCESSOR);

const retired = (patch: Partial<DefineHealthIndexParams> = {}): HealthIndexDefinition =>
  retireHealthIndex(draft(patch));

/** Whether publication would in fact go through, so the read-side predicate can be held against it. */
const publishes = (definition: HealthIndexDefinition): boolean => {
  try {
    publishHealthIndex(definition);
    return true;
  } catch {
    return false;
  }
};

const reported = (
  pillar: PillarWeight["pillar"],
  score: number,
  kpisRead = 4,
  kpisDeclared = 5,
): PillarInput => ({ pillar, score, kpisRead, kpisDeclared });

describe("declaring a composition", () => {
  it("starts as a draft, which is the only window in which no assessment can exist", () => {
    const definition = draft();

    expect(definition.status).toBe("draft");
    expect(definition.publishedAt).toBeNull();
    expect(definition.supersededAt).toBeNull();
    expect(definition.retiredAt).toBeNull();
    expect(definition.supersededById).toBeNull();
  });

  it("takes its tenancy and its grain from what it was declared with", () => {
    const definition = draft();

    expect(definition.tenantId).toBe(TENANT);
    expect(definition.organizationId).toBe(ORG);
    expect(definition.grain).toBe("term");
  });

  it("normalizes the key every assessment and panel will address it by", () => {
    expect(draft({ indexKey: "  Institutional.HEALTH  " }).indexKey).toBe("institutional.health");
  });

  it("refuses a key nothing could be addressed by", () => {
    let thrown: unknown;
    try {
      draft({ indexKey: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyIndexKeyError);
    expect((thrown as EmptyIndexKeyError).httpStatus).toBe(422);
  });

  it("refuses a composition nobody could name in a board paper", () => {
    let thrown: unknown;
    try {
      draft({ name: "  " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyIndexNameError);
    expect((thrown as EmptyIndexNameError).httpStatus).toBe(422);
  });

  it("trims the name and reads a blank description as none", () => {
    const definition = draft({ name: "  Institutional health  ", description: "   " });

    expect(definition.name).toBe("Institutional health");
    expect(definition.description).toBeNull();
  });

  it("keeps a description somebody wrote", () => {
    expect(draft({ description: "  Board headline  " }).description).toBe("Board headline");
  });

  it("saves a weighting still being argued about rather than pushing the argument into a spreadsheet", () => {
    const definition = draft({ weights: BROKEN_WEIGHTS });

    expect(definition.status).toBe("draft");
    expect(definition.weights).toEqual(BROKEN_WEIGHTS);
  });

  it("detaches the weighting from the array the caller passed", () => {
    const mutable: PillarWeight[] = [...WEIGHTS];
    const definition = defineHealthIndex({ ...base, weights: mutable });

    mutable.push({ pillar: "governance_compliance", weight: 0.5 });

    expect(definition.weights).toHaveLength(WEIGHTS.length);
  });
});

describe("arguing about the weighting", () => {
  it("reweights a draft, which is what a draft is for", () => {
    const lighter: readonly PillarWeight[] = WEIGHTS.map((entry) => ({ ...entry }));
    const definition = reweightHealthIndex(draft(), lighter);

    expect(definition.weights).toEqual(lighter);
    expect(definition.status).toBe("draft");
  });

  it("detaches the replacement weighting too", () => {
    const mutable: PillarWeight[] = [...WEIGHTS];
    const definition = reweightHealthIndex(draft(), mutable);

    mutable.length = 0;

    expect(definition.weights).toHaveLength(WEIGHTS.length);
  });

  it("keeps the moment the composition was first declared", () => {
    const original = draft();

    expect(reweightHealthIndex(original, WEIGHTS).createdAt).toBe(original.createdAt);
  });

  it("leaves the definition it was handed alone", () => {
    const original = draft();
    reweightHealthIndex(original, BROKEN_WEIGHTS);

    expect(original.weights).toEqual(WEIGHTS);
  });
});

describe("rule — the weights freeze at publication", () => {
  it("refuses a reweight once assessments can exist under the composition", () => {
    let thrown: unknown;
    try {
      reweightHealthIndex(published(), BROKEN_WEIGHTS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexWeightsFrozenError);
    expect((thrown as IndexWeightsFrozenError).details).toEqual({
      id: expect.any(String),
      status: "published",
    });
    expect((thrown as IndexWeightsFrozenError).httpStatus).toBe(409);
  });

  it("names the remedy rather than only the rule, because the need is legitimate", () => {
    let thrown: unknown;
    try {
      reweightHealthIndex(published(), WEIGHTS);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as IndexWeightsFrozenError).message).toContain("supersede");
  });

  it("refuses a reweight of a composition that is already history", () => {
    let thrown: unknown;
    try {
      reweightHealthIndex(superseded(), WEIGHTS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FrozenIndexDefinitionError);
    expect((thrown as FrozenIndexDefinitionError).details).toMatchObject({ status: "superseded" });
  });

  it("refuses a reweight of a retired composition", () => {
    let thrown: unknown;
    try {
      reweightHealthIndex(retired(), WEIGHTS);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FrozenIndexDefinitionError);
    expect((thrown as FrozenIndexDefinitionError).details).toMatchObject({ status: "retired" });
  });
});

describe("putting a composition into service", () => {
  it("puts it into service and records when", () => {
    const definition = published();

    expect(definition.status).toBe("published");
    expect(definition.publishedAt).not.toBeNull();
  });

  it("inspects the weighting here, at the one moment somebody is present to fix it", () => {
    let thrown: unknown;
    try {
      publishHealthIndex(draft({ weights: BROKEN_WEIGHTS }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusableIndexWeightsError);
    expect((thrown as UnusableIndexWeightsError).httpStatus).toBe(422);
  });

  it("reports every fault at once, in the weighting engine's own vocabulary", () => {
    let thrown: unknown;
    try {
      publishHealthIndex(draft({ weights: BROKEN_WEIGHTS }));
    } catch (error) {
      thrown = error;
    }

    expect((thrown as UnusableIndexWeightsError).details).toEqual({
      indexKey: "institutional.health",
      issues: expect.arrayContaining(["too_few_pillars", "weight_above_maximum"]),
    });
  });

  it("refuses to publish a composition that is already in service", () => {
    let thrown: unknown;
    try {
      publishHealthIndex(published());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
    expect((thrown as InvalidIndexTransitionError).details).toEqual({
      from: "published",
      to: "published",
    });
  });

  it("refuses to publish a composition the institution retired", () => {
    let thrown: unknown;
    try {
      publishHealthIndex(retired());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
    expect((thrown as InvalidIndexTransitionError).details).toEqual({
      from: "retired",
      to: "published",
    });
  });
});

describe("renaming a composition", () => {
  it("renames one in service, because a label is not part of computing a value", () => {
    const definition = renameHealthIndex(published(), { name: "  School health  " });

    expect(definition.name).toBe("School health");
    expect(definition.status).toBe("published");
  });

  it("leaves the description alone when it was not mentioned", () => {
    const original = draft({ description: "Board headline" });

    expect(renameHealthIndex(original, { name: "School health" }).description).toBe(
      "Board headline",
    );
  });

  it("clears the description when asked to", () => {
    const original = draft({ description: "Board headline" });

    expect(
      renameHealthIndex(original, { name: "School health", description: null }).description,
    ).toBeNull();
  });

  it("refuses a blank replacement name", () => {
    let thrown: unknown;
    try {
      renameHealthIndex(draft(), { name: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyIndexNameError);
  });

  it("refuses to rename a superseded composition another aggregate is quoting", () => {
    let thrown: unknown;
    try {
      renameHealthIndex(superseded(), { name: "School health" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FrozenIndexDefinitionError);
    expect((thrown as FrozenIndexDefinitionError).httpStatus).toBe(409);
  });

  it("refuses to rename a retired composition", () => {
    let thrown: unknown;
    try {
      renameHealthIndex(retired(), { name: "School health" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FrozenIndexDefinitionError);
  });
});

describe("handing a composition over to its successor", () => {
  it("records which composition took over, and when", () => {
    const definition = superseded();

    expect(definition.status).toBe("superseded");
    expect(definition.supersededById).toBe(SUCCESSOR);
    expect(definition.supersededAt).not.toBeNull();
  });

  it("keeps the weighting it was computing under, so its assessments stay explicable", () => {
    expect(superseded().weights).toEqual(WEIGHTS);
  });

  it("refuses to supersede a draft, under which nothing was ever computed", () => {
    let thrown: unknown;
    try {
      supersedeHealthIndex(draft(), SUCCESSOR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
    expect((thrown as InvalidIndexTransitionError).details).toEqual({
      from: "draft",
      to: "superseded",
    });
  });

  it("refuses to fork the chain by superseding an already superseded composition", () => {
    let thrown: unknown;
    try {
      supersedeHealthIndex(superseded(), "def-3" as Uuid);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
    expect((thrown as InvalidIndexTransitionError).details).toEqual({
      from: "superseded",
      to: "superseded",
    });
  });

  it("refuses the one loop it can see for itself", () => {
    const definition = published();

    let thrown: unknown;
    try {
      supersedeHealthIndex(definition, definition.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SelfSupersedingIndexError);
    expect((thrown as SelfSupersedingIndexError).details).toEqual({ id: definition.id });
    expect((thrown as SelfSupersedingIndexError).httpStatus).toBe(422);
  });
});

describe("retiring a composition", () => {
  it("retires one that never ran, because the argument about it is institutional memory", () => {
    const definition = retired();

    expect(definition.status).toBe("retired");
    expect(definition.retiredAt).not.toBeNull();
  });

  it("retires one that was in service", () => {
    expect(retireHealthIndex(published()).status).toBe("retired");
  });

  it("refuses to retire a superseded composition, which already says what happened", () => {
    let thrown: unknown;
    try {
      retireHealthIndex(superseded());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
    expect((thrown as InvalidIndexTransitionError).details).toEqual({
      from: "superseded",
      to: "retired",
    });
  });

  it("refuses a second retirement", () => {
    let thrown: unknown;
    try {
      retireHealthIndex(retired());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidIndexTransitionError);
  });

  it("reaches every status the vocabulary declares", () => {
    const reached = [draft(), published(), superseded(), retired()].map(
      (definition) => definition.status,
    );

    expect(new Set(reached)).toEqual(new Set(INDEX_STATUSES));
  });
});

describe("reading a composition", () => {
  it("says whether assessments may be computed under it", () => {
    expect(isHealthIndexPublished(published())).toBe(true);
    expect(isHealthIndexPublished(draft())).toBe(false);
    expect(isHealthIndexPublished(superseded())).toBe(false);
    expect(isHealthIndexPublished(retired())).toBe(false);
  });

  it("offers publication exactly when publication would succeed", () => {
    const candidates = [draft(), draft({ weights: BROKEN_WEIGHTS }), published(), retired()];

    for (const candidate of candidates) {
      expect(isHealthIndexPublishable(candidate)).toBe(publishes(candidate));
    }
  });

  it("gives the pillars in declaration order, which is what breaks ties when ranking", () => {
    expect(declaredPillars(draft())).toEqual([
      "academic_outcomes",
      "teaching_quality",
      "attendance_engagement",
      "financial_health",
      "learner_wellbeing",
      "workforce_capacity",
    ]);
  });

  it("computes the composite from the definition's own weighting", () => {
    const verdict = runHealthIndex(published(), [
      reported("academic_outcomes", 80),
      reported("teaching_quality", 70),
      reported("attendance_engagement", 90),
      reported("financial_health", 60),
      reported("learner_wellbeing", 50),
      reported("workforce_capacity", 40),
    ]);

    expect(verdict.value).toBe(70);
    expect(verdict.band).toBe("healthy");
    expect(verdict.pillarCoverage).toBe(1);
    expect(verdict.sufficient).toBe(true);
  });

  it("refuses nothing and stores nothing, so an author can watch the number while arguing", () => {
    const definition = draft({ weights: BROKEN_WEIGHTS });
    const verdict = runHealthIndex(definition, [reported("academic_outcomes", 55)]);

    expect(verdict.value).toBe(55);
    expect(definition.status).toBe("draft");
  });

  it("accounts for every declared pillar, as a contribution or as an omission", () => {
    const verdict = runHealthIndex(published(), [
      reported("academic_outcomes", 80),
      reported("teaching_quality", 70),
    ]);

    expect(verdict.contributions).toHaveLength(2);
    expect(verdict.omissions.map((entry) => entry.pillar)).toEqual([
      "attendance_engagement",
      "financial_health",
      "learner_wellbeing",
      "workforce_capacity",
    ]);
  });

  it("sets aside a pillar the composition never declared rather than folding it in", () => {
    const verdict = runHealthIndex(published(), [
      reported("academic_outcomes", 80),
      reported("governance_compliance", 10),
    ]);

    expect(verdict.contributions.map((entry) => entry.pillar)).toEqual(["academic_outcomes"]);
    expect(verdict.omissions).toContainEqual(
      expect.objectContaining({ pillar: "governance_compliance", reason: "not_weighted" }),
    );
  });
});
