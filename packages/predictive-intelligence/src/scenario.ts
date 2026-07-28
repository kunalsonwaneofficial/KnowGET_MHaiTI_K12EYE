import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { LeverKind, ScenarioStatus } from "./forecast-value";
import {
  normalizeAssumptionKey,
  normalizeLeverKey,
  normalizeScenarioKey,
  roundValue,
} from "./forecast-value";
import type { LeverView } from "./forecast-view";
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
import { isLeverAdmissible, leverAssumptionPairs, orderLevers } from "./simulation";

/**
 * A named what-if: the levers an institution wants to move, and nothing else.
 *
 * A forecast says what happens if nothing changes. A scenario is the other half of the question leadership
 * actually asks — *what if we did something* — and it is deliberately not a forecast. It holds no series, no
 * method and no numbers of its own; it holds the movements, and a simulation applies them to whatever baseline
 * it is pointed at. That separation is what lets one scenario be run against three different forecasts, and what
 * stops "what if enrolment grows 4%" from silently becoming a claim about enrolment.
 *
 * **The levers carry the assumptions they vary.** A lever with an `assumptionKey` is traceable to a belief
 * somebody declared and an auditor can find; a lever without one is a number somebody typed. Both are permitted,
 * because a scenario may legitimately probe something nobody assumed, but the difference is on the record rather
 * than inferred — {@link variedAssumptionKeys} is what a simulation reads to state which beliefs it moved.
 *
 * **Publication freezes the scenario, and the key is unique within the organization.** That pairing is the whole
 * governance story. A model is versioned under its key because retuning a method is routine and the old versions
 * must stay pinnable; a scenario is not, because "the 2027 austerity case" is one thing an institution debated,
 * and a second row wearing the same name is how two board papers come to disagree about what the austerity case
 * was. {@link reviseScenario} therefore mints a new key rather than a new version — the revision is a different
 * scenario, and saying so is the point.
 *
 * **`version` is the identity of the lever set, not a count of edits.** It advances when the levers change and
 * stands still when the name or the description does, for the reason {@link closeSeries} does not bump either:
 * a version that moves on things no arithmetic reads is a version people learn to ignore. In practice it stops
 * moving at publication and every simulation pins the frozen figure, which is exactly what a reproducible
 * what-if requires.
 *
 * **Nothing here decides whether a lever is sensible, only whether it is applicable.** A 4% growth lever and a
 * 40% one are both arithmetic this package can perform; the band in {@link isLeverAdmissible} refuses only the
 * magnitudes at which the baseline has stopped contributing and the lever simply *is* the answer. Judging the
 * plausibility of a plausible-looking number is the institution's work, and a package that pretended to do it
 * would be wrong quietly.
 */

// --- The aggregate ---------------------------------------------------------------

export interface Scenario {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Unique within the organization. There is no versioned family of scenarios under one key. */
  readonly scenarioKey: string;
  readonly name: string;
  readonly description: string | null;
  /** Held in application order, so the aggregate renders identically however a repository returned them. */
  readonly levers: readonly LeverView[];
  /** The identity of the lever set. Advances while the scenario is a draft; frozen at publication. */
  readonly version: number;
  readonly status: ScenarioStatus;
  readonly publishedAt: ISODateString | null;
  readonly archivedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScenarioParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scenarioKey: string;
  readonly name: string;
  readonly description?: string | null;
  /** Optional at declaration. A scenario is only required to have levers by the time it is published. */
  readonly levers?: readonly LeverInput[];
}

/** What may be restated on a draft scenario. The levers are managed by their own operations. */
export interface ScenarioAmendment {
  readonly name?: string;
  readonly description?: string | null;
}

/** A lever as a caller supplies it, before the scenario has judged it. */
export interface LeverInput {
  readonly leverKey: string;
  readonly kind: LeverKind;
  readonly magnitude: number;
  /** The first horizon the lever acts on. Defaults to `1` — the whole forecast. */
  readonly fromHorizon?: number;
  /** The declared belief this lever varies, where there is one. */
  readonly assumptionKey?: string | null;
}

/** What may be restated on a lever that is already part of a draft scenario. */
export interface LeverAmendment {
  readonly kind?: LeverKind;
  readonly magnitude?: number;
  readonly fromHorizon?: number;
  readonly assumptionKey?: string | null;
}

// --- Declaration -----------------------------------------------------------------

/**
 * Declare a scenario. It starts as an editable draft at version 1.
 *
 * Levers may be supplied here or added afterwards; the two paths validate identically, because a scenario
 * declared whole and one assembled lever by lever are the same scenario and should be refused for the same
 * reasons.
 */
export function declareScenario(params: ScenarioParams): Scenario {
  const scenarioKey = normalizeScenarioKey(params.scenarioKey);
  if (scenarioKey.length === 0) throw new EmptyScenarioKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyScenarioNameError();

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    scenarioKey,
    name,
    description: params.description?.trim() ?? null,
    levers: orderLevers(acceptLevers([], params.levers ?? [])),
    version: 1,
    status: "draft",
    publishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Restate a draft's name or description.
 *
 * Neither reaches a simulation's arithmetic, so neither advances the version. A scenario renamed between two
 * board papers is the same scenario with a better label on it, and reporting drift for that would train people
 * to ignore the signal that matters.
 */
export function amendScenario(scenario: Scenario, amendment: ScenarioAmendment): Scenario {
  guardDraft(scenario);

  const name = amendment.name === undefined ? scenario.name : amendment.name.trim();
  if (name.length === 0) throw new EmptyScenarioNameError();

  return touch(scenario, {
    name,
    description:
      amendment.description === undefined
        ? scenario.description
        : (amendment.description?.trim() ?? null),
  });
}

// --- Levers ----------------------------------------------------------------------

/** Add one lever. Refuses a key the scenario already carries. */
export const addLever = (scenario: Scenario, lever: LeverInput): Scenario =>
  addLevers(scenario, [lever]);

/**
 * Add several levers as a single act.
 *
 * Validated whole and applied whole, so a batch with one inadmissible lever leaves the scenario untouched and a
 * good batch advances the version once. Duplicates are refused within the batch as well as against the scenario:
 * a batch that quietly kept the last of two levers named `enrolment.growth` would resolve an ambiguity the
 * caller did not know they had created, and the number it resolved it to would not be visible anywhere.
 */
export function addLevers(scenario: Scenario, levers: readonly LeverInput[]): Scenario {
  guardDraft(scenario);
  if (levers.length === 0) return scenario;
  return bump(scenario, { levers: acceptLevers(scenario.levers, levers) });
}

/**
 * Restate a lever that is already there.
 *
 * The key is the lever's identity and is not amendable — a lever renamed in place is a different lever wearing
 * an existing lever's history, and the honest expression of that is a removal and an addition.
 */
export function amendLever(
  scenario: Scenario,
  leverKey: string,
  amendment: LeverAmendment,
): Scenario {
  guardDraft(scenario);

  const key = normalizeLeverKey(leverKey);
  const existing = leverAt(scenario, key);
  if (existing === null) throw new LeverNotFoundError(scenario.id, key);

  const amended = normalizeLever({
    leverKey: key,
    kind: amendment.kind ?? existing.kind,
    magnitude: amendment.magnitude ?? existing.magnitude,
    fromHorizon: amendment.fromHorizon ?? existing.fromHorizon,
    assumptionKey:
      amendment.assumptionKey === undefined ? existing.assumptionKey : amendment.assumptionKey,
  });
  if (sameLever(amended, existing)) return scenario;

  return bump(scenario, {
    levers: scenario.levers.map((lever) => (lever.leverKey === key ? amended : lever)),
  });
}

/** Remove a lever. Refuses a key the scenario does not carry rather than succeeding vacuously. */
export function removeLever(scenario: Scenario, leverKey: string): Scenario {
  guardDraft(scenario);

  const key = normalizeLeverKey(leverKey);
  if (leverAt(scenario, key) === null) throw new LeverNotFoundError(scenario.id, key);

  return bump(scenario, { levers: scenario.levers.filter((lever) => lever.leverKey !== key) });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Publish the draft, freezing it.
 *
 * No version is supplied, unlike {@link publishModel}. A model's version has to come from outside the aggregate
 * because uniqueness is a property of the whole set of versions under a key; a scenario key identifies exactly
 * one scenario, so the version it carries is already the only one there will be, and asking a caller to invent a
 * number here would be asking them to invent an identity the aggregate has been maintaining all along.
 *
 * A scenario with no levers is refused. It would simulate to the baseline, point for point, under a name that
 * says the institution changed something — the most quietly misleading artefact this package could produce.
 */
export function publishScenario(scenario: Scenario): Scenario {
  if (scenario.status !== "draft") {
    throw new InvalidScenarioTransitionError(scenario.status, "published");
  }
  if (scenario.levers.length === 0) throw new EmptyScenarioError(scenario.id);
  return touch(scenario, { status: "published", publishedAt: nowIso() });
}

/**
 * Archive a published scenario so nothing new may be simulated from it.
 *
 * Archiving does not invalidate the simulations that ran it. They were run against a scenario the institution
 * stood behind at the time, and that stays true; archiving says only that the question has been settled or
 * overtaken. A draft is not archivable — it was never on the record, so there is nothing to retire it from.
 */
export function archiveScenario(scenario: Scenario): Scenario {
  if (scenario.status !== "published") {
    throw new InvalidScenarioTransitionError(scenario.status, "archived");
  }
  return touch(scenario, { status: "archived", archivedAt: nowIso() });
}

/**
 * Open a new draft from a published or archived scenario, carrying its levers forward under a new key.
 *
 * The new key is required rather than derived, because naming the revision is the decision being made. "The
 * austerity case, but with the transport subsidy restored" is a scenario an institution will want to put beside
 * the original, not on top of it, and a generated key would leave the two indistinguishable in every list they
 * ever appear in together. Revising a draft is refused for the reason {@link reviseModel} refuses it: a draft is
 * already editable, and a second draft of the same content is two people about to publish over each other.
 */
export function reviseScenario(
  scenario: Scenario,
  scenarioKey: string,
  amendment: ScenarioAmendment = {},
): Scenario {
  if (scenario.status === "draft") {
    throw new InvalidScenarioTransitionError(scenario.status, "draft");
  }

  const draft = declareScenario({
    tenantId: scenario.tenantId,
    organizationId: scenario.organizationId,
    scenarioKey,
    name: scenario.name,
    description: scenario.description,
    levers: scenario.levers,
  });
  return amendScenario(draft, amendment);
}

// --- Guards ----------------------------------------------------------------------

/** Refuse a scenario key already taken in this organization. What a declaring service calls first. */
export function guardScenarioKeyAvailable(scenarioKey: string, takenKeys: readonly string[]): void {
  const key = normalizeScenarioKey(scenarioKey);
  if (takenKeys.some((taken) => normalizeScenarioKey(taken) === key)) {
    throw new DuplicateScenarioKeyError(key);
  }
}

/** Refuse anything but a published scenario. What a simulation calls before it pins one. */
export function requirePublishedScenario(scenario: Scenario): Scenario {
  if (scenario.status !== "published") {
    throw new ScenarioNotPublishedError(scenario.id, scenario.status);
  }
  return scenario;
}

function guardDraft(scenario: Scenario): void {
  if (scenario.status !== "draft") {
    throw new PublishedScenarioImmutableError(scenario.id, scenario.status);
  }
}

// --- Internals -------------------------------------------------------------------

/**
 * A caller's lever as the scenario will hold it: keys normalized, magnitude rounded, admissibility checked.
 *
 * Rounding precedes the check rather than following it, so what was judged admissible is exactly what gets
 * stored. The order matters at the bottom of the range: a multiplicative factor of `1e-9` is a positive number
 * that rounds to zero at {@link FORECAST_PRECISION}, and checking before rounding would store a lever that
 * annihilates every value it touches under a verdict that said it was fine.
 */
const normalizeLever = (input: LeverInput): LeverView => {
  const leverKey = normalizeLeverKey(input.leverKey);
  if (leverKey.length === 0) throw new EmptyLeverKeyError();

  const assumptionKey =
    input.assumptionKey === undefined || input.assumptionKey === null
      ? ""
      : normalizeAssumptionKey(input.assumptionKey);

  const lever: LeverView = {
    leverKey,
    kind: input.kind,
    magnitude: roundValue(input.magnitude),
    fromHorizon: input.fromHorizon ?? 1,
    assumptionKey: assumptionKey.length === 0 ? null : assumptionKey,
  };

  if (!isLeverAdmissible(lever)) {
    throw new InadmissibleLeverError(
      lever.leverKey,
      lever.kind,
      lever.magnitude,
      lever.fromHorizon,
    );
  }
  return lever;
};

/**
 * The lever set that results from adding these inputs to those, or nothing at all if any input is refused.
 *
 * Shared by declaration and addition so the two paths cannot drift. A scenario declared with three levers and
 * one assembled from three additions must be refused by the same rules, or the way to get an invalid scenario
 * past this aggregate would be to choose the other constructor.
 */
const acceptLevers = (
  existing: readonly LeverView[],
  incoming: readonly LeverInput[],
): readonly LeverView[] => {
  const keys = new Set(existing.map((lever) => lever.leverKey));
  const accepted: LeverView[] = [];

  for (const input of incoming) {
    const lever = normalizeLever(input);
    if (keys.has(lever.leverKey)) throw new DuplicateLeverKeyError(lever.leverKey);
    keys.add(lever.leverKey);
    accepted.push(lever);
  }

  return [...existing, ...accepted];
};

/** Whether two levers say the same thing. Keys are compared by the caller, which already matched on them. */
const sameLever = (a: LeverView, b: LeverView): boolean =>
  a.kind === b.kind &&
  a.magnitude === b.magnitude &&
  a.fromHorizon === b.fromHorizon &&
  a.assumptionKey === b.assumptionKey;

const touch = (scenario: Scenario, patch: Partial<Scenario>): Scenario => ({
  ...scenario,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Apply a change that alters what the scenario says, advancing the version and restoring application order.
 *
 * Ordering on every change rather than at simulation time is what makes the version meaningful: two scenarios
 * holding the same levers must present them identically, or one version number would describe two different
 * inputs depending on the order somebody added them in.
 */
const bump = (scenario: Scenario, patch: Partial<Scenario>): Scenario => {
  const next = touch(scenario, { ...patch, version: scenario.version + 1 });
  return { ...next, levers: orderLevers(next.levers) };
};

// --- Reading ---------------------------------------------------------------------

/** The lever under a key, or `null` where the scenario does not carry one. */
export const leverAt = (scenario: Scenario, leverKey: string): LeverView | null => {
  const key = normalizeLeverKey(leverKey);
  return scenario.levers.find((lever) => lever.leverKey === key) ?? null;
};

/** How many levers the scenario moves. */
export const leverCount = (scenario: Scenario): number => scenario.levers.length;

/** Whether a simulation may be run from this scenario as it currently stands. */
export const isScenarioSimulable = (scenario: Scenario): boolean =>
  scenario.status === "published" && scenario.levers.length > 0;

/** Whether any lever replaces the baseline outright rather than moving it. */
export const overridesBaseline = (scenario: Scenario): boolean =>
  scenario.levers.some((lever) => lever.kind === "override");

/**
 * The distinct beliefs this scenario varies, in the order their levers are applied.
 *
 * Distinct because two levers may probe one assumption from different horizons and the assumption was still
 * varied once; ordered by application rather than alphabetically so that reading this beside the levers
 * themselves does not require a second sort in the reader's head.
 */
export const variedAssumptionKeys = (scenario: Scenario): readonly string[] => [
  ...new Set(leverAssumptionPairs(scenario.levers).map((pair) => pair.assumptionKey)),
];

/** How a simulation refers to this scenario: the key and the lever-set version it pinned. */
export const scenarioReference = (
  scenario: Scenario,
): { scenarioKey: string; scenarioVersion: number } => ({
  scenarioKey: scenario.scenarioKey,
  scenarioVersion: scenario.version,
});
