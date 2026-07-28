import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { raiseForIndex, raiseForKpi, raiseForPillar, rankAttention } from "./attention";
import {
  type AttentionItem,
  acknowledgeAttentionItem,
  dismissAttentionItem,
  isAttentionItemOpen,
  raiseAttentionItem,
  rankAttentionItems,
  resolveAttentionItem,
  restateAttentionItem,
} from "./attention-item";
import {
  attentionAcknowledged,
  attentionDismissed,
  attentionRaised,
  attentionResolved,
  attentionRestated,
} from "./command-events";
import type { AttentionSignal } from "./command-view";
import {
  AttentionItemNotFoundError,
  DuplicateAttentionItemError,
  HealthIndexAssessmentNotFoundError,
} from "./errors";
import { type HealthIndexAssessment, toIndexWatch, toPillarWatch } from "./health-index-assessment";
import { toKpiWatch } from "./kpi-reading";
import type {
  AttentionItemRepository,
  HealthIndexAssessmentRepository,
  KpiDefinitionRepository,
  KpiReadingRepository,
} from "./ports";

/**
 * Application service for attention items — what one period's arithmetic is asking somebody to go and look at.
 *
 * {@link AttentionItemService.sweep} is the whole of it. The three raising engines each answer a different
 * question about an assessment and none of them can be asked without context an aggregate does not have: the
 * index engine wants the period before this one, the pillar engine wants the run of periods behind each pillar,
 * and the KPI engine wants the definition and the figure behind each audited reading. Assembling that is this
 * service's job, and it is the same shape of job the assessment service does — which is why both of them live at
 * this seam and neither of them lives in an aggregate.
 *
 * The **declared pillars come off the assessment's pinned run**, not off today's definition. An assessment
 * computed under a five-pillar composition must be swept as a five-pillar assessment even after the institution
 * recomposed to eight, or the sweep would raise coverage gaps for pillars that period never declared and hand
 * somebody a queue of findings about a decision made after the fact.
 *
 * The **figure behind each audited reading is resolved at the period the audit names**, rather than taken as the
 * indicator's latest. It costs a lookup per audited reading and it is worth it: the alternative is a target miss
 * raised on a figure this assessment never saw, filed against this assessment's queue, where whoever picks it up
 * has no way to tell that the number in front of them is not the number that caused it. A reading withdrawn since
 * resolves to nothing and raises nothing, which is the same judgement the roll-up makes about it.
 *
 * Sweeping is **idempotent by restatement and never by reopening**. A finding already on the queue and still open
 * has its severity and observed quantity updated, because a problem that deteriorated is the same problem getting
 * worse. A finding somebody closed is returned untouched: a resolution corroborated or contradicted by the next
 * period's assessment is how this contract checks its own advice, and a sweep that quietly reopened closed rows
 * would erase the record that a human looked — which is the only thing separating a queue from a list of alerts.
 *
 * Signals are ranked before they are settled, so the items an institution's first sweep creates carry the same
 * order the queue reads in. That matters at exactly one moment: a briefing pinning findings straight off a fresh
 * sweep gets them loudest-first without anybody having to remember to sort.
 */
export interface AttentionItemServiceDeps {
  readonly repository: AttentionItemRepository;
  readonly assessments: HealthIndexAssessmentRepository;
  readonly kpis: KpiDefinitionRepository;
  readonly readings: KpiReadingRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class AttentionItemService {
  private readonly repository: AttentionItemRepository;
  private readonly assessments: HealthIndexAssessmentRepository;
  private readonly kpis: KpiDefinitionRepository;
  private readonly readings: KpiReadingRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AttentionItemServiceDeps) {
    this.repository = deps.repository;
    this.assessments = deps.assessments;
    this.kpis = deps.kpis;
    this.readings = deps.readings;
    this.events = deps.events;
  }

  // --- Raising ---------------------------------------------------------------------

  /**
   * Raise everything one assessment's arithmetic asks for, and return the queue it produced.
   *
   * Safe to run again. Findings already open are restated from the fresh signal, findings already closed are left
   * alone, and findings the arithmetic no longer produces are not withdrawn — an item is a record of what a
   * period's numbers said, and a period's numbers do not stop having said it.
   */
  async sweep(tenantId: TenantId, assessmentId: Uuid): Promise<readonly AttentionItem[]> {
    const assessment = await this.requireAssessment(tenantId, assessmentId);
    const history = await this.assessments.listBeforePeriod(
      tenantId,
      assessment.indexKey,
      assessment.period,
    );

    const signals: AttentionSignal[] = [
      ...raiseForIndex(toIndexWatch(assessment, history.at(-1) ?? null)),
    ];
    for (const declared of assessment.run.weights) {
      signals.push(...raiseForPillar(toPillarWatch(assessment, declared.pillar, history)));
    }
    signals.push(...(await this.kpiSignals(assessment)));

    const items: AttentionItem[] = [];
    for (const signal of rankAttention(signals)) {
      items.push(await this.settle(assessment, signal));
    }
    return items;
  }

  /**
   * Put one finding on a period's queue.
   *
   * Refuses rather than restates when the key is already taken, and the refusal names both halves of the item's
   * identity. A caller that meant to update an existing finding is holding the wrong operation, and quietly
   * doing the other one for them would hide the fact that they did not know the finding was already there.
   */
  async raise(
    tenantId: TenantId,
    assessmentId: Uuid,
    signal: AttentionSignal,
  ): Promise<AttentionItem> {
    const assessment = await this.requireAssessment(tenantId, assessmentId);
    const held = await this.repository.findByAssessmentAndKey(tenantId, assessment.id, signal.key);
    if (held) {
      throw new DuplicateAttentionItemError(assessment.id, signal.key);
    }

    const item = raiseAttentionItem(assessment, signal);
    await this.repository.save(item);
    await this.emit(attentionRaised(item));
    return item;
  }

  /** Update an open finding from a fresh raising of itself. Severity and quantity move; identity does not. */
  async restate(tenantId: TenantId, id: Uuid, signal: AttentionSignal): Promise<AttentionItem> {
    return this.transition(tenantId, id, restateAttentionItem, attentionRestated, signal);
  }

  // --- Working the queue -----------------------------------------------------------

  /** Say that somebody has picked this up. From `open` only, so the waiting interval stays meaningful. */
  async acknowledge(tenantId: TenantId, id: Uuid, actor: Uuid | null): Promise<AttentionItem> {
    return this.transition(tenantId, id, acknowledgeAttentionItem, attentionAcknowledged, actor);
  }

  /** Close it because the institution dealt with it. The note is optional; next period corroborates. */
  async resolve(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null,
    note?: string | null,
  ): Promise<AttentionItem> {
    return this.transition(
      tenantId,
      id,
      resolveAttentionItem,
      attentionResolved,
      actor,
      note ?? null,
    );
  }

  /** Close it because it should not have been raised. The reason is compulsory and is the only feedback. */
  async dismiss(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null,
    reason: string,
  ): Promise<AttentionItem> {
    return this.transition(tenantId, id, dismissAttentionItem, attentionDismissed, actor, reason);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One item, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<AttentionItem> {
    return this.require(tenantId, id);
  }

  /**
   * What an institution is currently being asked to look at, loudest first.
   *
   * Ranked here rather than by the caller, because an unordered queue is a list, and the one thing a queue owes
   * whoever opens it is that the top of it is the thing to do next.
   */
  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<readonly AttentionItem[]> {
    return rankAttentionItems(await this.repository.listOpen(tenantId, organizationId));
  }

  /** Everything one period's arithmetic raised, closed items included, loudest first. */
  async listByAssessment(
    tenantId: TenantId,
    assessmentId: Uuid,
  ): Promise<readonly AttentionItem[]> {
    return rankAttentionItems(await this.repository.listByAssessment(tenantId, assessmentId));
  }

  /** Every item in the tenant, at any status. */
  async list(tenantId: TenantId): Promise<readonly AttentionItem[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The item under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<AttentionItem> {
    const item = await this.repository.findById(tenantId, id);
    if (!item) {
      throw new AttentionItemNotFoundError(id);
    }
    return item;
  }

  /** The assessment whose arithmetic is being read, or a 404 naming it. */
  private async requireAssessment(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment> {
    const assessment = await this.assessments.findById(tenantId, id);
    if (!assessment) {
      throw new HealthIndexAssessmentNotFoundError(id);
    }
    return assessment;
  }

  /**
   * What the indicators behind this assessment are asking for.
   *
   * Driven off the evidence audit rather than off the institution's indicator list, so the signals are about the
   * readings this assessment actually consumed. An indicator that reported nothing has no audit and raises
   * nothing here — its absence is already the coverage its pillar reported, and saying it twice would put the
   * same hole in the queue at two levels.
   */
  private async kpiSignals(assessment: HealthIndexAssessment): Promise<readonly AttentionSignal[]> {
    const declared = await this.kpis.listActive(assessment.tenantId, assessment.organizationId);
    const byKey = new Map(declared.map((definition) => [definition.kpiKey, definition]));

    const signals: AttentionSignal[] = [];
    for (const audit of assessment.evidence.audits) {
      const definition = byKey.get(audit.kpiKey);
      if (!definition) continue;

      const reading = await this.readings.findByKpiAndPeriod(
        assessment.tenantId,
        definition.id,
        audit.period,
      );
      if (!reading) continue;

      signals.push(...raiseForKpi(toKpiWatch(reading, definition, audit.admission)));
    }
    return signals;
  }

  /** Raise the finding, or restate it if it is already open, or leave it alone if somebody closed it. */
  private async settle(
    assessment: HealthIndexAssessment,
    signal: AttentionSignal,
  ): Promise<AttentionItem> {
    const held = await this.repository.findByAssessmentAndKey(
      assessment.tenantId,
      assessment.id,
      signal.key,
    );

    if (!held) {
      const raised = raiseAttentionItem(assessment, signal);
      await this.repository.save(raised);
      await this.emit(attentionRaised(raised));
      return raised;
    }
    if (!isAttentionItemOpen(held)) {
      return held;
    }

    const restated = restateAttentionItem(held, signal);
    await this.repository.save(restated);
    await this.emit(attentionRestated(restated));
    return restated;
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (item: AttentionItem, ...args: TArgs) => AttentionItem,
    announce: (item: AttentionItem) => DomainEvent,
    ...args: TArgs
  ): Promise<AttentionItem> {
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
