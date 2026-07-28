import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateModelVersionError,
  EmptyModelKeyError,
  EmptyModelNameError,
  InvalidModelParameterError,
  InvalidModelTransitionError,
  ModelNotPublishedError,
  PublishedModelImmutableError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import {
  amendModel,
  draftForecastModel,
  guardParameters,
  guardVersionAvailable,
  isModelRunnable,
  modelReadsCycle,
  modelReference,
  nextModelVersion,
  normalizeConfidenceLevels,
  publishModel,
  requirePublishedModel,
  retireModel,
  reviseModel,
} from "./forecast-model";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;

const params = (overrides: Partial<ForecastModelParams> = {}): ForecastModelParams => ({
  tenantId: TENANT,
  organizationId: ORGANIZATION,
  modelKey: "attendance.baseline",
  name: "Attendance baseline",
  method: "naive",
  ...overrides,
});

const draft = (overrides: Partial<ForecastModelParams> = {}): ForecastModel =>
  draftForecastModel(params(overrides));

const published = (overrides: Partial<ForecastModelParams> = {}): ForecastModel =>
  publishModel(draft(overrides), 1);

describe("draftForecastModel", () => {
  it("starts as an unpublished draft at version zero", () => {
    const model = draft();
    expect(model.status).toBe("draft");
    expect(model.version).toBe(0);
    expect(model.publishedAt).toBeNull();
    expect(isModelRunnable(model)).toBe(false);
  });

  it("normalizes the model key and trims the name", () => {
    const model = draft({ modelKey: " Attendance.Baseline ", name: "  Attendance baseline  " });
    expect(model.modelKey).toBe("attendance.baseline");
    expect(model.name).toBe("Attendance baseline");
  });

  it("refuses a blank key or a blank name", () => {
    expect(() => draft({ modelKey: "  " })).toThrow(EmptyModelKeyError);
    expect(() => draft({ name: "   " })).toThrow(EmptyModelNameError);
  });

  it("always carries the required confidence level, even when none was asked for", () => {
    expect(draft().confidenceLevels).toEqual([80]);
    expect(draft({ confidenceLevels: [50, 95] }).confidenceLevels).toEqual([50, 80, 95]);
  });
});

describe("normalizeConfidenceLevels", () => {
  it("sorts, dedupes and restores the required level", () => {
    expect(normalizeConfidenceLevels([95, 50, 95])).toEqual([50, 80, 95]);
  });

  it("discards levels this package has no multiplier for", () => {
    expect(normalizeConfidenceLevels([90, 99, 50])).toEqual([50, 80]);
  });
});

describe("guardParameters", () => {
  it("keeps a window size the moving-average method reads", () => {
    expect(guardParameters("moving_average", { windowSize: 4 })).toEqual({ windowSize: 4 });
  });

  it("keeps an alpha the exponential smoother reads", () => {
    expect(guardParameters("exponential_smoothing", { alpha: 0.4 })).toEqual({ alpha: 0.4 });
  });

  it("accepts absence, because every parameter has a documented default", () => {
    expect(guardParameters("naive", {})).toEqual({});
  });

  it("refuses a parameter the method does not read", () => {
    // It would change the run's digest without changing a single number the run produces.
    expect(() => guardParameters("moving_average", { alpha: 0.3 })).toThrow(
      InvalidModelParameterError,
    );
    expect(() => guardParameters("naive", { windowSize: 3 })).toThrow(InvalidModelParameterError);
  });

  it("refuses rather than clamps a value outside the method's band", () => {
    expect(() => guardParameters("exponential_smoothing", { alpha: 1.7 })).toThrow(
      InvalidModelParameterError,
    );
    expect(() => guardParameters("exponential_smoothing", { alpha: 0 })).toThrow(
      InvalidModelParameterError,
    );
    expect(() => guardParameters("moving_average", { windowSize: 0 })).toThrow(
      InvalidModelParameterError,
    );
    expect(() => guardParameters("moving_average", { windowSize: 2.5 })).toThrow(
      InvalidModelParameterError,
    );
  });

  it("accepts an alpha of exactly one, the closed end of the band", () => {
    expect(guardParameters("exponential_smoothing", { alpha: 1 })).toEqual({ alpha: 1 });
  });
});

describe("amendModel", () => {
  it("changes a draft in place", () => {
    const model = amendModel(draft(), { name: "Renamed", description: " a note " });
    expect(model.name).toBe("Renamed");
    expect(model.description).toBe("a note");
  });

  it("drops parameters the new method cannot read when the method changes", () => {
    const smoother = draft({ method: "exponential_smoothing", parameters: { alpha: 0.5 } });
    expect(amendModel(smoother, { method: "naive" }).parameters).toEqual({});
  });

  it("re-validates supplied parameters against the new method", () => {
    const smoother = draft({ method: "exponential_smoothing", parameters: { alpha: 0.5 } });
    expect(() => amendModel(smoother, { method: "naive", parameters: { alpha: 0.5 } })).toThrow(
      InvalidModelParameterError,
    );
  });

  it("refuses to edit a published model", () => {
    expect(() => amendModel(published(), { name: "Renamed" })).toThrow(
      PublishedModelImmutableError,
    );
  });

  it("refuses to edit a retired model", () => {
    expect(() => amendModel(retireModel(published()), { name: "Renamed" })).toThrow(
      PublishedModelImmutableError,
    );
  });

  it("refuses to blank the name", () => {
    expect(() => amendModel(draft(), { name: "  " })).toThrow(EmptyModelNameError);
  });
});

describe("publishModel", () => {
  it("mints the version and freezes the model", () => {
    const model = publishModel(draft(), 3);
    expect(model.status).toBe("published");
    expect(model.version).toBe(3);
    expect(model.publishedAt).not.toBeNull();
    expect(isModelRunnable(model)).toBe(true);
  });

  it("refuses a version that is not a whole number of at least one", () => {
    expect(() => publishModel(draft(), 0)).toThrow(InvalidModelParameterError);
    expect(() => publishModel(draft(), 1.5)).toThrow(InvalidModelParameterError);
  });

  it("refuses to publish twice", () => {
    expect(() => publishModel(published(), 2)).toThrow(InvalidModelTransitionError);
  });
});

describe("retireModel", () => {
  it("stops new runs without touching the version", () => {
    const model = retireModel(published());
    expect(model.status).toBe("retired");
    expect(model.version).toBe(1);
    expect(model.retiredAt).not.toBeNull();
    expect(isModelRunnable(model)).toBe(false);
  });

  it("refuses to retire a draft", () => {
    expect(() => retireModel(draft())).toThrow(InvalidModelTransitionError);
  });
});

describe("reviseModel", () => {
  it("opens a new draft under the same key without touching the published version", () => {
    const live = published({ method: "moving_average", parameters: { windowSize: 3 } });
    const revision = reviseModel(live, { parameters: { windowSize: 6 } });

    expect(revision.id).not.toBe(live.id);
    expect(revision.modelKey).toBe(live.modelKey);
    expect(revision.status).toBe("draft");
    expect(revision.version).toBe(0);
    expect(revision.parameters).toEqual({ windowSize: 6 });

    expect(live.status).toBe("published");
    expect(live.version).toBe(1);
    expect(live.parameters).toEqual({ windowSize: 3 });
  });

  it("carries the settings forward when nothing is amended", () => {
    const live = published({ method: "moving_average", parameters: { windowSize: 3 } });
    const revision = reviseModel(live);
    expect(revision.method).toBe("moving_average");
    expect(revision.parameters).toEqual({ windowSize: 3 });
    expect(revision.confidenceLevels).toEqual(live.confidenceLevels);
  });

  it("revises a retired version too", () => {
    expect(reviseModel(retireModel(published())).status).toBe("draft");
  });

  it("refuses to revise a draft, which is already editable", () => {
    expect(() => reviseModel(draft())).toThrow(InvalidModelTransitionError);
  });
});

describe("versions", () => {
  it("offers the next free version", () => {
    expect(nextModelVersion([])).toBe(1);
    expect(nextModelVersion([1, 2, 5])).toBe(6);
  });

  it("refuses a version already taken under the key", () => {
    expect(() => guardVersionAvailable("attendance.baseline", 2, [1, 2])).toThrow(
      DuplicateModelVersionError,
    );
    expect(() => guardVersionAvailable("attendance.baseline", 3, [1, 2])).not.toThrow();
  });
});

describe("reading", () => {
  it("refuses anything but a published version to a run", () => {
    expect(() => requirePublishedModel(draft())).toThrow(ModelNotPublishedError);
    expect(() => requirePublishedModel(retireModel(published()))).toThrow(ModelNotPublishedError);
    expect(requirePublishedModel(published()).status).toBe("published");
  });

  it("reports whether the method consumes the seasonal cycle", () => {
    expect(modelReadsCycle(draft({ method: "seasonal_naive" }))).toBe(true);
    expect(modelReadsCycle(draft({ method: "linear_trend" }))).toBe(false);
  });

  it("exposes the reference a run pins", () => {
    expect(modelReference(published())).toEqual({
      modelKey: "attendance.baseline",
      modelVersion: 1,
    });
  });
});
