import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type HealthPillar,
  type IndexStatus,
  type PeriodGrain,
  normalizeIndexKey,
} from "./command-value";
import type { IndexVerdict, PillarInput, PillarWeight } from "./command-view";
import {
  EmptyIndexKeyError,
  EmptyIndexNameError,
  FrozenIndexDefinitionError,
  IndexWeightsFrozenError,
  InvalidIndexTransitionError,
  SelfSupersedingIndexError,
  UnusableIndexWeightsError,
} from "./errors";
import { assessIndex } from "./indexing";
import { validateWeights } from "./weighting";

/**
 * A health index definition: which pillars an institution's composite is made of, and what each is worth to it.
 *
 * This is the second clause of the contract's rule — a reproducible Institutional Health Index across ten
 * institutional domains — as a record somebody can be shown. The ten pillars are fixed at the platform and are
 * not on this aggregate; what is here is the institution's own statement about them, which is the weighting. A
 * trust that weighs financial health at a fifth and one that weighs it at a twentieth are saying something
 * different about themselves, and the index is supposed to carry it rather than average it away under a platform
 * default nobody chose and nobody can point at afterwards.
 *
 * **The weights freeze at publication, and that is this aggregate's central rule.** Every assessment pins the
 * definition it was computed under. Reweighting in place would leave those assessments pointing at a composition
 * that no longer produced them, so a school's own series would restate itself and the year it stopped meaning the
 * same thing would be invisible. So a reweight *supersedes*: the old definition stays exactly as it was with its
 * assessments still explicable, the successor takes over from here, and the break appears in the series precisely
 * where the institution made it.
 *
 * That is the difference between {@link INDEX_STATUSES}' `superseded` and `retired`, and the reason a KPI
 * definition has no equivalent. A KPI's readings carry their own scores, so nothing points back at the definition
 * once a reading exists; an index's assessments point at nothing else.
 *
 * The mutability tiers follow. The key and the grain never move — the key is how every assessment, dashboard and
 * briefing addresses the index, and the grain is what makes a period ordinal mean anything, so changing it would
 * silently reinterpret every assessment already filed. The weights move only while the definition is a draft,
 * which is the whole window in which no assessment can exist. The name and description move until the definition
 * is superseded or retired. After that nothing moves at all, not even the name, because a superseded definition is
 * part of a record another aggregate is quoting.
 *
 * A definition holds no assessments, no current value, and no history. Asking a definition how the school is doing
 * would make it a cache of the assessment table, and the first thing a cache does is disagree with what it caches.
 */

// --- The aggregate ---------------------------------------------------------------

export interface HealthIndexDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /**
   * How the index is addressed everywhere else. Normalized on the way in and never edited afterwards: a key that
   * moved would orphan every assessment filed under it and every panel bound to it.
   */
  readonly indexKey: string;
  readonly name: string;
  readonly description: string | null;
  /**
   * The grid this index's periods are counted on. Declared once and immutable, because a period is an ordinal and
   * nothing else — an index that changed from terms to quarters would leave every filed assessment's period
   * ordinal pointing at a different stretch of the year than it did when it was written.
   */
  readonly grain: PeriodGrain;
  /** What each pillar is worth to this institution. Frozen from publication onward. */
  readonly weights: readonly PillarWeight[];
  readonly status: IndexStatus;
  /**
   * The definition that took over from this one, set when it is superseded. What lets a reader walk a school's
   * reweightings forward and see that a step in the series was a change of question rather than of fortune.
   */
  readonly supersededById: Uuid | null;
  readonly publishedAt: ISODateString | null;
  readonly supersededAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineHealthIndexParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly indexKey: string;
  readonly name: string;
  readonly description?: string | null;
  readonly grain: PeriodGrain;
  readonly weights: readonly PillarWeight[];
}

/** What may be changed about an index's description of itself. */
export interface RenameHealthIndexParams {
  readonly name: string;
  /** Omit to leave the existing description alone; pass `null` to clear it. */
  readonly description?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * A defensive copy of a declared weight set.
 *
 * The weights are the institution's statement about its own priorities and a stored definition must not be able
 * to change because the caller reused the array it passed in. Cheap here, and impossible to reconstruct later
 * once a year of assessments have been computed against whatever the array became.
 */
const copyWeights = (weights: readonly PillarWeight[]): readonly PillarWeight[] =>
  weights.map((entry) => ({ pillar: entry.pillar, weight: entry.weight }));

/**
 * Declare an index. Starts as a draft, which is the only state in which its weighting can still be argued about.
 *
 * The weight set is deliberately **not** validated here, for the same reason a KPI's scale is not validated at
 * declaration. Weighting ten pillars against each other is an argument a leadership team has over several
 * sittings, and a platform that refused to save the intermediate states would push them into having the argument
 * in a spreadsheet and entering the answer — which is exactly the workflow this contract exists to replace.
 * Publication is the gate, and it reports every fault at once.
 */
export function defineHealthIndex(params: DefineHealthIndexParams): HealthIndexDefinition {
  const indexKey = normalizeIndexKey(params.indexKey);
  if (indexKey.length === 0) throw new EmptyIndexKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyIndexNameError();

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    indexKey,
    name,
    description: trimmedOrNull(params.description),
    grain: params.grain,
    weights: copyWeights(params.weights),
    status: "draft",
    supersededById: null,
    publishedAt: null,
    supersededAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  definition: HealthIndexDefinition,
  patch: Partial<HealthIndexDefinition>,
): HealthIndexDefinition => ({
  ...definition,
  ...patch,
  updatedAt: nowIso(),
});

/** A superseded or retired definition is history and does not move. Every edit below starts here. */
function requireLive(definition: HealthIndexDefinition): void {
  if (definition.status === "superseded" || definition.status === "retired") {
    throw new FrozenIndexDefinitionError(definition.id, definition.status);
  }
}

// --- Authoring -------------------------------------------------------------------

/**
 * Reweight a draft.
 *
 * Refused from publication onward, which is the freeze the module comment argues for. The refusal names the
 * remedy rather than just the rule, because an institution that has genuinely changed its mind about what matters
 * has a legitimate need and the platform has an answer for it: publish the reweighted successor and supersede
 * this one.
 */
export function reweightHealthIndex(
  definition: HealthIndexDefinition,
  weights: readonly PillarWeight[],
): HealthIndexDefinition {
  requireLive(definition);
  if (definition.status !== "draft") {
    throw new IndexWeightsFrozenError(definition.id, definition.status);
  }
  return touch(definition, { weights: copyWeights(weights) });
}

/**
 * Change what the index is called. Permitted on a published definition: a label is not part of computing a value.
 */
export function renameHealthIndex(
  definition: HealthIndexDefinition,
  params: RenameHealthIndexParams,
): HealthIndexDefinition {
  requireLive(definition);
  const name = params.name.trim();
  if (name.length === 0) throw new EmptyIndexNameError();
  return touch(definition, {
    name,
    description:
      params.description === undefined ? definition.description : trimmedOrNull(params.description),
  });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Put the index into service. The weight set is inspected here and nowhere else on the way in.
 *
 * The indexing engine does not re-validate weights on every assessment, deliberately — a definition that had
 * drifted into an invalid state would then stop producing numbers silently instead of failing where somebody
 * could see it. This is the one place the check happens, so it happens at the one moment there is a person
 * present to fix what it finds, and it reports every fault at once rather than the next one after each
 * correction.
 */
export function publishHealthIndex(definition: HealthIndexDefinition): HealthIndexDefinition {
  if (definition.status !== "draft") {
    throw new InvalidIndexTransitionError(definition.status, "published");
  }

  const verdict = validateWeights(definition.weights);
  if (!verdict.usable) {
    throw new UnusableIndexWeightsError(
      definition.indexKey,
      verdict.issues.map((entry) => entry.code),
    );
  }

  return touch(definition, { status: "published", publishedAt: nowIso() });
}

/**
 * Hand this definition's job to its successor.
 *
 * Reachable from publication only. Superseding a draft would be meaningless — nothing was computed under it — and
 * superseding an already-superseded definition would fork the chain, leaving two claims about what replaced the
 * same composition and no way to tell which one a reader should follow.
 *
 * The successor's id is recorded rather than checked. This package has no directory of its own definitions and
 * inventing a lookup here would put a second opinion about what exists inside an aggregate; the composition root
 * resolves the successor, and what this refuses is only the one case it can see for itself — a definition naming
 * itself, which would make the chain a loop no reader could walk out of.
 */
export function supersedeHealthIndex(
  definition: HealthIndexDefinition,
  successorId: Uuid,
): HealthIndexDefinition {
  if (definition.status !== "published") {
    throw new InvalidIndexTransitionError(definition.status, "superseded");
  }
  if (successorId === definition.id) {
    throw new SelfSupersedingIndexError(definition.id);
  }
  return touch(definition, {
    status: "superseded",
    supersededById: successorId,
    supersededAt: nowIso(),
  });
}

/**
 * Stop computing this index.
 *
 * Reachable from a draft as well as from service, because a composition somebody thought better of before it ever
 * ran is retired rather than deleted — the argument about how to weigh the institution is itself institutional
 * memory. Not reachable from `superseded`, which is already terminal and already says what happened: a definition
 * that had been both superseded and retired would leave a reader unable to tell whether the institution moved on
 * from it or stopped measuring altogether.
 */
export function retireHealthIndex(definition: HealthIndexDefinition): HealthIndexDefinition {
  if (definition.status === "superseded" || definition.status === "retired") {
    throw new InvalidIndexTransitionError(definition.status, "retired");
  }
  return touch(definition, { status: "retired", retiredAt: nowIso() });
}

// --- Reading ---------------------------------------------------------------------

/** Whether assessments may be computed under this definition. */
export const isHealthIndexPublished = (definition: HealthIndexDefinition): boolean =>
  definition.status === "published";

/**
 * Whether this definition would survive publication — the read-side of exactly the guards
 * {@link publishHealthIndex} applies, so an authoring screen can offer the action only when taking it would
 * succeed.
 */
export const isHealthIndexPublishable = (definition: HealthIndexDefinition): boolean =>
  definition.status === "draft" && validateWeights(definition.weights).usable;

/**
 * The pillars this index is made of, in declaration order.
 *
 * Order matters and is preserved rather than sorted: it is what breaks ties when contributions are ranked, so two
 * runs of the same assessment rank identically. Sorting here would make that ordering an accident of the alphabet
 * instead of a property of the definition.
 */
export const declaredPillars = (definition: HealthIndexDefinition): readonly HealthPillar[] =>
  definition.weights.map((entry) => entry.pillar);

/**
 * Compute this index from what the pillars reported, without recording anything.
 *
 * The only door into the indexing engine from an aggregate. A caller reaching for `assessIndex` directly would
 * have to name a weight set, and the day one of them named a plausible set that was not this definition's, the
 * resulting composite would be indistinguishable from a real one. Refuses nothing and stores nothing: this is the
 * working number an authoring screen shows while somebody is still arguing about the weighting.
 */
export const runHealthIndex = (
  definition: HealthIndexDefinition,
  inputs: readonly PillarInput[],
): IndexVerdict => assessIndex(definition.weights, inputs);
