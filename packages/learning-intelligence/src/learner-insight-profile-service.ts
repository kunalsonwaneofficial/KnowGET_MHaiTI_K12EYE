import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  createLearnerInsightProfile,
  type LearnerInsightProfile,
  refreshLearnerInsight,
} from "./learner-insight-profile";
import { profileRefreshed } from "./learning-intelligence-events";
import { synthesizeLearnerInsight } from "./learning-intelligence";
import {
  LearnerInsightProfileNotFoundError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import type {
  LearnerInsightProfileRepository,
  LearningSignalRepository,
  OrganizationDirectory,
  StudentDirectory,
} from "./ports";

export interface LearnerInsightProfileServiceDeps {
  readonly repository: LearnerInsightProfileRepository;
  readonly signals: LearningSignalRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for learner insight profiles. Ensures a validated Student has exactly one
 * profile, and **refreshes** it by running the pure synthesis engine over the learner's captured
 * signals — the seam where the signal feed meets the intelligence engine. The aggregates
 * structurally satisfy the engine's signal view, so no mapping is required. Publishes
 * {@link profileRefreshed}. The synthesis is descriptive and explainable; prediction is a non-goal.
 */
export class LearnerInsightProfileService {
  private readonly repository: LearnerInsightProfileRepository;
  private readonly signals: LearningSignalRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearnerInsightProfileServiceDeps) {
    this.repository = deps.repository;
    this.signals = deps.signals;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  /** Get the student's insight profile, creating an empty one (insufficient data) if none exists. */
  async ensure(
    tenantId: TenantId,
    organizationId: Uuid,
    studentId: Uuid,
  ): Promise<LearnerInsightProfile> {
    const existing = await this.repository.findByStudent(tenantId, studentId);
    if (existing) {
      return existing;
    }
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForInsightError(organizationId);
    }
    if (!(await this.students.exists(tenantId, studentId))) {
      throw new StudentNotFoundForInsightError(studentId);
    }
    const profile = createLearnerInsightProfile({ tenantId, organizationId, studentId });
    await this.repository.save(profile);
    return profile;
  }

  /** Re-synthesize a profile from the learner's current signals (by profile id). */
  async refresh(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile> {
    const profile = await this.require(tenantId, id);
    return this.synthesize(profile);
  }

  /**
   * Ensure the student's profile exists, then re-synthesize it from their current signals — the
   * convenience path for "recompute this learner's intelligence now".
   */
  async refreshForStudent(
    tenantId: TenantId,
    organizationId: Uuid,
    studentId: Uuid,
  ): Promise<LearnerInsightProfile> {
    const profile = await this.ensure(tenantId, organizationId, studentId);
    return this.synthesize(profile);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<LearnerInsightProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async synthesize(profile: LearnerInsightProfile): Promise<LearnerInsightProfile> {
    const signals = await this.signals.listByStudent(profile.tenantId, profile.studentId);
    const refreshed = refreshLearnerInsight(profile, synthesizeLearnerInsight(signals));
    await this.repository.save(refreshed);
    await this.emit(profileRefreshed(refreshed));
    return refreshed;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new LearnerInsightProfileNotFoundError(id);
    }
    return profile;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
