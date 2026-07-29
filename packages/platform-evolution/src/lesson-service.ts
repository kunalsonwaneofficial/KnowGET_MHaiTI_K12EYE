import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateLessonKeyError,
  LessonNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  lessonRecorded,
  lessonRetained,
  lessonRevised,
  lessonSuperseded,
} from "./evolution-events";
import { type LessonOrigin, normalizeKey } from "./evolution-value";
import {
  type Lesson,
  type RecordLessonParams,
  recordLesson,
  retainLesson,
  reviseLesson,
  supersedeLesson,
} from "./lesson";
import type {
  InstitutionalMemoryDirectory,
  LessonRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for lessons — what the institution concluded, and whether it actually remembered it.
 *
 * The load-bearing work here is **asking the knowledge graph whether the commitment resolved**. {@link
 * retainLesson} takes that answer as a parameter so that it cannot decide it, and somebody has to do the asking:
 * it is this service, through {@link InstitutionalMemoryDirectory}, keyed by the lesson's own key and its own
 * organization. There is no parameter on {@link LessonService.retain} by which a caller supplies its own answer,
 * no privileged path that skips the lookup, and no flag — which is the same shape as the initiative service's
 * gate lookup and exists for the same reason. A lesson that could be marked remembered by whoever wrote it is a
 * retrospective document, and every institution already has one of those.
 *
 * The consequence is that `retain` fails routinely, and that is the intervention rather than a defect in it. An
 * institution running this platform gets a real number for how much of what it concluded reached memory, and the
 * gap between {@link LessonRepository.listByTenant} and {@link LessonRepository.listRetained} is the most useful
 * thing this package reports about its owner.
 *
 * **The key is free, tenant-wide, and superseded keys stay taken.** A lesson key is what a cycle, a lineage trace
 * and a successor all quote, so two lessons cannot answer to one. Superseded lessons count for the check: a new
 * lesson wearing a replaced key would collapse the institution's record of having changed its mind into a single
 * row that has apparently always said this. The aggregate cannot hold this rule — it has one lesson in hand and
 * no directory of the others.
 *
 * **A supersession points at a lesson that exists.** The aggregate refuses a lesson that names itself, which is
 * decidable in hand, and stops there. Whether the successor is real needs the store, and a lesson superseded by
 * nothing is worse than one nobody corrected: it is removed from institutional memory in favour of a conclusion
 * that cannot be read.
 */
export interface LessonServiceDeps {
  readonly repository: LessonRepository;
  readonly memory: InstitutionalMemoryDirectory;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class LessonService {
  private readonly repository: LessonRepository;
  private readonly memory: InstitutionalMemoryDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LessonServiceDeps) {
    this.repository = deps.repository;
    this.memory = deps.memory;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Recording -------------------------------------------------------------------

  /** Write down what the institution concluded. It starts `provisional`, and that is not a formality. */
  async record(params: RecordLessonParams): Promise<Lesson> {
    const lesson = recordLesson(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, lesson.lessonKey);
    await this.requireActor(params.tenantId, params.recordedBy, "person recording the lesson");
    await this.repository.save(lesson);
    await this.emit(lessonRecorded(lesson));
    return lesson;
  }

  /** Rewrite the conclusion and what it speaks to, while it is still provisional. */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    statement: string,
    applicability: readonly string[],
  ): Promise<Lesson> {
    return this.transition(tenantId, id, reviseLesson, lessonRevised, statement, applicability);
  }

  // --- Retention -------------------------------------------------------------------

  /**
   * Move the lesson into institutional memory, if the knowledge graph says its commitment resolved.
   *
   * The directory is asked about this lesson's key in this lesson's organization, both read off the stored
   * record rather than taken from the caller — a caller who could name the key being asked about could have any
   * lesson retained by pointing the question at one that had been committed.
   *
   * An unresolved commitment comes back as `false` and is refused by the aggregate, with its own error naming
   * what is missing. Nothing here retries, queues or defers: a lesson nobody committed is not pending, it is
   * unfinished, and the platform reports it as such until somebody does the committing.
   */
  async retain(tenantId: TenantId, id: Uuid, atPeriod: number): Promise<Lesson> {
    const lesson = await this.require(tenantId, id);
    const resolved = await this.memory.commitmentResolved(
      tenantId,
      lesson.organizationId,
      lesson.lessonKey,
    );
    return this.store(retainLesson(lesson, resolved, atPeriod), lessonRetained);
  }

  /**
   * Record that a later lesson has replaced this one, and leave this one readable.
   *
   * The successor is resolved by key in this tenant before the move, so a correction cannot point across a
   * tenant boundary or at a conclusion nobody wrote. An empty key is deliberately not looked up: the aggregate
   * refuses that with an error naming what a supersession requires, which is more use to the caller than a 404
   * for a lesson called nothing.
   */
  async supersede(tenantId: TenantId, id: Uuid, supersedingLessonKey: string): Promise<Lesson> {
    await this.requireSuccessor(tenantId, supersedingLessonKey);
    return this.transition(tenantId, id, supersedeLesson, lessonSuperseded, supersedingLessonKey);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One lesson, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<Lesson> {
    return this.require(tenantId, id);
  }

  /**
   * One lesson by the key everything else cites it under, or a 404.
   *
   * The key is normalized before the lookup and the refusal names the normalized form, so a caller who typed a
   * stray capital is told which key was actually searched for rather than the one they sent.
   */
  async getByKey(tenantId: TenantId, lessonKey: string): Promise<Lesson> {
    const wanted = normalizeKey(lessonKey);
    const lesson = await this.repository.findByKey(tenantId, wanted);
    if (!lesson) {
      throw new LessonNotFoundError(wanted);
    }
    return lesson;
  }

  /** Everything one particular thing taught the institution — a cycle, an incident, an adopted change. */
  async listByOrigin(
    tenantId: TenantId,
    origin: LessonOrigin,
    originRef: string,
  ): Promise<readonly Lesson[]> {
    return this.repository.listByOrigin(tenantId, origin, originRef);
  }

  /** Institutional memory as this contract can report it: the lessons that actually reached the graph. */
  async listRetained(tenantId: TenantId, organizationId: Uuid): Promise<readonly Lesson[]> {
    return this.repository.listRetained(tenantId, organizationId);
  }

  /** Every lesson in the tenant, provisional and superseded ones included. */
  async list(tenantId: TenantId): Promise<readonly Lesson[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The lesson under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<Lesson> {
    const lesson = await this.repository.findById(tenantId, id);
    if (!lesson) {
      throw new LessonNotFoundError(id);
    }
    return lesson;
  }

  /** The institution this lesson hangs off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * No other lesson already answers to this key.
   *
   * Tenant-wide, and superseded lessons count. The key of a conclusion the institution has since revised is
   * exactly the key a reader following a two-year-old citation arrives at, and it has to still be the one that
   * says what was believed then.
   */
  private async requireKeyFree(tenantId: TenantId, lessonKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, lessonKey)) {
      throw new DuplicateLessonKeyError(lessonKey);
    }
  }

  /** The lesson a supersession names, when it names one at all. */
  private async requireSuccessor(tenantId: TenantId, supersedingLessonKey: string): Promise<void> {
    const successor = normalizeKey(supersedingLessonKey);
    if (successor.length === 0) return;
    if (!(await this.repository.findByKey(tenantId, successor))) {
      throw new LessonNotFoundError(successor);
    }
  }

  /** An actor, when one is named. `null` records a lesson drawn by an automated review step. */
  private async requireActor(
    tenantId: TenantId,
    personId: Uuid | null,
    role: string,
  ): Promise<void> {
    if (personId === null) return;
    await this.requirePerson(tenantId, personId, role);
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForEvolutionError(personId, role);
    }
  }

  /** Store an already-transitioned lesson and announce it. */
  private async store(next: Lesson, announce: (lesson: Lesson) => DomainEvent): Promise<Lesson> {
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  /** Load, run a guarded pure transition, store, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (lesson: Lesson, ...args: TArgs) => Lesson,
    announce: (lesson: Lesson) => DomainEvent,
    ...args: TArgs
  ): Promise<Lesson> {
    return this.store(move(await this.require(tenantId, id), ...args), announce);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
