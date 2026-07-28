import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  briefingDrafted,
  briefingFindingsSet,
  briefingIssued,
  briefingRevised,
  briefingWithdrawn,
} from "./command-events";
import { normalizeBriefingKey } from "./command-value";
import type { AttentionSignal } from "./command-view";
import {
  DuplicateBriefingKeyError,
  ExecutiveBriefingNotFoundError,
  HealthIndexAssessmentNotFoundError,
} from "./errors";
import {
  type DraftBriefingParams,
  type ExecutiveBriefing,
  type ReviseBriefingParams,
  briefingVisibleTo,
  draftBriefing,
  issueBriefing,
  reviseBriefing,
  setBriefingFindings,
  withdrawBriefing,
} from "./executive-briefing";
import type { HealthIndexAssessment } from "./health-index-assessment";
import type { ExecutiveBriefingRepository, HealthIndexAssessmentRepository } from "./ports";

/**
 * Application service for executive briefings — what the institution said about its own numbers, and to whom.
 *
 * The assessment is loaded twice over a briefing's life and it has to be, which is the one thing worth
 * understanding about this service. `draftBriefing` and `issueBriefing` each take the assessment because each
 * needs to check that it is still final, and between those two moments an author writes, revises and re-ranks —
 * during which a reading behind the cited figure can be withdrawn and the assessment invalidated. Re-loading at
 * issue is what stops a briefing being sent quoting a composite the institution has since taken back. A service
 * that had cached the assessment from the draft would send it, correctly by its own reckoning, and the board
 * would be handed a number the platform already knew was withdrawn.
 *
 * The figure itself is pinned into the briefing rather than referenced, which is why the two checks are about
 * standing rather than about value. What was quoted stays quoted even after the assessment is invalidated — a
 * board shown a figure is owed the record that it was shown it — so the only question at issue time is whether
 * the institution still stands behind what the document is about to say.
 *
 * Visibility is all or nothing here, and the read path enforces it rather than leaving it to the caller.
 * `listIssued` answers what an institution currently stands behind, which is not the same question as what a
 * given reader may see, and serving the first as though it were the second would leak the titles of every
 * confidential briefing to everybody. So the reads that a viewer reaches take granted scopes, and a briefing
 * whose audience a reader is not in answers as absent rather than as forbidden.
 */
export interface ExecutiveBriefingServiceDeps {
  readonly repository: ExecutiveBriefingRepository;
  readonly assessments: HealthIndexAssessmentRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class ExecutiveBriefingService {
  private readonly repository: ExecutiveBriefingRepository;
  private readonly assessments: HealthIndexAssessmentRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ExecutiveBriefingServiceDeps) {
    this.repository = deps.repository;
    this.assessments = deps.assessments;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /**
   * Start a document about a figure the institution stands behind.
   *
   * The tenant, institution, series, period and cited figure all come off the assessment, so there is no
   * parameter by which a briefing could be filed against one assessment while quoting another.
   */
  async draft(
    tenantId: TenantId,
    assessmentId: Uuid,
    params: DraftBriefingParams,
  ): Promise<ExecutiveBriefing> {
    const assessment = await this.requireAssessment(tenantId, assessmentId);
    const briefing = draftBriefing(assessment, params);
    await this.requireKeyFree(tenantId, briefing.briefingKey);
    await this.repository.save(briefing);
    await this.emit(briefingDrafted(briefing));
    return briefing;
  }

  /** Change the briefing's own words. Drafting only: a document that circulated is not edited. */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ReviseBriefingParams,
  ): Promise<ExecutiveBriefing> {
    return this.transition(tenantId, id, reviseBriefing, briefingRevised, params);
  }

  /** Replace what leadership will be pointed at. Re-ranked on the way in, then frozen in that order. */
  async setFindings(
    tenantId: TenantId,
    id: Uuid,
    findings: readonly AttentionSignal[],
  ): Promise<ExecutiveBriefing> {
    return this.transition(tenantId, id, setBriefingFindings, briefingFindingsSet, findings);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Send it, if the figure it quotes is one the institution still stands behind.
   *
   * The assessment is resolved from the briefing rather than from the caller, because the briefing already
   * recorded which figure it is about and a second-hand id could only ever disagree with it.
   */
  async issue(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing> {
    const briefing = await this.require(tenantId, id);
    const assessment = await this.requireAssessment(tenantId, briefing.assessmentId);
    const next = issueBriefing(briefing, assessment);
    await this.repository.save(next);
    await this.emit(briefingIssued(next));
    return next;
  }

  /** Retract a briefing that went out. Reachable from `issued` and nowhere else. */
  async withdraw(tenantId: TenantId, id: Uuid, reason?: string | null): Promise<ExecutiveBriefing> {
    return this.transition(tenantId, id, withdrawBriefing, briefingWithdrawn, reason ?? null);
  }

  // --- Reading ---------------------------------------------------------------------

  /**
   * The briefing behind a key, as a reader holding these scopes may have it.
   *
   * Unissued and out-of-audience both answer as absent, so a reader learns nothing from the difference between a
   * document they may not see and a key nobody has used. Withdrawn briefings do resolve: a minute citing one must
   * still reach the document, and the fact that it was retracted.
   */
  async view(
    tenantId: TenantId,
    briefingKey: string,
    grantedScopes: readonly string[],
  ): Promise<ExecutiveBriefing> {
    const wanted = normalizeBriefingKey(briefingKey);
    const briefing = await this.repository.findByKey(tenantId, wanted);
    if (
      !briefing ||
      briefing.status === "drafting" ||
      !briefingVisibleTo(briefing, grantedScopes)
    ) {
      throw new ExecutiveBriefingNotFoundError(wanted);
    }
    return briefing;
  }

  /** What an institution currently stands behind, narrowed to what this reader is an audience for. */
  async listVisible(
    tenantId: TenantId,
    organizationId: Uuid,
    grantedScopes: readonly string[],
  ): Promise<readonly ExecutiveBriefing[]> {
    const issued = await this.repository.listIssued(tenantId, organizationId);
    return issued.filter((briefing) => briefingVisibleTo(briefing, grantedScopes));
  }

  /** One briefing, or a 404. The author's read; never what a viewer is served. */
  async get(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing> {
    return this.require(tenantId, id);
  }

  /** One briefing by the key it is addressed under, or a 404 naming the normalized key. */
  async getByKey(tenantId: TenantId, briefingKey: string): Promise<ExecutiveBriefing> {
    const wanted = normalizeBriefingKey(briefingKey);
    const briefing = await this.repository.findByKey(tenantId, wanted);
    if (!briefing) {
      throw new ExecutiveBriefingNotFoundError(wanted);
    }
    return briefing;
  }

  /** Everything an institution currently stands behind, whoever may read it. */
  async listIssued(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly ExecutiveBriefing[]> {
    return this.repository.listIssued(tenantId, organizationId);
  }

  /** Every document written about one figure, withdrawn ones included. */
  async listByAssessment(
    tenantId: TenantId,
    assessmentId: Uuid,
  ): Promise<readonly ExecutiveBriefing[]> {
    return this.repository.listByAssessment(tenantId, assessmentId);
  }

  /** Every briefing in the tenant, at any status. */
  async list(tenantId: TenantId): Promise<readonly ExecutiveBriefing[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The briefing under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing> {
    const briefing = await this.repository.findById(tenantId, id);
    if (!briefing) {
      throw new ExecutiveBriefingNotFoundError(id);
    }
    return briefing;
  }

  /**
   * The figure this document is about, or a 404 naming it.
   *
   * A briefing whose assessment cannot be resolved is a 404 about the assessment rather than about the briefing,
   * because the briefing is right there and the thing that has gone missing is the record it depends on.
   */
  private async requireAssessment(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment> {
    const assessment = await this.assessments.findById(tenantId, id);
    if (!assessment) {
      throw new HealthIndexAssessmentNotFoundError(id);
    }
    return assessment;
  }

  /**
   * No other briefing already answers to this key.
   *
   * Tenant-wide and across every status, withdrawn documents included. A retraction that freed its key would let
   * a later briefing take the address of the one it retracted, and a citation of the withdrawn document would
   * then resolve, silently, to the one that replaced it.
   */
  private async requireKeyFree(tenantId: TenantId, briefingKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, briefingKey)) {
      throw new DuplicateBriefingKeyError(briefingKey);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (briefing: ExecutiveBriefing, ...args: TArgs) => ExecutiveBriefing,
    announce: (briefing: ExecutiveBriefing) => DomainEvent,
    ...args: TArgs
  ): Promise<ExecutiveBriefing> {
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
