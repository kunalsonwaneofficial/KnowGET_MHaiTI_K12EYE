import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { learningOutcomeDefined } from "./academic-structure-events";
import {
  CurriculumFrameworkNotFoundError,
  DuplicateLearningOutcomeError,
  LearningOutcomeNotFoundError,
  SubjectNotFoundError,
} from "./errors";
import {
  activateLearningOutcome,
  archiveLearningOutcome,
  type BloomLevel,
  createLearningOutcome,
  type LearningOutcome,
  setAssessmentAlignment,
  setBloomLevel,
  setCompetencies,
  setCurriculumAlignment,
  setOutcomeStatement,
} from "./learning-outcome";
import type {
  CurriculumFrameworkRepository,
  LearningOutcomeRepository,
  SubjectRepository,
} from "./ports";

export interface LearningOutcomeServiceDeps {
  readonly repository: LearningOutcomeRepository;
  readonly subjects: SubjectRepository;
  readonly curricula: CurriculumFrameworkRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateLearningOutcomeInput {
  readonly tenantId: TenantId;
  readonly subjectId: Uuid;
  readonly code: string;
  readonly statement: string;
  readonly bloomLevel?: BloomLevel | null;
  readonly curriculumFrameworkId?: Uuid | null;
}

/**
 * Application service for learning outcomes. Defines an outcome against a validated
 * Subject, deriving the outcome's organization from that subject, at most one per
 * (subject, code), and manages its statement, Bloom's level, competency mapping, and
 * curriculum and assessment alignment (a validated curriculum framework). Publishes
 * {@link learningOutcomeDefined} on definition; later edits bump the version silently.
 */
export class LearningOutcomeService {
  private readonly repository: LearningOutcomeRepository;
  private readonly subjects: SubjectRepository;
  private readonly curricula: CurriculumFrameworkRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearningOutcomeServiceDeps) {
    this.repository = deps.repository;
    this.subjects = deps.subjects;
    this.curricula = deps.curricula;
    this.events = deps.events;
  }

  async create(input: CreateLearningOutcomeInput): Promise<LearningOutcome> {
    const organizationId = await this.resolveSubjectOrganization(input.tenantId, input.subjectId);
    if (input.curriculumFrameworkId) {
      await this.assertCurriculumExists(input.tenantId, input.curriculumFrameworkId);
    }
    await this.assertNoOutcome(input.tenantId, input.subjectId, input.code);
    const outcome = createLearningOutcome({ ...input, organizationId });
    await this.repository.save(outcome);
    await this.emit(learningOutcomeDefined(outcome));
    return outcome;
  }

  async setStatement(tenantId: TenantId, id: Uuid, statement: string): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => setOutcomeStatement(o, statement));
  }

  async setBloomLevel(
    tenantId: TenantId,
    id: Uuid,
    bloomLevel: BloomLevel | null,
  ): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => setBloomLevel(o, bloomLevel));
  }

  async setCompetencies(
    tenantId: TenantId,
    id: Uuid,
    competencies: readonly string[],
  ): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => setCompetencies(o, competencies));
  }

  async setCurriculumAlignment(
    tenantId: TenantId,
    id: Uuid,
    curriculumFrameworkId: Uuid | null,
  ): Promise<LearningOutcome> {
    if (curriculumFrameworkId !== null) {
      await this.assertCurriculumExists(tenantId, curriculumFrameworkId);
    }
    return this.mutate(tenantId, id, (o) => setCurriculumAlignment(o, curriculumFrameworkId));
  }

  async setAssessmentAlignment(
    tenantId: TenantId,
    id: Uuid,
    methods: readonly string[],
  ): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => setAssessmentAlignment(o, methods));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => archiveLearningOutcome(o));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<LearningOutcome> {
    return this.mutate(tenantId, id, (o) => activateLearningOutcome(o));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearningOutcome> {
    return this.require(tenantId, id);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningOutcome[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningOutcome[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<LearningOutcome[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (outcome: LearningOutcome) => LearningOutcome,
  ): Promise<LearningOutcome> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveSubjectOrganization(tenantId: TenantId, subjectId: Uuid): Promise<Uuid> {
    const subject = await this.subjects.findById(tenantId, subjectId);
    if (!subject) {
      throw new SubjectNotFoundError(subjectId);
    }
    return subject.organizationId;
  }

  private async assertCurriculumExists(
    tenantId: TenantId,
    curriculumFrameworkId: Uuid,
  ): Promise<void> {
    if (!(await this.curricula.findById(tenantId, curriculumFrameworkId))) {
      throw new CurriculumFrameworkNotFoundError(curriculumFrameworkId);
    }
  }

  private async assertNoOutcome(tenantId: TenantId, subjectId: Uuid, code: string): Promise<void> {
    if (await this.repository.findByCode(tenantId, subjectId, code)) {
      throw new DuplicateLearningOutcomeError(subjectId, code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LearningOutcome> {
    const outcome = await this.repository.findById(tenantId, id);
    if (!outcome) {
      throw new LearningOutcomeNotFoundError(id);
    }
    return outcome;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
