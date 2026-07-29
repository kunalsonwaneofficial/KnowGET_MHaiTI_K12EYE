import type { TenantId, Uuid } from "@knowget/types";
import type { AdoptionReview } from "./adoption-review";
import type { GovernanceGate, LessonOrigin } from "./evolution-value";
import type { EvidenceCitation } from "./evolution-view";
import { isDecisionSettled, type GovernanceDecision } from "./governance-decision";
import { isCycleOpen, type ImprovementCycle } from "./improvement-cycle";
import {
  isInitiativeAdopted,
  isInitiativeOpen,
  type ImprovementInitiative,
} from "./improvement-initiative";
import { isSignalOpen, type ImprovementSignal } from "./improvement-signal";
import { isLessonRetained, type Lesson } from "./lesson";
import { isAssessmentPublished, type MaturityAssessment } from "./maturity-assessment";

/**
 * The storage and directory contracts platform evolution depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond this domain's own records except the four directories, which are read models
 * rather than dependencies — this domain never imports another domain package.
 *
 * **Nothing is removable.** No repository below offers a `remove`, and in a contract whose subject is
 * institutional memory that is not a convenience traded away for governance, it is the whole point. A declined
 * signal is the record that somebody raised something and the institution considered it and said no, which is
 * the first thing anybody wants when the same thing is raised again three years later. A rejected or withdrawn
 * initiative is the record of a change the institution looked at and did not make, and *we already tried that*
 * is worthless without it. A governance decision is a minute, and a deletable minute is not a minute. A
 * superseded lesson is how the institution knows it once believed something else, which is most of what knowing
 * anything consists of. An abandoned cycle says an improvement was started and dropped, and a store where those
 * disappear reports a completion rate the institution does not have. An unpublished assessment is evidence
 * about the number leadership does quote. And an adoption review that concluded `revert` is the single most
 * expensive record in this package to have lost. Every aggregate has a way out that leaves the history intact —
 * declined, merged, rejected, withdrawn, superseded, abandoned, revert — which is what a `remove` would
 * otherwise be reached for.
 *
 * **There is no role, committee or governance-body directory, and that absence is load-bearing.** A quorum here
 * is a count of distinct people, and the only question this package asks about any of them is whether they
 * exist. Adding a directory that could answer whether somebody is entitled to decide a policy change would give
 * platform evolution a second opinion about authority, which the identity contracts own and which the
 * institution would discover had drifted as a leak rather than as an error. It would also tie a settled
 * decision to a committee's current membership, so that renaming the committee, or dissolving it, would quietly
 * change what the record says about who agreed — and a decision record has to outlive the body that took it.
 */

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * signal, initiative, decision, lesson, cycle, assessment and review hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant?
 *
 * Checked wherever this contract names somebody — who raised a signal, who proposed a change, who cast each
 * ballot, who published an assessment. The quorum rule counts distinct people and refuses a proposer's own
 * ballot, and both of those are arithmetic over names; a gate satisfied by identifiers that resolve to nobody
 * would pass every check in the governance engine and mean nothing at all.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the records a signal cites: does the thing this citation points at exist?
 *
 * A signal must stand on evidence, and a citation to a record that is not there satisfies the letter of that and
 * none of its point. Checking when the signal is raised keeps the cost on the person filing it, who can still go
 * and find the right reference, rather than on the reader who follows the citation two years later and arrives
 * nowhere — by which time the signal has been triaged, accepted, and built into a change.
 *
 * The citation arrives whole rather than as a domain and a reference, because which store answers depends on the
 * {@link EvidenceCitation.kind}: an audit finding, a forecast run and a knowledge assertion live in different
 * places and are addressed differently, and an adapter handed only a string pair would have to guess.
 * Resolution is entirely the composition root's problem — this package never dereferences a citation, and could
 * not.
 */
export interface EvidenceRecordDirectory {
  exists(tenantId: TenantId, citation: EvidenceCitation): Promise<boolean>;
}

/**
 * Read model over the institutional knowledge graph (P2-D25): has a memory commitment for this lesson resolved?
 *
 * This is the single directory the contract's first clause turns on. A lesson becomes `retained` on a resolved
 * commitment and at no other moment, and the aggregate takes that answer as a parameter precisely so that it
 * cannot work it out locally — a lesson that could mark itself remembered is a retrospective document, which
 * every institution already has and none of them can query. The answer comes from here, and here is somebody
 * else.
 *
 * The question is asked by lesson key rather than by a commitment reference this package would have to store,
 * and the difference matters twice. It keeps the knowledge graph's own addressing scheme out of this domain's
 * schema, and it means a commitment made later, by a different route, still resolves for the lesson it was made
 * about. What an assertion is, how one is committed, and what makes it resolve are all questions this package
 * never asks and could not answer.
 */
export interface InstitutionalMemoryDirectory {
  commitmentResolved(tenantId: TenantId, organizationId: Uuid, lessonKey: string): Promise<boolean>;
}

// --- Improvement signals ---------------------------------------------------------

/**
 * Storage contract for improvement signals. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-signal-per-key rule, including against settled signals, whose keys stay taken.
 *
 * `listOpen` is the improvement queue itself — everything raised or triaged and not yet disposed of. It is the
 * read that makes the queue a queue rather than a table somebody occasionally searches, and an institution that
 * cannot run it cannot claim it triages what it is told.
 *
 * There is no `listDeclined`. Recurrence is answered through the key: a problem raised again arrives at a key
 * that is already taken, and the settled signal wearing it carries what the institution decided last time. A
 * browsable list of everything anybody ever turned down is a different artifact, with a different audience, and
 * this domain has no use for it.
 */
export interface ImprovementSignalRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementSignal | null>;
  findByKey(tenantId: TenantId, signalKey: string): Promise<ImprovementSignal | null>;
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementSignal[]>;
  listByTenant(tenantId: TenantId): Promise<ImprovementSignal[]>;
  save(signal: ImprovementSignal): Promise<void>;
}

/** In-memory {@link ImprovementSignalRepository} — the default for tests and bootstrap. */
export class InMemoryImprovementSignalRepository implements ImprovementSignalRepository {
  private readonly byId = new Map<string, ImprovementSignal>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ImprovementSignal | null> {
    const signal = this.byId.get(id);
    return signal && signal.tenantId === tenantId ? signal : null;
  }

  async findByKey(tenantId: TenantId, signalKey: string): Promise<ImprovementSignal | null> {
    return (
      [...this.byId.values()].find((s) => s.tenantId === tenantId && s.signalKey === signalKey) ??
      null
    );
  }

  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementSignal[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId && isSignalOpen(s),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ImprovementSignal[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(signal: ImprovementSignal): Promise<void> {
    this.byId.set(signal.id, signal);
  }
}

// --- Improvement initiatives -----------------------------------------------------

/**
 * Storage contract for improvement initiatives. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-initiative-per-key rule.
 *
 * The two list reads answer the two questions an institution asks about change, and they are different
 * questions. `listOpen` is what is in flight — everything proposed, under review or piloting — which is the
 * read that stops an initiative sitting in `submitted` for a year because the person who would have chased it
 * left. `listAdopted` is what the institution actually changed, and it is the worklist adoption review is drawn
 * from: a change that was agreed and never looked at again is the ordinary fate of institutional improvement,
 * and this read is what makes that fate visible.
 */
export interface ImprovementInitiativeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative | null>;
  findByKey(tenantId: TenantId, initiativeKey: string): Promise<ImprovementInitiative | null>;
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]>;
  listAdopted(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]>;
  listByTenant(tenantId: TenantId): Promise<ImprovementInitiative[]>;
  save(initiative: ImprovementInitiative): Promise<void>;
}

/** In-memory {@link ImprovementInitiativeRepository} — the default for tests and bootstrap. */
export class InMemoryImprovementInitiativeRepository implements ImprovementInitiativeRepository {
  private readonly byId = new Map<string, ImprovementInitiative>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative | null> {
    const initiative = this.byId.get(id);
    return initiative && initiative.tenantId === tenantId ? initiative : null;
  }

  async findByKey(
    tenantId: TenantId,
    initiativeKey: string,
  ): Promise<ImprovementInitiative | null> {
    return (
      [...this.byId.values()].find(
        (i) => i.tenantId === tenantId && i.initiativeKey === initiativeKey,
      ) ?? null
    );
  }

  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.organizationId === organizationId && isInitiativeOpen(i),
    );
  }

  async listAdopted(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]> {
    return [...this.byId.values()].filter(
      (i) =>
        i.tenantId === tenantId && i.organizationId === organizationId && isInitiativeAdopted(i),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ImprovementInitiative[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(initiative: ImprovementInitiative): Promise<void> {
    this.byId.set(initiative.id, initiative);
  }
}

// --- Governance decisions --------------------------------------------------------

/**
 * Storage contract for governance decisions. Tenant-scoped (explicit argument + RLS).
 *
 * `findOpenGate` is the one read this contract could not do without. It backs the rule that an initiative
 * cannot have two open gates of the same kind, which is what stops a refused gate from being quietly retried
 * alongside a fresh one until the answer comes out differently. It asks for the gate kind as well as the
 * initiative because the kinds are independent: an approval gate and a later reversion gate on the same change
 * are two legitimate questions, and only a second gate of the same kind while the first is still pending is the
 * move being refused.
 *
 * `listByInitiative` is the decision trail — every gate ever convened on one change, settled or not, in the
 * order it happened. That sequence is the answer to *how was this decided*, and it has to include the gates
 * that were refused, because an initiative that eventually passed on its third attempt is a different fact from
 * one that passed on its first.
 */
export interface GovernanceDecisionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceDecision | null>;
  findOpenGate(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<GovernanceDecision | null>;
  listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<GovernanceDecision[]>;
  listByTenant(tenantId: TenantId): Promise<GovernanceDecision[]>;
  save(decision: GovernanceDecision): Promise<void>;
}

/** In-memory {@link GovernanceDecisionRepository} — the default for tests and bootstrap. */
export class InMemoryGovernanceDecisionRepository implements GovernanceDecisionRepository {
  private readonly byId = new Map<string, GovernanceDecision>();

  async findById(tenantId: TenantId, id: Uuid): Promise<GovernanceDecision | null> {
    const decision = this.byId.get(id);
    return decision && decision.tenantId === tenantId ? decision : null;
  }

  async findOpenGate(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<GovernanceDecision | null> {
    return (
      [...this.byId.values()].find(
        (d) =>
          d.tenantId === tenantId &&
          d.initiativeId === initiativeId &&
          d.gate === gate &&
          !isDecisionSettled(d),
      ) ?? null
    );
  }

  async listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<GovernanceDecision[]> {
    return [...this.byId.values()]
      .filter((d) => d.tenantId === tenantId && d.initiativeId === initiativeId)
      .sort((left, right) => left.convokedAt.localeCompare(right.convokedAt));
  }

  async listByTenant(tenantId: TenantId): Promise<GovernanceDecision[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(decision: GovernanceDecision): Promise<void> {
    this.byId.set(decision.id, decision);
  }
}

// --- Lessons ---------------------------------------------------------------------

/**
 * Storage contract for lessons. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-lesson-per-key rule, and is also how supersession resolves, since a lesson names its replacement by key.
 *
 * `listByOrigin` reads back everything a particular thing taught the institution — one cycle's retrospective,
 * one initiative's outcome, one incident review. It is what a cycle's closure gate is answered against: the
 * refusal to close a cycle that produced nothing is only enforceable if the lessons a cycle produced can be
 * found from the cycle.
 *
 * `listRetained` is institutional memory as this contract can report it — the lessons that actually reached the
 * knowledge graph, as opposed to the ones that were written down. The gap between that list and the full one is
 * the most useful number this package produces about itself, and it is uncomfortable in every institution that
 * has ever run a retrospective, which is why it is a first-class read rather than something a report assembles
 * when somebody asks.
 */
export interface LessonRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Lesson | null>;
  findByKey(tenantId: TenantId, lessonKey: string): Promise<Lesson | null>;
  listByOrigin(tenantId: TenantId, origin: LessonOrigin, originRef: string): Promise<Lesson[]>;
  listRetained(tenantId: TenantId, organizationId: Uuid): Promise<Lesson[]>;
  listByTenant(tenantId: TenantId): Promise<Lesson[]>;
  save(lesson: Lesson): Promise<void>;
}

/** In-memory {@link LessonRepository} — the default for tests and bootstrap. */
export class InMemoryLessonRepository implements LessonRepository {
  private readonly byId = new Map<string, Lesson>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Lesson | null> {
    const lesson = this.byId.get(id);
    return lesson && lesson.tenantId === tenantId ? lesson : null;
  }

  async findByKey(tenantId: TenantId, lessonKey: string): Promise<Lesson | null> {
    return (
      [...this.byId.values()].find((l) => l.tenantId === tenantId && l.lessonKey === lessonKey) ??
      null
    );
  }

  async listByOrigin(
    tenantId: TenantId,
    origin: LessonOrigin,
    originRef: string,
  ): Promise<Lesson[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.origin === origin && l.originRef === originRef,
    );
  }

  async listRetained(tenantId: TenantId, organizationId: Uuid): Promise<Lesson[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.organizationId === organizationId && isLessonRetained(l),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Lesson[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(lesson: Lesson): Promise<void> {
    this.byId.set(lesson.id, lesson);
  }
}

// --- Improvement cycles ----------------------------------------------------------

/**
 * Storage contract for improvement cycles. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-cycle-per-key rule, and the key is also what a cycle's lessons cite as their origin reference.
 *
 * `listOpen` is every cycle still running — planning, executing or reviewing. A cycle carries the span it
 * committed to, so this read plus the caller's own period is the whole of *what did we say we would improve
 * this year, and where has it got to*. Institutions do not usually lose track of cycles by closing them wrongly;
 * they lose track by never asking, and an open-cycle read is the question made cheap enough to ask routinely.
 */
export interface ImprovementCycleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle | null>;
  findByKey(tenantId: TenantId, cycleKey: string): Promise<ImprovementCycle | null>;
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementCycle[]>;
  listByTenant(tenantId: TenantId): Promise<ImprovementCycle[]>;
  save(cycle: ImprovementCycle): Promise<void>;
}

/** In-memory {@link ImprovementCycleRepository} — the default for tests and bootstrap. */
export class InMemoryImprovementCycleRepository implements ImprovementCycleRepository {
  private readonly byId = new Map<string, ImprovementCycle>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle | null> {
    const cycle = this.byId.get(id);
    return cycle && cycle.tenantId === tenantId ? cycle : null;
  }

  async findByKey(tenantId: TenantId, cycleKey: string): Promise<ImprovementCycle | null> {
    return (
      [...this.byId.values()].find((c) => c.tenantId === tenantId && c.cycleKey === cycleKey) ??
      null
    );
  }

  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementCycle[]> {
    return [...this.byId.values()]
      .filter(
        (c) => c.tenantId === tenantId && c.organizationId === organizationId && isCycleOpen(c),
      )
      .sort((left, right) => left.startPeriod - right.startPeriod);
  }

  async listByTenant(tenantId: TenantId): Promise<ImprovementCycle[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(cycle: ImprovementCycle): Promise<void> {
    this.byId.set(cycle.id, cycle);
  }
}

// --- Maturity assessments --------------------------------------------------------

/**
 * Storage contract for maturity assessments. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-assessment-per-key rule.
 *
 * `listPublished` returns the published assessments in period order, and both halves of that are deliberate.
 * Published, because a maturity index is a number leadership quotes and a draft one is a number somebody is
 * still assembling; a trend line that mixed them would move for reasons that are not about the institution. In
 * period order, because a single index is nearly meaningless — five is not good and two is not bad without
 * knowing what last year was — and the trajectory is the only part of this that supports a decision.
 *
 * There is no `findByPeriod`. Nothing in this domain says an organization gets one assessment per period, and a
 * read shaped as though it did would be the first place that rule appeared, enforced by nothing.
 */
export interface MaturityAssessmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MaturityAssessment | null>;
  findByKey(tenantId: TenantId, assessmentKey: string): Promise<MaturityAssessment | null>;
  listPublished(tenantId: TenantId, organizationId: Uuid): Promise<MaturityAssessment[]>;
  listByTenant(tenantId: TenantId): Promise<MaturityAssessment[]>;
  save(assessment: MaturityAssessment): Promise<void>;
}

/** In-memory {@link MaturityAssessmentRepository} — the default for tests and bootstrap. */
export class InMemoryMaturityAssessmentRepository implements MaturityAssessmentRepository {
  private readonly byId = new Map<string, MaturityAssessment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MaturityAssessment | null> {
    const assessment = this.byId.get(id);
    return assessment && assessment.tenantId === tenantId ? assessment : null;
  }

  async findByKey(tenantId: TenantId, assessmentKey: string): Promise<MaturityAssessment | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.tenantId === tenantId && a.assessmentKey === assessmentKey,
      ) ?? null
    );
  }

  async listPublished(tenantId: TenantId, organizationId: Uuid): Promise<MaturityAssessment[]> {
    return [...this.byId.values()]
      .filter(
        (a) =>
          a.tenantId === tenantId &&
          a.organizationId === organizationId &&
          isAssessmentPublished(a),
      )
      .sort((left, right) => left.period - right.period);
  }

  async listByTenant(tenantId: TenantId): Promise<MaturityAssessment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(assessment: MaturityAssessment): Promise<void> {
    this.byId.set(assessment.id, assessment);
  }
}

// --- Adoption reviews ------------------------------------------------------------

/**
 * Storage contract for adoption reviews. Tenant-scoped (explicit argument + RLS).
 *
 * `findByInitiativeAndPeriod` backs the one-review-per-initiative-per-period rule. Without it, a review whose
 * verdict was unwelcome could be reopened as a second review of the same change at the same distance from
 * adoption, and the institution would hold two answers to one question with nothing in the record saying which
 * was asked first.
 *
 * `listByInitiative` is the realization trail in period order, and it is why the period is part of the identity
 * rather than a detail. Reviewing an adopted change at one period and again at four is the normal shape of
 * benefits realization — early movement often decays, and the whole argument for reviewing twice is that the
 * second answer is allowed to differ from the first. Ordered, those two records are a finding; unordered they
 * are a contradiction.
 */
export interface AdoptionReviewRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AdoptionReview | null>;
  findByInitiativeAndPeriod(
    tenantId: TenantId,
    initiativeId: Uuid,
    reviewPeriod: number,
  ): Promise<AdoptionReview | null>;
  listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<AdoptionReview[]>;
  listByTenant(tenantId: TenantId): Promise<AdoptionReview[]>;
  save(review: AdoptionReview): Promise<void>;
}

/** In-memory {@link AdoptionReviewRepository} — the default for tests and bootstrap. */
export class InMemoryAdoptionReviewRepository implements AdoptionReviewRepository {
  private readonly byId = new Map<string, AdoptionReview>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AdoptionReview | null> {
    const review = this.byId.get(id);
    return review && review.tenantId === tenantId ? review : null;
  }

  async findByInitiativeAndPeriod(
    tenantId: TenantId,
    initiativeId: Uuid,
    reviewPeriod: number,
  ): Promise<AdoptionReview | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.initiativeId === initiativeId &&
          r.reviewPeriod === reviewPeriod,
      ) ?? null
    );
  }

  async listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<AdoptionReview[]> {
    return [...this.byId.values()]
      .filter((r) => r.tenantId === tenantId && r.initiativeId === initiativeId)
      .sort((left, right) => left.reviewPeriod - right.reviewPeriod);
  }

  async listByTenant(tenantId: TenantId): Promise<AdoptionReview[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(review: AdoptionReview): Promise<void> {
    this.byId.set(review.id, review);
  }
}
