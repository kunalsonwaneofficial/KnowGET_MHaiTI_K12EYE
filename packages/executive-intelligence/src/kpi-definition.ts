import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type HealthPillar,
  type KpiStatus,
  isNormalizedScore,
  normalizeKpiKey,
  normalizeSourceDomain,
} from "./command-value";
import type { Measurement, MeasurementScale } from "./command-view";
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
import { measure, validateScale } from "./measurement";

/**
 * A KPI definition: one thing an institution has decided to measure, and what *good* means for it here.
 *
 * Everything the Institutional Health Index is built out of arrives through one of these. A definition names an
 * indicator, binds it to one of the ten pillars, names the operational domain that publishes the figure, and
 * carries the scale that turns that domain's raw number into a normalized score. The definition is where every
 * institution-specific judgement about an indicator lives, in data an auditor can read, rather than in behaviour
 * that differs per tenant.
 *
 * **The scale freezes at activation, and that is this aggregate's central rule.** Every reading taken against a
 * KPI carries the score its scale produced at the time. Re-anchoring afterwards would leave those scores in place
 * while changing what they mean, so a pillar's history would silently restate itself and a year-on-year
 * comparison would be between two different questions. An institution that could quietly decide 92% attendance
 * had been exemplary all along is one whose index is not evidence of anything.
 *
 * The mutability tiers fall out of that rule rather than being chosen separately. The key and the pillar never
 * move, because both are how readings already filed find their way home. The scale moves only while the
 * definition is a draft, which is the whole window in which no reading can exist. The name and the target move
 * until retirement, because neither participates in producing a score — a rename changes what the indicator is
 * called and a retarget changes what counts as a miss from here on, and neither restates a past figure. A retired
 * definition moves in no respect at all.
 *
 * There is no `superseded` status here, although index definitions have one, and the difference is deliberate. An
 * assessment pins the index definition it used, so a superseded definition still has live citations pointing at
 * it. A KPI definition has no such pin: its readings carry their own scores. So the way to change what *good*
 * means for an indicator is to retire it and declare its successor, which leaves both readable, neither
 * pretending to be the other, and the break visible in the series exactly where it happened.
 *
 * A definition holds no readings and no current value. Asking a definition how the school is doing would make it
 * a cache of the reading table, and the first thing a cache does is disagree with what it caches.
 */

// --- The aggregate -----------------------------------------------------------------

export interface KpiDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /**
   * How the indicator is addressed everywhere else — by a panel, by a reading, by a pillar roll-up. Normalized
   * on the way in, and never edited afterwards: there is no function here that moves one, because a key that
   * changed would orphan every reading filed under the old one and every panel bound to it.
   */
  readonly kpiKey: string;
  readonly name: string;
  readonly description: string | null;
  /**
   * Which of the ten pillars this indicator feeds. Immutable for the same reason as the key — moving an
   * indicator between pillars would restate both pillars' history in every period it had already reported.
   */
  readonly pillar: HealthPillar;
  /** The operational domain that publishes the figure. This contract cites it and never recomputes it. */
  readonly sourceDomain: string;
  /** What *good* means for this indicator. Frozen from activation onward. */
  readonly scale: MeasurementScale;
  /** The normalized score the institution is aiming at, or `null` when it declares none. */
  readonly targetScore: number | null;
  readonly status: KpiStatus;
  readonly activatedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineKpiParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly kpiKey: string;
  readonly name: string;
  readonly description?: string | null;
  readonly pillar: HealthPillar;
  readonly sourceDomain: string;
  readonly scale: MeasurementScale;
  readonly targetScore?: number | null;
}

/** What may be changed about an indicator's description of itself. */
export interface RenameKpiParams {
  readonly name: string;
  /** Omit to leave the existing description alone; pass `null` to clear it. */
  readonly description?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * A defensive copy of a declared scale.
 *
 * The anchors are the institution's statement about itself and a stored definition must not be able to change
 * because the caller reused the array it passed in. Cheap here, and impossible to reconstruct later once a
 * fortnight of readings have been scored against whatever the array became.
 */
const copyScale = (scale: MeasurementScale): MeasurementScale => ({
  unit: scale.unit,
  polarity: scale.polarity,
  anchors: scale.anchors.map((anchor) => ({ value: anchor.value, score: anchor.score })),
});

/**
 * Declare an indicator. Starts as a draft, which is the only state in which its scale can still be argued about.
 *
 * The scale is deliberately **not** validated here. An author working through a form needs to be able to save a
 * half-built scale and come back to it, and refusing the save would push them toward copying a permissive scale
 * from another indicator — which is how an institution ends up with ten copies of one scale instead of the ten
 * considered ones it meant to write. Activation is the gate, and it reports every fault at once.
 */
export function defineKpi(params: DefineKpiParams): KpiDefinition {
  const kpiKey = normalizeKpiKey(params.kpiKey);
  if (kpiKey.length === 0) throw new EmptyKpiKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyKpiNameError();

  const sourceDomain = normalizeSourceDomain(params.sourceDomain);
  if (sourceDomain.length === 0) throw new EmptyKpiSourceDomainError();

  const targetScore = params.targetScore ?? null;
  if (targetScore !== null && !isNormalizedScore(targetScore)) {
    throw new KpiTargetOutOfRangeError(targetScore);
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    kpiKey,
    name,
    description: trimmedOrNull(params.description),
    pillar: params.pillar,
    sourceDomain,
    scale: copyScale(params.scale),
    targetScore,
    status: "draft",
    activatedAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (definition: KpiDefinition, patch: Partial<KpiDefinition>): KpiDefinition => ({
  ...definition,
  ...patch,
  updatedAt: nowIso(),
});

/** A retired definition is history and does not move. Every edit below starts here. */
function requireEditable(definition: KpiDefinition): void {
  if (definition.status === "retired") throw new RetiredKpiImmutableError(definition.id);
}

// --- Authoring ---------------------------------------------------------------------

/**
 * Re-anchor a draft's scale.
 *
 * Refused from activation onward, which is the freeze the module comment argues for. The refusal names the
 * remedy rather than just the rule, because an author who genuinely needs a different definition of *good* has a
 * legitimate need and the platform has an answer for it: retire this indicator and declare its successor.
 */
export function reviseKpiScale(definition: KpiDefinition, scale: MeasurementScale): KpiDefinition {
  requireEditable(definition);
  if (definition.status !== "draft") {
    throw new KpiScaleFrozenError(definition.id, definition.status);
  }
  return touch(definition, { scale: copyScale(scale) });
}

/** Change what the indicator is called. Permitted on a live KPI: a label is not part of producing a score. */
export function renameKpi(definition: KpiDefinition, params: RenameKpiParams): KpiDefinition {
  requireEditable(definition);
  const name = params.name.trim();
  if (name.length === 0) throw new EmptyKpiNameError();
  return touch(definition, {
    name,
    description:
      params.description === undefined ? definition.description : trimmedOrNull(params.description),
  });
}

/**
 * Move the target, or drop it.
 *
 * Permitted on a live KPI, unlike re-anchoring, and the asymmetry is the point. A target is an aspiration
 * compared *against* a score rather than an input to computing one, so moving it restates nothing: every reading
 * keeps the score it was given, and only what counts as a miss from here on changes. An institution that raises
 * its attendance target mid-year has changed its ambition, not its history.
 */
export function retargetKpi(definition: KpiDefinition, targetScore: number | null): KpiDefinition {
  requireEditable(definition);
  if (targetScore !== null && !isNormalizedScore(targetScore)) {
    throw new KpiTargetOutOfRangeError(targetScore);
  }
  return touch(definition, { targetScore });
}

// --- Lifecycle ---------------------------------------------------------------------

/**
 * Put the indicator into service. The scale is inspected here and nowhere else on the way in.
 *
 * A scale the measurement engine cannot interpolate against would not fail loudly; it would score every reading
 * filed against it as unscoreable, and that surfaces periods later as a coverage gap in a pillar nobody can
 * explain. So the fault is caught at the one moment there is a person present to fix it, and every issue the
 * engine found is reported at once rather than the next one after each correction.
 */
export function activateKpi(definition: KpiDefinition): KpiDefinition {
  if (definition.status !== "draft") {
    throw new InvalidKpiTransitionError(definition.status, "active");
  }

  const verdict = validateScale(definition.scale);
  if (!verdict.usable) {
    throw new UnusableKpiScaleError(
      definition.kpiKey,
      verdict.issues.map((entry) => entry.code),
    );
  }

  return touch(definition, { status: "active", activatedAt: nowIso() });
}

/**
 * Stop measuring this.
 *
 * Reachable from a draft as well as from service, because an indicator somebody thought better of before it ever
 * ran is retired rather than deleted — the argument about whether to measure it is itself institutional memory,
 * and a catalog that forgot the indicators it decided against would invite the same proposal every second year.
 * Readings already filed stay exactly as they were; what stops is the catalog offering the indicator.
 */
export function retireKpi(definition: KpiDefinition): KpiDefinition {
  if (definition.status === "retired") {
    throw new InvalidKpiTransitionError(definition.status, "retired");
  }
  return touch(definition, { status: "retired", retiredAt: nowIso() });
}

// --- Reading -----------------------------------------------------------------------

/** Whether readings may be filed against this indicator. */
export const isKpiActive = (definition: KpiDefinition): boolean => definition.status === "active";

/** Whether the institution has stopped measuring this. Its readings stay readable; the catalog stops offering it. */
export const isKpiRetired = (definition: KpiDefinition): boolean => definition.status === "retired";

/**
 * Whether this definition would survive activation — the read-side of exactly the guards {@link activateKpi}
 * applies, so an authoring screen can offer the action only when taking it would succeed.
 */
export const isKpiActivatable = (definition: KpiDefinition): boolean =>
  definition.status === "draft" && validateScale(definition.scale).usable;

/**
 * Score a raw measure against this indicator's own scale.
 *
 * The only door. A caller reaching for the measurement engine directly would have to name a scale, and the day
 * one of them named a plausible scale that was not this KPI's, the resulting score would be indistinguishable
 * from a real one. Refuses nothing: a measure that cannot be scored comes back as a recorded refusal, because
 * "the attendance feed sent us nonsense this week" is exactly what a coverage report exists to surface.
 */
export const scoreKpiMeasure = (definition: KpiDefinition, raw: number): Measurement =>
  measure(definition.scale, raw);
