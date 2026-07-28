import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ConfidenceLevel, ForecastMethod, ModelStatus } from "./forecast-value";
import {
  CONFIDENCE_LEVELS,
  REQUIRED_CONFIDENCE_LEVEL,
  isSeasonalMethod,
  normalizeModelKey,
} from "./forecast-value";
import type { ProjectionParameters } from "./forecast-view";
import {
  DuplicateModelVersionError,
  EmptyModelKeyError,
  EmptyModelNameError,
  InvalidModelParameterError,
  InvalidModelTransitionError,
  ModelNotPublishedError,
  PublishedModelImmutableError,
} from "./errors";

/**
 * A named, frozen, versioned way of producing a forecast — the *how* a run points at.
 *
 * A run could carry its own method and parameters and skip this aggregate entirely. It would also then be the
 * only record of them, and the institution would have no way to ask what changed between the March forecast and
 * the June one beyond diffing two rows and hoping the fields line up. A model gives the method an identity that
 * outlives any single run, which is what makes "we retuned it in April" a fact the platform holds rather than
 * something a person remembers.
 *
 * **Publishing freezes.** A published model cannot be edited, only revised into a new version, and the reason is
 * the second half of the contract's fourth rule. Every run that pinned version 3 recorded its method and
 * parameters by reference; editing version 3 afterwards would rewrite the inputs of runs that have already been
 * published, acted on and cited. The digest would still agree — the model version did not move — while the
 * numbers no longer reproduced, which is precisely the silent failure the digest exists to catch. So the answer
 * to "we want to change it" is {@link reviseModel}: a new draft, a new version, and both versions on the record.
 *
 * **Parameters are refused rather than clamped.** {@link resolveParameters} clamps at computation time and pins
 * what it resolved, which is right there — a caller who asked for a twelve-period window against nine
 * observations still gets a forecast, and an exact record of the window that produced it. Here the situation is
 * different: nothing is being computed yet, so a nonsensical `alpha` of `1.7` would be stored, published,
 * pinned by every run that used the model, and quietly ignored by the arithmetic. The record would attest to an
 * input that never influenced anything.
 *
 * That is also why a parameter the method does not read is refused. `canonicalize` renders `windowSize` and
 * `alpha` for every method, so an `alpha` sitting on a `moving_average` model changes the digest of every run
 * that pins it without changing a single number those runs produce — two runs that computed identically would
 * report `parameters_changed` at each other. A drift code that fires on something that cannot matter is worse
 * than no drift code, because the next one is ignored too.
 *
 * **The required confidence level cannot be dropped.** Rather than validating that a caller remembered it,
 * {@link normalizeConfidenceLevels} puts it back. There is no state of this aggregate in which the level the
 * contract demands is absent, so no run derived from it can be missing the interval that makes it a forecast
 * rather than a number.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ForecastModel {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Stable across every version. `(modelKey, version)` is what a run pins. */
  readonly modelKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly method: ForecastMethod;
  /** Only the parameters this method actually reads. Validated at declaration, resolved at computation. */
  readonly parameters: ProjectionParameters;
  /** Always sorted, always unique, always containing {@link REQUIRED_CONFIDENCE_LEVEL}. */
  readonly confidenceLevels: readonly ConfidenceLevel[];
  /** `0` while unpublished. Minted on publication and frozen with the rest of the model. */
  readonly version: number;
  readonly status: ModelStatus;
  readonly publishedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ForecastModelParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly modelKey: string;
  readonly name: string;
  readonly description?: string | null;
  readonly method: ForecastMethod;
  readonly parameters?: ProjectionParameters;
  readonly confidenceLevels?: readonly number[];
}

/** What may be changed while a model is still a draft. */
export interface ForecastModelAmendment {
  readonly name?: string;
  readonly description?: string | null;
  readonly method?: ForecastMethod;
  readonly parameters?: ProjectionParameters;
  readonly confidenceLevels?: readonly number[];
}

// --- Declaration -----------------------------------------------------------------

/** Draft a model. Nothing may be run from it until it is published. */
export function draftForecastModel(params: ForecastModelParams): ForecastModel {
  const modelKey = normalizeModelKey(params.modelKey);
  if (modelKey.length === 0) throw new EmptyModelKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyModelNameError();

  const method = params.method;
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    modelKey,
    name,
    description: params.description?.trim() ?? null,
    method,
    parameters: guardParameters(method, params.parameters ?? {}),
    confidenceLevels: normalizeConfidenceLevels(params.confidenceLevels ?? []),
    version: 0,
    status: "draft",
    publishedAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Change a draft.
 *
 * Amending the method re-validates the parameters against the new method, because the pair is what is valid or
 * not — an `alpha` that was legitimate under `exponential_smoothing` becomes an unread parameter the moment the
 * method becomes `naive`, and silently carrying it forward is how a model ends up pinned to an input it ignores.
 */
export function amendModel(model: ForecastModel, amendment: ForecastModelAmendment): ForecastModel {
  guardDraft(model);

  const name = amendment.name === undefined ? model.name : amendment.name.trim();
  if (name.length === 0) throw new EmptyModelNameError();

  const method = amendment.method ?? model.method;
  const parameters =
    amendment.parameters ?? (amendment.method === undefined ? model.parameters : {});

  return touch(model, {
    name,
    description:
      amendment.description === undefined
        ? model.description
        : (amendment.description?.trim() ?? null),
    method,
    parameters: guardParameters(method, parameters),
    confidenceLevels:
      amendment.confidenceLevels === undefined
        ? model.confidenceLevels
        : normalizeConfidenceLevels(amendment.confidenceLevels),
  });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Publish the draft at a version, freezing it.
 *
 * The version is supplied rather than derived, because uniqueness across a model key is a property of the whole
 * set of versions and this aggregate can only see one. {@link guardVersionAvailable} is how a service that has
 * seen the set closes that gap.
 */
export function publishModel(model: ForecastModel, version: number): ForecastModel {
  if (model.status !== "draft") throw new InvalidModelTransitionError(model.status, "published");
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidModelParameterError("version", version, "a whole number of at least 1");
  }
  return touch(model, { version, status: "published", publishedAt: nowIso() });
}

/**
 * Retire a published version.
 *
 * Retiring does not invalidate the runs that pinned it. They were computed from a method the institution stood
 * behind at the time, and that remains true; retirement says only that no *new* run may pin it.
 */
export function retireModel(model: ForecastModel): ForecastModel {
  if (model.status !== "published") throw new InvalidModelTransitionError(model.status, "retired");
  return touch(model, { status: "retired", retiredAt: nowIso() });
}

/**
 * Open a new draft from a published or retired version, carrying its settings forward.
 *
 * A fresh aggregate rather than a mutation — new id, version back to `0`, same `modelKey` — so the version being
 * revised stays exactly as every run that pinned it recorded it. Revising a draft is refused because a draft is
 * already editable, and a second draft of the same key is two people about to publish over each other.
 */
export function reviseModel(
  model: ForecastModel,
  amendment: ForecastModelAmendment = {},
): ForecastModel {
  if (model.status === "draft") throw new InvalidModelTransitionError(model.status, "draft");

  const draft = draftForecastModel({
    tenantId: model.tenantId,
    organizationId: model.organizationId,
    modelKey: model.modelKey,
    name: model.name,
    description: model.description,
    method: model.method,
    parameters: model.parameters,
    confidenceLevels: model.confidenceLevels,
  });
  return amendModel(draft, amendment);
}

// --- Guards ----------------------------------------------------------------------

/** Refuse a version already taken by another row under this model key. */
export function guardVersionAvailable(
  modelKey: string,
  version: number,
  takenVersions: readonly number[],
): void {
  if (takenVersions.includes(version)) {
    throw new DuplicateModelVersionError(normalizeModelKey(modelKey), version);
  }
}

/** The next free version for a model key. `1` where nothing has been published yet. */
export const nextModelVersion = (takenVersions: readonly number[]): number =>
  takenVersions.reduce((highest, version) => Math.max(highest, version), 0) + 1;

/** Refuse anything but a published version. What a run calls before it pins a model. */
export function requirePublishedModel(model: ForecastModel): ForecastModel {
  if (model.status !== "published") throw new ModelNotPublishedError(model.id, model.status);
  return model;
}

function guardDraft(model: ForecastModel): void {
  if (model.status !== "draft") throw new PublishedModelImmutableError(model.id, model.status);
}

/**
 * Keep only the parameters this method reads, and refuse a value the method could not use.
 *
 * Absence is not an error — every parameter has a documented default that the projection engine resolves and the
 * run pins. What is refused is a value that is present and wrong, and a value that is present and irrelevant.
 */
export function guardParameters(
  method: ForecastMethod,
  parameters: ProjectionParameters,
): ProjectionParameters {
  const kept: { windowSize?: number; alpha?: number } = {};

  const { windowSize } = parameters;
  if (windowSize !== undefined) {
    if (method !== "moving_average") {
      throw new InvalidModelParameterError(
        "windowSize",
        windowSize,
        `omitted for the "${method}" method, which does not read it`,
      );
    }
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new InvalidModelParameterError(
        "windowSize",
        windowSize,
        "a whole number of at least 1",
      );
    }
    kept.windowSize = windowSize;
  }

  const { alpha } = parameters;
  if (alpha !== undefined) {
    if (method !== "exponential_smoothing") {
      throw new InvalidModelParameterError(
        "alpha",
        alpha,
        `omitted for the "${method}" method, which does not read it`,
      );
    }
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      throw new InvalidModelParameterError(
        "alpha",
        alpha,
        "a finite number greater than 0 and at most 1",
      );
    }
    kept.alpha = alpha;
  }

  return kept;
}

/**
 * Sort, dedupe, discard anything that is not a supported level, and put the required level back.
 *
 * Restoring rather than refusing is the deliberate choice. A caller who omits the required level has not made a
 * decision the platform should honour — the contract already made it — and an error here would only teach
 * integrators to append `80` to satisfy a validator. Making the set correct by construction means there is no
 * reachable state where a model would produce a run without it.
 */
export function normalizeConfidenceLevels(levels: readonly number[]): readonly ConfidenceLevel[] {
  const supported = new Set<number>(CONFIDENCE_LEVELS);
  const kept = new Set<ConfidenceLevel>([REQUIRED_CONFIDENCE_LEVEL]);
  for (const level of levels) {
    if (supported.has(level)) kept.add(level as ConfidenceLevel);
  }
  return [...kept].sort((a, b) => a - b);
}

// --- Internals -------------------------------------------------------------------

const touch = (model: ForecastModel, patch: Partial<ForecastModel>): ForecastModel => ({
  ...model,
  ...patch,
  updatedAt: nowIso(),
});

// --- Reading ---------------------------------------------------------------------

/** Whether a run may pin this model. */
export const isModelRunnable = (model: ForecastModel): boolean => model.status === "published";

/** Whether this model's method consumes the series' declared seasonal cycle. */
export const modelReadsCycle = (model: ForecastModel): boolean => isSeasonalMethod(model.method);

/** How a run refers to this model: the key and the version it pinned. */
export const modelReference = (
  model: ForecastModel,
): { modelKey: string; modelVersion: number } => ({
  modelKey: model.modelKey,
  modelVersion: model.version,
});
