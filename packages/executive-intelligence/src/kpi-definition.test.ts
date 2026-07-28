import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { KPI_STATUSES, MAX_NORMALIZED_SCORE, MIN_NORMALIZED_SCORE } from "./command-value";
import type { MeasurementScale, ScoreAnchor } from "./command-view";
import {
  EmptyKpiKeyError,
  EmptyKpiNameError,
  EmptyKpiSourceDomainError,
  InvalidKpiTransitionError,
  KpiScaleFrozenError,
  KpiTargetOutOfRangeError,
  RetiredKpiImmutableError,
  UnusableKpiScaleError,
} from "./errors";
import {
  type DefineKpiParams,
  type KpiDefinition,
  activateKpi,
  defineKpi,
  isKpiActivatable,
  isKpiActive,
  isKpiRetired,
  renameKpi,
  retargetKpi,
  retireKpi,
  reviseKpiScale,
  scoreKpiMeasure,
} from "./kpi-definition";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const anchors = (...pairs: readonly (readonly [number, number])[]): readonly ScoreAnchor[] =>
  pairs.map(([value, score]) => ({ value, score }));

/** Attendance percentage: 85 is failing at this school, 96 is exemplary. Usable, so activation accepts it. */
const scale = (patch: Partial<MeasurementScale> = {}): MeasurementScale => ({
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: anchors([85, 0], [90, 50], [93, 70], [96, 100]),
  ...patch,
});

/** Three faults in one anchor list: too few of them, a value off the unit, and a score off the scale. */
const brokenScale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: anchors([140, 120]),
};

const base: DefineKpiParams = {
  tenantId: TENANT,
  organizationId: ORG,
  kpiKey: "attendance.rate",
  name: "Attendance rate",
  pillar: "attendance_engagement",
  sourceDomain: "attendance",
  scale: scale(),
  targetScore: 80,
};

const draft = (patch: Partial<DefineKpiParams> = {}): KpiDefinition =>
  defineKpi({ ...base, ...patch });

const active = (patch: Partial<DefineKpiParams> = {}): KpiDefinition => activateKpi(draft(patch));

const retired = (patch: Partial<DefineKpiParams> = {}): KpiDefinition => retireKpi(active(patch));

/** Whether activation would in fact go through, so the read-side predicate can be held against it. */
const activates = (definition: KpiDefinition): boolean => {
  try {
    activateKpi(definition);
    return true;
  } catch {
    return false;
  }
};

describe("declaring an indicator", () => {
  it("starts as a draft nothing can yet be filed against", () => {
    const definition = draft();
    expect(definition.status).toBe("draft");
    expect(definition.activatedAt).toBeNull();
    expect(definition.retiredAt).toBeNull();
    expect(definition.id).toHaveLength(36);
    expect(definition.createdAt).toBe(definition.updatedAt);
  });

  it("keeps what it was told about the indicator", () => {
    const definition = draft();
    expect(definition.tenantId).toBe(TENANT);
    expect(definition.organizationId).toBe(ORG);
    expect(definition.name).toBe("Attendance rate");
    expect(definition.pillar).toBe("attendance_engagement");
    expect(definition.targetScore).toBe(80);
    expect(definition.scale.unit).toBe("percentage");
  });

  it("canonicalizes the key and the owning domain, which are matched by exact string", () => {
    const definition = draft({ kpiKey: "  Attendance.RATE ", sourceDomain: " Attendance " });
    expect(definition.kpiKey).toBe("attendance.rate");
    expect(definition.sourceDomain).toBe("attendance");
  });

  it("refuses an indicator nothing could address", () => {
    expect(() => draft({ kpiKey: "" })).toThrow(EmptyKpiKeyError);
    expect(() => draft({ kpiKey: "   " })).toThrow(EmptyKpiKeyError);
  });

  it("refuses an indicator nobody could recognise on a dashboard", () => {
    expect(() => draft({ name: "  \t " })).toThrow(EmptyKpiNameError);
  });

  it("refuses an indicator nobody could be asked about", () => {
    expect(() => draft({ sourceDomain: "  " })).toThrow(EmptyKpiSourceDomainError);
  });

  it("trims a description and reads a blank one as none", () => {
    expect(draft({ description: "  Daily register rate  " }).description).toBe(
      "Daily register rate",
    );
    expect(draft({ description: "   " }).description).toBeNull();
    expect(draft().description).toBeNull();
  });

  it("takes no target when the institution declares none", () => {
    expect(draft({ targetScore: null }).targetScore).toBeNull();
    expect(draft({ targetScore: undefined }).targetScore).toBeNull();
  });

  it("refuses a target that is not a point on the normalized scale", () => {
    expect(() => draft({ targetScore: 101 })).toThrow(KpiTargetOutOfRangeError);
    expect(() => draft({ targetScore: -1 })).toThrow(KpiTargetOutOfRangeError);
    expect(() => draft({ targetScore: Number.NaN })).toThrow(KpiTargetOutOfRangeError);
    expect(() => draft({ targetScore: Number.POSITIVE_INFINITY })).toThrow(
      KpiTargetOutOfRangeError,
    );
  });

  it("says which target it refused", () => {
    let thrown: unknown;
    try {
      draft({ targetScore: 140 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KpiTargetOutOfRangeError);
    expect((thrown as KpiTargetOutOfRangeError).details).toEqual({ targetScore: 140 });
    expect((thrown as KpiTargetOutOfRangeError).httpStatus).toBe(422);
  });

  it("accepts a target at either end of the scale", () => {
    expect(draft({ targetScore: MIN_NORMALIZED_SCORE }).targetScore).toBe(0);
    expect(draft({ targetScore: MAX_NORMALIZED_SCORE }).targetScore).toBe(100);
  });

  it("saves a half-built scale, because activation is the gate and not this", () => {
    const definition = draft({ scale: brokenScale });
    expect(definition.status).toBe("draft");
    expect(definition.scale.anchors).toHaveLength(1);
  });

  it("detaches the scale from the array it was handed", () => {
    const mutable: ScoreAnchor[] = [
      { value: 85, score: 0 },
      { value: 96, score: 100 },
    ];
    const definition = draft({
      scale: { unit: "percentage", polarity: "higher_is_better", anchors: mutable },
    });
    mutable[0] = { value: 0, score: 100 };
    expect(definition.scale.anchors).not.toBe(mutable);
    expect(definition.scale.anchors[0]).toEqual({ value: 85, score: 0 });
  });
});

describe("rule — the scale freezes at activation", () => {
  it("re-anchors a draft, which is the whole window in which no reading exists", () => {
    const revised = reviseKpiScale(draft(), scale({ anchors: anchors([80, 0], [98, 100]) }));
    expect(revised.scale.anchors).toHaveLength(2);
    expect(revised.status).toBe("draft");
  });

  it("refuses to re-anchor an indicator in service, and names the remedy", () => {
    let thrown: unknown;
    try {
      reviseKpiScale(active(), scale());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KpiScaleFrozenError);
    expect((thrown as KpiScaleFrozenError).details).toMatchObject({ status: "active" });
    expect((thrown as KpiScaleFrozenError).httpStatus).toBe(409);
    expect((thrown as KpiScaleFrozenError).message).toContain("retire it and declare a successor");
  });

  it("refuses to re-anchor a retired indicator on the stronger ground that it is history", () => {
    expect(() => reviseKpiScale(retired(), scale())).toThrow(RetiredKpiImmutableError);
  });

  it("detaches a revised scale from the array it was handed", () => {
    const mutable: ScoreAnchor[] = [
      { value: 80, score: 0 },
      { value: 98, score: 100 },
    ];
    const revised = reviseKpiScale(draft(), {
      unit: "percentage",
      polarity: "higher_is_better",
      anchors: mutable,
    });
    mutable.push({ value: 99, score: 100 });
    expect(revised.scale.anchors).toHaveLength(2);
  });
});

describe("what an indicator may still say about itself", () => {
  it("renames one in service, because a label is not part of producing a score", () => {
    const renamed = renameKpi(active(), { name: "  Daily attendance rate  " });
    expect(renamed.name).toBe("Daily attendance rate");
    expect(renamed.status).toBe("active");
    expect(renamed.scale).toEqual(active().scale);
  });

  it("leaves the description alone when the rename does not mention it", () => {
    const described = draft({ description: "Register-based" });
    expect(renameKpi(described, { name: "Attendance" }).description).toBe("Register-based");
  });

  it("clears a description only when asked to in so many words", () => {
    const described = draft({ description: "Register-based" });
    expect(renameKpi(described, { name: "Attendance", description: null }).description).toBeNull();
    expect(renameKpi(described, { name: "Attendance", description: "  " }).description).toBeNull();
  });

  it("refuses to rename an indicator to nothing", () => {
    expect(() => renameKpi(active(), { name: "   " })).toThrow(EmptyKpiNameError);
  });

  it("moves the target on a live indicator, because a target restates no past figure", () => {
    const raised = retargetKpi(active(), 95);
    expect(raised.targetScore).toBe(95);
    expect(raised.status).toBe("active");
  });

  it("drops a target the institution no longer declares", () => {
    expect(retargetKpi(active(), null).targetScore).toBeNull();
  });

  it("refuses a target off the normalized scale wherever it is set", () => {
    expect(() => retargetKpi(active(), 101)).toThrow(KpiTargetOutOfRangeError);
    expect(() => retargetKpi(draft(), Number.NaN)).toThrow(KpiTargetOutOfRangeError);
  });

  it("moves a retired indicator in no respect at all", () => {
    const history = retired();
    expect(() => renameKpi(history, { name: "Anything" })).toThrow(RetiredKpiImmutableError);
    expect(() => retargetKpi(history, 50)).toThrow(RetiredKpiImmutableError);
    expect(() => reviseKpiScale(history, scale())).toThrow(RetiredKpiImmutableError);
  });

  it("says which indicator it refused to move", () => {
    const history = retired();
    let thrown: unknown;
    try {
      retargetKpi(history, 50);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RetiredKpiImmutableError);
    expect((thrown as RetiredKpiImmutableError).details).toEqual({ id: history.id });
  });

  it("carries the key and the pillar through every change it does allow", () => {
    const live = active();
    const moved = retargetKpi(renameKpi(live, { name: "Daily attendance" }), 95);
    expect(moved.kpiKey).toBe(live.kpiKey);
    expect(moved.pillar).toBe(live.pillar);
    expect(retireKpi(moved).kpiKey).toBe(live.kpiKey);
  });
});

describe("putting an indicator into service", () => {
  it("stamps the moment measurement started", () => {
    const start = draft();
    const live = activateKpi(start);
    expect(live.status).toBe("active");
    expect(live.activatedAt).not.toBeNull();
    expect(live.retiredAt).toBeNull();
    expect(live.createdAt).toBe(start.createdAt);
  });

  it("refuses a scale nothing could be interpolated against", () => {
    expect(() => activateKpi(draft({ scale: brokenScale }))).toThrow(UnusableKpiScaleError);
  });

  it("reports every fault in the scale at once rather than the next one after each fix", () => {
    let thrown: unknown;
    try {
      activateKpi(draft({ scale: brokenScale }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnusableKpiScaleError);
    expect((thrown as UnusableKpiScaleError).details).toMatchObject({
      kpiKey: "attendance.rate",
      issues: expect.arrayContaining([
        "too_few_anchors",
        "inadmissible_anchor_value",
        "score_out_of_range",
      ]),
    });
    expect((thrown as UnusableKpiScaleError).httpStatus).toBe(422);
  });

  it("refuses a scale that cannot reach the healthy band, which would report a school in crisis", () => {
    expect(() =>
      activateKpi(draft({ scale: scale({ anchors: anchors([85, 0], [96, 60]) }) })),
    ).toThrow(UnusableKpiScaleError);
  });

  it("refuses to activate what is already in service", () => {
    let thrown: unknown;
    try {
      activateKpi(active());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidKpiTransitionError);
    expect((thrown as InvalidKpiTransitionError).details).toEqual({
      from: "active",
      to: "active",
    });
  });

  it("refuses to bring a retired indicator back", () => {
    expect(() => activateKpi(retired())).toThrow(InvalidKpiTransitionError);
  });

  it("leaves the draft it was handed exactly as it was", () => {
    const before = draft();
    activateKpi(before);
    expect(before.status).toBe("draft");
    expect(before.activatedAt).toBeNull();
  });
});

describe("retiring an indicator", () => {
  it("stops the catalog offering it and stamps when", () => {
    const history = retired();
    expect(history.status).toBe("retired");
    expect(history.retiredAt).not.toBeNull();
  });

  it("keeps the moment it went into service, so its readings still explain themselves", () => {
    const live = active();
    expect(retireKpi(live).activatedAt).toBe(live.activatedAt);
  });

  it("retires a draft nobody ever ran, because deciding against an indicator is memory too", () => {
    const abandoned = retireKpi(draft());
    expect(abandoned.status).toBe("retired");
    expect(abandoned.activatedAt).toBeNull();
  });

  it("retires an indicator whose scale would never have activated", () => {
    expect(retireKpi(draft({ scale: brokenScale })).status).toBe("retired");
  });

  it("refuses a second retirement", () => {
    let thrown: unknown;
    try {
      retireKpi(retired());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidKpiTransitionError);
    expect((thrown as InvalidKpiTransitionError).details).toEqual({
      from: "retired",
      to: "retired",
    });
  });
});

describe("reading a definition", () => {
  it("reaches every status the vocabulary declares, and no other", () => {
    expect(new Set([draft().status, active().status, retired().status])).toEqual(
      new Set(KPI_STATUSES),
    );
  });

  it("says whether readings may be filed against it", () => {
    expect(isKpiActive(draft())).toBe(false);
    expect(isKpiActive(active())).toBe(true);
    expect(isKpiActive(retired())).toBe(false);
  });

  it("says whether the institution has stopped measuring it", () => {
    expect(isKpiRetired(draft())).toBe(false);
    expect(isKpiRetired(active())).toBe(false);
    expect(isKpiRetired(retired())).toBe(true);
  });

  it("offers activation exactly when taking it would succeed", () => {
    for (const definition of [draft(), draft({ scale: brokenScale }), active(), retired()]) {
      expect(isKpiActivatable(definition)).toBe(activates(definition));
    }
  });
});

describe("scoring against an indicator's own scale", () => {
  it("interpolates between the anchors the institution declared", () => {
    expect(scoreKpiMeasure(active(), 93)).toEqual({
      scoreable: true,
      raw: 93,
      score: 70,
      band: "healthy",
      clamp: "none",
    });
    expect(scoreKpiMeasure(active(), 90)).toMatchObject({ score: 50, band: "watch" });
  });

  it("scores the same figure differently for two institutions that anchored differently", () => {
    const strict = active({ scale: scale({ anchors: anchors([90, 0], [100, 100]) }) });
    expect(scoreKpiMeasure(active(), 93)).toMatchObject({ score: 70 });
    expect(scoreKpiMeasure(strict, 93)).toMatchObject({ score: 30 });
  });

  it("says a figure sat off the end of the scale rather than hiding it in the score", () => {
    expect(scoreKpiMeasure(active(), 99)).toMatchObject({ score: 100, clamp: "above" });
    expect(scoreKpiMeasure(active(), 40)).toMatchObject({ score: 0, clamp: "below" });
  });

  it("records a refusal instead of throwing, because a corrupt feed is worth seeing", () => {
    expect(scoreKpiMeasure(active(), 140)).toEqual({
      scoreable: false,
      raw: 140,
      reason: "inadmissible_value",
    });
    expect(scoreKpiMeasure(active(), Number.NaN)).toMatchObject({ scoreable: false });
  });

  it("says a draft's unusable scale cannot score, which is why activation refuses it", () => {
    expect(scoreKpiMeasure(draft({ scale: brokenScale }), 90)).toEqual({
      scoreable: false,
      raw: 90,
      reason: "unusable_scale",
    });
  });
});
