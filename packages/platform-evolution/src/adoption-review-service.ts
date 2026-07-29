import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AdoptionReview,
  type OpenReviewParams,
  type RecordBenefitParams,
  type ReviewedBenefit,
  concludeReview,
  observeBenefit,
  openReview,
  recordBenefit,
} from "./adoption-review";
import {
  AdoptionReviewNotFoundError,
  BenefitNotClaimedError,
  DuplicateAdoptionReviewError,
  InitiativeNotAdoptedError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import { benefitClaimed, benefitObserved, reviewConcluded, reviewOpened } from "./evolution-events";
import { normalizeKey } from "./evolution-value";
import { isInitiativeAdopted } from "./improvement-initiative";
import type {
  AdoptionReviewRepository,
  ImprovementInitiativeRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for adoption reviews — did the change the institution made do what it promised?
 *
 * The aggregate says plainly that two of its rules are not its own, and this is where they live.
 *
 * **The initiative was actually adopted.** Reviewing a rejected or withdrawn proposal measures benefits nobody
 * was ever exposed to, and the result files alongside reviews of changes that really happened. The check reads
 * the initiative's own status through its repository, so the refusal names the status that stopped it — which is
 * the difference between a reviewer learning *this was withdrawn in March* and a reviewer learning nothing.
 *
 * **One review per initiative per period.** The period is what says how long after adoption the institution
 * looked, and it is half of what a realization verdict means. Two reviews of one change at one interval are two
 * answers to a single question, and the second is the one a reader finds first.
 *
 * What this service does not do is decide anything about the verdict. {@link recommendVerdict} runs in the
 * engine, {@link concludeReview} stores what it said, and `revert` is a recommendation rather than an act:
 * undoing an adopted change is a fresh initiative under the reversion gate, with its own proposal and its own
 * deciders. Nothing in this package rolls anything back, and nothing in it can.
 *
 * There is deliberately no coverage floor on concluding. `inconclusive` is a real verdict and the one a reviewer
 * most needs to be able to file — an initiative whose benefits could not be measured has not been shown to work,
 * and holding the review open until somebody produces numbers is exactly how that finding becomes a review
 * nobody concluded and a change nobody questioned.
 */
export interface AdoptionReviewServiceDeps {
  readonly repository: AdoptionReviewRepository;
  readonly initiatives: ImprovementInitiativeRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class AdoptionReviewService {
  private readonly repository: AdoptionReviewRepository;
  private readonly initiatives: ImprovementInitiativeRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AdoptionReviewServiceDeps) {
    this.repository = deps.repository;
    this.initiatives = deps.initiatives;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Opening ---------------------------------------------------------------------

  /**
   * Open a review against an adopted change, at a stated interval after adoption.
   *
   * Both of the rules the aggregate delegates are enforced here, in the order a reviewer would want them: the
   * initiative first, because *this was never adopted* is the more useful thing to be told, and the period
   * second.
   */
  async open(params: OpenReviewParams): Promise<AdoptionReview> {
    const review = openReview(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireAdopted(params.tenantId, params.initiativeId);
    await this.requirePeriodFree(params.tenantId, params.initiativeId, params.reviewPeriod);
    await this.requirePerson(params.tenantId, params.openedBy, "person opening the review");
    await this.repository.save(review);
    await this.emit(reviewOpened(review));
    return review;
  }

  // --- Benefits --------------------------------------------------------------------

  /**
   * Claim a benefit: what the change was supposed to achieve, written down before anybody knows.
   *
   * The stored claim is what the announcement carries, not the arguments — the measure key is normalized on the
   * way through and the promise is computed by the engine, so an event built from the caller's input would
   * disagree with the row it is announcing.
   */
  async claim(tenantId: TenantId, id: Uuid, params: RecordBenefitParams): Promise<AdoptionReview> {
    const review = await this.require(tenantId, id);
    const next = recordBenefit(review, params);
    await this.repository.save(next);
    const claimed = next.benefits[next.benefits.length - 1]!;
    await this.emit(benefitClaimed(next, claimed));
    return next;
  }

  /**
   * Land the observation for a claimed benefit. Once.
   *
   * The observed benefit is found by key rather than by position, because an observation replaces a claim in
   * place and leaves the order alone; the last entry would be whatever was claimed last, which is a different
   * measure most of the time and silently the right one occasionally.
   */
  async observe(
    tenantId: TenantId,
    id: Uuid,
    measureKey: string,
    observed: number,
  ): Promise<AdoptionReview> {
    const review = await this.require(tenantId, id);
    const next = observeBenefit(review, measureKey, observed);
    await this.repository.save(next);
    await this.emit(benefitObserved(next, this.benefitOf(next, measureKey)));
    return next;
  }

  // --- Concluding ------------------------------------------------------------------

  /** Conclude the review. The verdict is now what the institution acts on — and it acts, not this package. */
  async conclude(tenantId: TenantId, id: Uuid, actor: Uuid): Promise<AdoptionReview> {
    await this.requirePerson(tenantId, actor, "person concluding the review");
    return this.transition(tenantId, id, concludeReview, reviewConcluded, actor);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One review, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<AdoptionReview> {
    return this.require(tenantId, id);
  }

  /** The realization trail for one change, in period order — what it delivered, and when it was looked at. */
  async listByInitiative(
    tenantId: TenantId,
    initiativeId: Uuid,
  ): Promise<readonly AdoptionReview[]> {
    return this.repository.listByInitiative(tenantId, initiativeId);
  }

  /** Every review in the tenant, open ones included. */
  async list(tenantId: TenantId): Promise<readonly AdoptionReview[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The review under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<AdoptionReview> {
    const review = await this.repository.findById(tenantId, id);
    if (!review) {
      throw new AdoptionReviewNotFoundError(id);
    }
    return review;
  }

  /** The institution this review belongs to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * The change under review was adopted, and the refusal says what it was instead.
   *
   * An initiative nobody can find and one that was withdrawn are two different findings, and they get two
   * different errors: the first is a 404 from the initiative's own vocabulary, the second a conflict carrying
   * the status. A reviewer told only *not adopted* would go looking for a missing record.
   */
  private async requireAdopted(tenantId: TenantId, initiativeId: Uuid): Promise<void> {
    const initiative = await this.initiatives.findById(tenantId, initiativeId);
    if (!initiative) {
      throw new InitiativeNotAdoptedError(initiativeId, "unknown");
    }
    if (!isInitiativeAdopted(initiative)) {
      throw new InitiativeNotAdoptedError(initiativeId, initiative.status);
    }
  }

  /** No review of this change already exists at this interval. */
  private async requirePeriodFree(
    tenantId: TenantId,
    initiativeId: Uuid,
    reviewPeriod: number,
  ): Promise<void> {
    if (await this.repository.findByInitiativeAndPeriod(tenantId, initiativeId, reviewPeriod)) {
      throw new DuplicateAdoptionReviewError(initiativeId, reviewPeriod);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForEvolutionError(personId, role);
    }
  }

  /**
   * The stored benefit under a measure key, normalized the way the aggregate normalized it.
   *
   * The aggregate has already refused an unclaimed key by the time this runs, so the absence is unreachable;
   * it is raised rather than asserted away so that a future path which stops guaranteeing that fails loudly
   * instead of announcing an observation against nothing.
   */
  private benefitOf(review: AdoptionReview, measureKey: string): ReviewedBenefit {
    const key = normalizeKey(measureKey);
    const benefit = review.benefits.find((entry) => entry.measureKey === key);
    if (!benefit) {
      throw new BenefitNotClaimedError(review.id, key);
    }
    return benefit;
  }

  /** Store an already-transitioned review and announce it. */
  private async record(
    next: AdoptionReview,
    announce: (review: AdoptionReview) => DomainEvent,
  ): Promise<AdoptionReview> {
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  /** Load, run a guarded pure transition, store, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (review: AdoptionReview, ...args: TArgs) => AdoptionReview,
    announce: (review: AdoptionReview) => DomainEvent,
    ...args: TArgs
  ): Promise<AdoptionReview> {
    return this.record(move(await this.require(tenantId, id), ...args), announce);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
