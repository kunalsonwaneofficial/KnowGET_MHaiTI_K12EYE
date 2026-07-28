import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { assessmentComputed, assessmentFinalized, assessmentInvalidated } from "./command-events";
import { normalizeIndexKey } from "./command-value";
import type { PillarInput, PillarReport, ReproductionVerdict, TracedReading } from "./command-view";
import {
  DuplicateAssessmentError,
  HealthIndexAssessmentNotFoundError,
  NoPublishedIndexError,
} from "./errors";
import {
  type HealthIndexAssessment,
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
  reproduceAssessment,
} from "./health-index-assessment";
import type { HealthIndexDefinition } from "./health-index-definition";
import { rollUpPillars } from "./indexing";
import { type KpiReading, kpiReadingScore, toTracedReadings } from "./kpi-reading";
import type {
  HealthIndexAssessmentRepository,
  HealthIndexDefinitionRepository,
  KpiDefinitionRepository,
  KpiReadingRepository,
} from "./ports";

/** What one gathering produced: the pillar inputs to compute from, and the readings to audit. */
interface GatheredInputs {
  readonly inputs: readonly PillarInput[];
  readonly readings: readonly TracedReading[];
}

/**
 * Application service for health index assessments — the institution's composite, computed and pinned.
 *
 * Every other service in this contract guards a request somebody made. This one assembles one. An assessment has
 * no author beyond a period: the caller names a series and an ordinal, and everything the number is computed
 * from — which composition is in force, what the institution currently says it measures, and what it last filed
 * against each of those indicators — is gathered here. That makes this the one place where a shortcut in the
 * gathering would be completely invisible in the result, because the result is a single number and it looks the
 * same whether it saw the whole institution or half of it.
 *
 * So the gathering is fixed rather than parameterized, in three ways that each close a substitution.
 *
 * The **composition** comes from the published definition for the key, and there is no fallback to a draft. A
 * draft's weighting is still being argued about, and a composite filed under one would sit in the same series as
 * the real ones while meaning something the institution never agreed to. When no composition is in force the
 * assessment refuses and says so, which is the outcome the recomposition write order in the definition service
 * was chosen to produce.
 *
 * The **institution** comes off that definition rather than from the caller. An organization argument would let
 * a series be assessed against a different school's indicators, and the resulting figure would be filed under
 * this school's key with nothing anywhere recording whose numbers produced it.
 *
 * The **readings** are each indicator's latest standing figure, whatever period it belongs to — not the figures
 * filed at this period. This is the repository's rule carried through rather than second-guessed: an indicator
 * that reported last term and not this one has a stale reading, and asking only for this period's would report
 * it as an indicator that has never reported. Same coverage gap, with the one fact that tells somebody where to
 * go removed. The stale figure contributes its score, and the evidence audit carries how old it is.
 *
 * Only readings belonging to **active** definitions enter either the roll-up or the evidence base, and it is the
 * same set for both. A retired indicator's last figure fed no pillar, so letting it into the audit would make
 * the trace verdict describe a different set of numbers than the composite came from — and a reproduction
 * checking that pairing would be auditing a fiction rather than the record.
 *
 * Recomputing a period is invalidate-then-assess rather than an overwrite, which is why the duplicate refusal is
 * unconditional. An assessment somebody has already quoted must not change underneath them; it must be visibly
 * withdrawn, and the figure that replaces it must be visibly new.
 */
export interface HealthIndexAssessmentServiceDeps {
  readonly repository: HealthIndexAssessmentRepository;
  readonly definitions: HealthIndexDefinitionRepository;
  readonly kpis: KpiDefinitionRepository;
  readonly readings: KpiReadingRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class HealthIndexAssessmentService {
  private readonly repository: HealthIndexAssessmentRepository;
  private readonly definitions: HealthIndexDefinitionRepository;
  private readonly kpis: KpiDefinitionRepository;
  private readonly readings: KpiReadingRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HealthIndexAssessmentServiceDeps) {
    this.repository = deps.repository;
    this.definitions = deps.definitions;
    this.kpis = deps.kpis;
    this.readings = deps.readings;
    this.events = deps.events;
  }

  // --- Assessing -------------------------------------------------------------------

  /**
   * Compute the institution's composite for one period of one series.
   *
   * The period's occupancy is checked before anything is gathered, so a re-run against a period that already has
   * a figure costs one read rather than a walk of every indicator the institution declares.
   */
  async assess(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment> {
    const definition = await this.requirePublished(tenantId, indexKey);
    await this.requirePeriodFree(definition, period);

    const { inputs, readings } = await this.gather(definition);
    const assessment = assessHealthIndex(definition, { period, inputs, readings });

    await this.repository.save(assessment);
    await this.emit(assessmentComputed(assessment));
    return assessment;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Stand behind the figure, if it is grounded and saw enough of the institution to be quotable. */
  async finalize(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment> {
    return this.transition(tenantId, id, finalizeAssessment, assessmentFinalized);
  }

  /** Withdraw the figure without erasing it. Reachable from `final`, which is the whole point of it. */
  async invalidate(
    tenantId: TenantId,
    id: Uuid,
    reason?: string | null,
  ): Promise<HealthIndexAssessment> {
    return this.transition(
      tenantId,
      id,
      invalidateAssessment,
      assessmentInvalidated,
      reason ?? null,
    );
  }

  // --- Reading ---------------------------------------------------------------------

  /**
   * Produce the figure again from the inputs stored beside it, and report every disagreement.
   *
   * This audits the record against itself, which is the question worth exposing: any fault at all means the
   * stored composite was never producible from its own pinned run, and that is a defect in the platform rather
   * than a movement in the institution. It is deliberately not a re-gathering against today's numbers — those
   * belong to today's period, and comparing them to a past one would answer a question nobody asked with a
   * verdict that looks like an audit failure.
   */
  async verify(tenantId: TenantId, id: Uuid): Promise<ReproductionVerdict> {
    return reproduceAssessment(await this.require(tenantId, id));
  }

  /** One assessment, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment> {
    return this.require(tenantId, id);
  }

  /** The figure filed for one series at one period, or `null`. */
  async findForPeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment | null> {
    return this.repository.findByIndexAndPeriod(tenantId, normalizeIndexKey(indexKey), period);
  }

  /**
   * The series behind a period, oldest first, invalidated figures left out.
   *
   * One read rather than two, so "what came immediately before this" and "how has this been moving" cannot
   * disagree: the last element is the previous period and the whole list is the run.
   */
  async history(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<readonly HealthIndexAssessment[]> {
    return this.repository.listBeforePeriod(tenantId, normalizeIndexKey(indexKey), period);
  }

  /** Every assessment in the tenant. */
  async list(tenantId: TenantId): Promise<readonly HealthIndexAssessment[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The assessment under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment> {
    const assessment = await this.repository.findById(tenantId, id);
    if (!assessment) {
      throw new HealthIndexAssessmentNotFoundError(id);
    }
    return assessment;
  }

  /** The composition currently in force for this series, or a 404 naming the series rather than an id. */
  private async requirePublished(
    tenantId: TenantId,
    indexKey: string,
  ): Promise<HealthIndexDefinition> {
    const wanted = normalizeIndexKey(indexKey);
    const definition = await this.definitions.findPublishedByKey(tenantId, wanted);
    if (!definition) {
      throw new NoPublishedIndexError(wanted);
    }
    return definition;
  }

  /** No figure already occupies this series' period, invalidated ones included. */
  private async requirePeriodFree(
    definition: HealthIndexDefinition,
    period: number,
  ): Promise<void> {
    const existing = await this.repository.findByIndexAndPeriod(
      definition.tenantId,
      definition.indexKey,
      period,
    );
    if (existing) {
      throw new DuplicateAssessmentError(definition.indexKey, period);
    }
  }

  /**
   * What the institution currently measures, and what it last filed against each of those indicators.
   *
   * Every active definition produces a pillar report whether or not it has a reading, because an indicator with
   * nothing behind it is the denominator of its pillar's coverage — the fact being reported, not an absence to
   * be skipped. Readings are matched by definition id rather than by key, so a key that a retired definition
   * still owns cannot pull its old figures into a live pillar.
   */
  private async gather(definition: HealthIndexDefinition): Promise<GatheredInputs> {
    const { tenantId, organizationId } = definition;
    const declared = await this.kpis.listActive(tenantId, organizationId);
    const latest = await this.readings.listLatestPerKpi(tenantId, organizationId);
    const byDefinition = new Map(latest.map((reading) => [reading.kpiDefinitionId, reading]));

    const reports: PillarReport[] = [];
    const contributing: KpiReading[] = [];
    for (const kpi of declared) {
      const reading = byDefinition.get(kpi.id);
      reports.push({ pillar: kpi.pillar, score: reading ? kpiReadingScore(reading) : null });
      if (reading) contributing.push(reading);
    }

    return { inputs: rollUpPillars(reports), readings: toTracedReadings(contributing) };
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (assessment: HealthIndexAssessment, ...args: TArgs) => HealthIndexAssessment,
    announce: (assessment: HealthIndexAssessment) => DomainEvent,
    ...args: TArgs
  ): Promise<HealthIndexAssessment> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
