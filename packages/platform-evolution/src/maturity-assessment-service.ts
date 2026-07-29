import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateAssessmentKeyError,
  MaturityAssessmentNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import { areaAssessed, assessmentOpened, assessmentPublished } from "./evolution-events";
import { normalizeKey } from "./evolution-value";
import {
  type AreaReadingParams,
  type MaturityAssessment,
  type OpenAssessmentParams,
  openAssessment,
  publishAssessment,
  recordAreaReading,
} from "./maturity-assessment";
import type { MaturityAssessmentRepository, OrganizationDirectory, PersonDirectory } from "./ports";

/**
 * Application service for maturity assessments — what an institution says about itself, once a period.
 *
 * Almost all of the judgement lives in the aggregate and the engine beneath it, and that is deliberate: an
 * unknown area, a repeated reading, an unweighted area, a score off the scale and a coverage floor below which
 * nothing publishes are all decidable from the assessment in hand, so none of them are re-argued here. What this
 * service adds is the two rules that need the store and one that needs the directory.
 *
 * **The key is free tenant-wide, published assessments included.** An assessment key is what a board paper, a
 * trend line and next year's comparison all cite, so two assessments cannot answer to one. Published ones count
 * hardest of all: the whole use of a maturity index is the series, and a key silently pointing at a different
 * year's figure turns a trend into a coincidence.
 *
 * **There is no period uniqueness rule, and that is a decision rather than an omission.** An institution may
 * legitimately run more than one assessment for a period — a self-assessment and an external one, a whole-school
 * reading and a phase-level reading — and refusing the second would push the honest ones outside the platform.
 * What the platform guarantees instead is that each carries its own key and its own weighting, so a reader can
 * always see which reading they are looking at. {@link MaturityAssessmentRepository} has no `findByPeriod` for
 * the same reason.
 *
 * Nothing here computes a score. {@link recordAreaReading} re-runs the engine over every stored reading each
 * time, so the index, level and coverage on a stored assessment are always the engine's answer to the readings
 * as they now stand, never a figure this service nudged.
 */
export interface MaturityAssessmentServiceDeps {
  readonly repository: MaturityAssessmentRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class MaturityAssessmentService {
  private readonly repository: MaturityAssessmentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MaturityAssessmentServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Opening ---------------------------------------------------------------------

  /** Open an assessment for a period, on a weighting that says what this institution thinks matters. */
  async open(params: OpenAssessmentParams): Promise<MaturityAssessment> {
    const assessment = openAssessment(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, assessment.assessmentKey);
    await this.requirePerson(params.tenantId, params.openedBy, "person opening the assessment");
    await this.repository.save(assessment);
    await this.emit(assessmentOpened(assessment));
    return assessment;
  }

  // --- Readings --------------------------------------------------------------------

  /**
   * Record what one capability area scored, and how much evidence stood behind it.
   *
   * The announcement is built from the reading the aggregate actually stored rather than from the arguments
   * that came in, because the area name is canonicalized on the way through: an event carrying the caller's
   * spelling would be the one thing downstream reads, and it would not match the row.
   *
   * A thin evidence base is stored rather than refused — an area assessed on one document is a finding about
   * the institution, and refusing it would leave the same area looking simply unassessed.
   */
  async assess(
    tenantId: TenantId,
    id: Uuid,
    reading: AreaReadingParams,
  ): Promise<MaturityAssessment> {
    const assessment = await this.require(tenantId, id);
    const next = recordAreaReading(assessment, reading);
    await this.repository.save(next);
    const recorded = next.areas[next.areas.length - 1]!;
    await this.emit(areaAssessed(next, recorded.area, recorded.evidenceCount));
    return next;
  }

  /**
   * Publish the index. From here it is what the institution says about itself, and it stops moving.
   *
   * The coverage floor is the aggregate's, checked against the standing the engine had already computed — so
   * the number a caller was shown before publishing is the number publication was decided on. There is no
   * publish-with-a-warning path, because the warning does not travel into the documents the index does.
   */
  async publish(tenantId: TenantId, id: Uuid, actor: Uuid): Promise<MaturityAssessment> {
    await this.requirePerson(tenantId, actor, "person publishing the assessment");
    return this.transition(tenantId, id, publishAssessment, assessmentPublished, actor);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One assessment, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<MaturityAssessment> {
    return this.require(tenantId, id);
  }

  /** One assessment by key, or a 404 naming the normalized form that was actually searched for. */
  async getByKey(tenantId: TenantId, assessmentKey: string): Promise<MaturityAssessment> {
    const wanted = normalizeKey(assessmentKey);
    const assessment = await this.repository.findByKey(tenantId, wanted);
    if (!assessment) {
      throw new MaturityAssessmentNotFoundError(wanted);
    }
    return assessment;
  }

  /** The published series in period order — the trend, and the only honest way to read one figure. */
  async listPublished(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly MaturityAssessment[]> {
    return this.repository.listPublished(tenantId, organizationId);
  }

  /** Every assessment in the tenant, drafts included. */
  async list(tenantId: TenantId): Promise<readonly MaturityAssessment[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The assessment under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<MaturityAssessment> {
    const assessment = await this.repository.findById(tenantId, id);
    if (!assessment) {
      throw new MaturityAssessmentNotFoundError(id);
    }
    return assessment;
  }

  /** The institution being assessed, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /** No other assessment already answers to this key. Tenant-wide, published ones included. */
  private async requireKeyFree(tenantId: TenantId, assessmentKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, assessmentKey)) {
      throw new DuplicateAssessmentKeyError(assessmentKey);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForEvolutionError(personId, role);
    }
  }

  /** Store an already-transitioned assessment and announce it. */
  private async record(
    next: MaturityAssessment,
    announce: (assessment: MaturityAssessment) => DomainEvent,
  ): Promise<MaturityAssessment> {
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  /** Load, run a guarded pure transition, store, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (assessment: MaturityAssessment, ...args: TArgs) => MaturityAssessment,
    announce: (assessment: MaturityAssessment) => DomainEvent,
    ...args: TArgs
  ): Promise<MaturityAssessment> {
    return this.record(move(await this.require(tenantId, id), ...args), announce);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
