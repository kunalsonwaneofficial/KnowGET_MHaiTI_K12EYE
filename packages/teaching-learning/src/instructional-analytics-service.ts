import type { TenantId, Uuid } from "@knowget/types";
import { computeInstructionalIndicators } from "./instructional-intelligence";
import type { InstructionalIndicators } from "./instructional-view";
import type {
  AssignmentRepository,
  ClassroomSessionRepository,
  LessonPlanRepository,
  UnitPlanRepository,
} from "./ports";

export interface InstructionalAnalyticsServiceDeps {
  readonly unitPlans: UnitPlanRepository;
  readonly lessonPlans: LessonPlanRepository;
  readonly sessions: ClassroomSessionRepository;
  readonly assignments: AssignmentRepository;
}

/**
 * Orchestrates the pure instructional-intelligence engine over the persisted aggregates — the
 * seam where unit plans, lesson plans, classroom sessions and assignments meet the indicator
 * engine. The aggregates structurally satisfy the engine's view interfaces, so no mapping is
 * required. Read-only, descriptive analytics; it computes nothing predictive and mutates
 * nothing.
 */
export class InstructionalAnalyticsService {
  private readonly unitPlans: UnitPlanRepository;
  private readonly lessonPlans: LessonPlanRepository;
  private readonly sessions: ClassroomSessionRepository;
  private readonly assignments: AssignmentRepository;

  constructor(deps: InstructionalAnalyticsServiceDeps) {
    this.unitPlans = deps.unitPlans;
    this.lessonPlans = deps.lessonPlans;
    this.sessions = deps.sessions;
    this.assignments = deps.assignments;
  }

  /** Instructional indicators for a subject — the fullest scope (all four aggregate kinds). */
  async forSubject(tenantId: TenantId, subjectId: Uuid): Promise<InstructionalIndicators> {
    const [unitPlans, lessonPlans, sessions, assignments] = await Promise.all([
      this.unitPlans.listBySubject(tenantId, subjectId),
      this.lessonPlans.listBySubject(tenantId, subjectId),
      this.sessions.listBySubject(tenantId, subjectId),
      this.assignments.listBySubject(tenantId, subjectId),
    ]);
    return computeInstructionalIndicators({ unitPlans, lessonPlans, sessions, assignments });
  }

  /**
   * Instructional indicators for a section — delivery and assignments (unit and lesson plans
   * are subject-scoped, so section analytics covers what was actually run in the section).
   */
  async forSection(tenantId: TenantId, sectionId: Uuid): Promise<InstructionalIndicators> {
    const [sessions, assignments] = await Promise.all([
      this.sessions.listBySection(tenantId, sectionId),
      this.assignments.listBySection(tenantId, sectionId),
    ]);
    return computeInstructionalIndicators({ sessions, assignments });
  }

  /** Instructional indicators for a whole organization. */
  async forOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<InstructionalIndicators> {
    const [unitPlans, lessonPlans, sessions, assignments] = await Promise.all([
      this.unitPlans.listByOrganization(tenantId, organizationId),
      this.lessonPlans.listByOrganization(tenantId, organizationId),
      this.sessions.listByOrganization(tenantId, organizationId),
      this.assignments.listByOrganization(tenantId, organizationId),
    ]);
    return computeInstructionalIndicators({ unitPlans, lessonPlans, sessions, assignments });
  }
}
