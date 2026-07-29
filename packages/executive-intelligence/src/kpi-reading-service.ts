import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { kpiReadingRecorded, kpiReadingWithdrawn } from "./command-events";
import type { EvidenceCitation } from "./command-view";
import {
  DuplicateKpiReadingError,
  EvidenceRecordNotFoundError,
  KpiDefinitionNotFoundError,
  KpiReadingNotFoundError,
} from "./errors";
import type { KpiDefinition } from "./kpi-definition";
import {
  type KpiReading,
  type RecordKpiReadingParams,
  recordKpiReading,
  withdrawKpiReading,
} from "./kpi-reading";
import type {
  EvidenceRecordDirectory,
  KpiDefinitionRepository,
  KpiReadingRepository,
} from "./ports";

/**
 * Application service for KPI readings — the figures the institution actually filed, and what they stand on.
 *
 * The aggregate already guarantees that a reading cannot exist without citations that are structurally usable.
 * This service supplies the half of *evidence-traceable* that no aggregate can: it asks the domain that owns
 * each cited record whether that record is there. Structure and existence are different failures. A citation
 * naming a well-formed reference to a register entry nobody can open is indistinguishable, at the moment
 * somebody needs it, from no citation at all — and that moment is a governance meeting months later, which is
 * the worst possible time to discover the reference was never resolved. So it is resolved as it is made.
 *
 * The citations that get resolved are the ones off the **constructed reading**, not the ones the caller passed.
 * The aggregate folds the source domain and trims the reference on the way in, and those canonical forms are
 * what a later reader will resolve. Checking the caller's raw strings would leave a gap exactly the width of
 * whatever normalization does, which is the gap a stray trailing space would slip through.
 *
 * Duplicate readings are refused per indicator and period, and the port's definition of "already has one"
 * excludes withdrawn readings on purpose. A figure the institution has said should never have counted must not
 * block the corrected figure that replaces it, and a service that made the institution invent a new period to
 * file a correction would have made the correction unfindable.
 *
 * Nothing here refuses an inadmissible measure, and that is the aggregate's judgement carried forward rather
 * than an omission. A number of unknown origin should not exist; a number whose origin is known and whose value
 * is nonsense is precisely what an institution needs to be shown.
 */
export interface KpiReadingServiceDeps {
  readonly repository: KpiReadingRepository;
  readonly definitions: KpiDefinitionRepository;
  readonly evidence: EvidenceRecordDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class KpiReadingService {
  private readonly repository: KpiReadingRepository;
  private readonly definitions: KpiDefinitionRepository;
  private readonly evidence: EvidenceRecordDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: KpiReadingServiceDeps) {
    this.repository = deps.repository;
    this.definitions = deps.definitions;
    this.evidence = deps.evidence;
    this.events = deps.events;
  }

  // --- Recording -------------------------------------------------------------------

  /**
   * File a figure against an indicator.
   *
   * The definition is loaded rather than passed, because everything the reading knows about itself beyond the
   * figure — tenant, organization, key, pillar, scale — comes off it, and a caller able to hand in a definition
   * would be able to hand in the wrong one and score a figure against a scale that was never agreed for it.
   *
   * The store is not touched until every check has passed. The definition, then the period's occupancy, then the
   * pure construction, then the evidence: a refusal from any of them leaves the tenant exactly as it was.
   */
  async record(
    tenantId: TenantId,
    kpiDefinitionId: Uuid,
    params: RecordKpiReadingParams,
  ): Promise<KpiReading> {
    const definition = await this.requireDefinition(tenantId, kpiDefinitionId);
    await this.requirePeriodFree(definition, params.period);

    const reading = recordKpiReading(definition, params);
    await this.requireEvidenceResolves(tenantId, reading.citations);

    await this.repository.save(reading);
    await this.emit(kpiReadingRecorded(reading));
    return reading;
  }

  /**
   * Say that a figure should never have counted.
   *
   * The reason is compulsory here, unlike the reason on an invalidated assessment or a retracted briefing. A
   * withdrawn reading silently changes an index it already contributed to, and the only record of *why* the
   * institution's own history moved is this string.
   */
  async withdraw(tenantId: TenantId, id: Uuid, reason: string): Promise<KpiReading> {
    const next = withdrawKpiReading(await this.require(tenantId, id), reason);
    await this.repository.save(next);
    await this.emit(kpiReadingWithdrawn(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One reading, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<KpiReading> {
    return this.require(tenantId, id);
  }

  /** The standing figure for one indicator at one period, or `null`. Withdrawn readings do not answer. */
  async findForPeriod(
    tenantId: TenantId,
    kpiDefinitionId: Uuid,
    period: number,
  ): Promise<KpiReading | null> {
    return this.repository.findByKpiAndPeriod(tenantId, kpiDefinitionId, period);
  }

  /** One indicator's series, oldest first. */
  async listByKpi(tenantId: TenantId, kpiDefinitionId: Uuid): Promise<readonly KpiReading[]> {
    return this.repository.listByKpi(tenantId, kpiDefinitionId);
  }

  /**
   * The most recent standing figure for each of an institution's indicators, however old it is.
   *
   * Age is not filtered here and must not be. An indicator whose last reading is two years old is a stale
   * reading, and dropping it would report the same coverage gap with the one piece of information that would
   * tell somebody where to go removed.
   */
  async listLatest(tenantId: TenantId, organizationId: Uuid): Promise<readonly KpiReading[]> {
    return this.repository.listLatestPerKpi(tenantId, organizationId);
  }

  /** Every reading in the tenant, withdrawn ones included. */
  async list(tenantId: TenantId): Promise<readonly KpiReading[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The reading under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<KpiReading> {
    const reading = await this.repository.findById(tenantId, id);
    if (!reading) {
      throw new KpiReadingNotFoundError(id);
    }
    return reading;
  }

  /** The indicator this figure is about, or a 404 naming it. */
  private async requireDefinition(tenantId: TenantId, id: Uuid): Promise<KpiDefinition> {
    const definition = await this.definitions.findById(tenantId, id);
    if (!definition) {
      throw new KpiDefinitionNotFoundError(id);
    }
    return definition;
  }

  /** No standing figure already occupies this indicator's period. */
  private async requirePeriodFree(definition: KpiDefinition, period: number): Promise<void> {
    const existing = await this.repository.findByKpiAndPeriod(
      definition.tenantId,
      definition.id,
      period,
    );
    if (existing) {
      throw new DuplicateKpiReadingError(definition.kpiKey, period);
    }
  }

  /**
   * Every cited record exists in the domain that owns it.
   *
   * Sequential rather than concurrent, so the refusal names the first citation that failed rather than an
   * arbitrary one of several — which is what an author correcting a form needs to be told.
   */
  private async requireEvidenceResolves(
    tenantId: TenantId,
    citations: readonly EvidenceCitation[],
  ): Promise<void> {
    for (const citation of citations) {
      if (!(await this.evidence.exists(tenantId, citation))) {
        throw new EvidenceRecordNotFoundError(
          citation.kind,
          citation.sourceDomain,
          citation.sourceRef,
        );
      }
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
