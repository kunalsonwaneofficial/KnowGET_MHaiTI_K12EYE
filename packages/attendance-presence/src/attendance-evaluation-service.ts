import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  attendancePolicyEvaluated,
  attendanceThresholdReached,
} from "./attendance-presence-events";
import type { AttendanceSummary, PolicyEvaluation } from "./evaluation";
import { breachedPolicies, evaluatePolicies, summarizeAttendance } from "./policy-engine";
import { computePresenceIndicators } from "./presence-intelligence";
import type { PresenceProfile } from "./presence-profile";
import type { PresenceProfileService } from "./presence-profile-service";
import type {
  AttendancePolicyRepository,
  AttendanceRecordRepository,
  LeaveRepository,
  ParticipationRepository,
} from "./ports";

export interface AttendanceEvaluationServiceDeps {
  readonly records: AttendanceRecordRepository;
  readonly leaves: LeaveRepository;
  readonly policies: AttendancePolicyRepository;
  readonly participations: ParticipationRepository;
  readonly profiles: PresenceProfileService;
  readonly events?: Pick<EventBus, "publish">;
}

/** The result of evaluating a participant's attendance against the active policies. */
export interface AttendanceEvaluationResult {
  readonly summary: AttendanceSummary;
  readonly evaluations: readonly PolicyEvaluation[];
  readonly compliant: boolean;
}

/**
 * Orchestrates the pure engines over the persisted aggregates — the seam where attendance
 * records, leave, policies and participation meet the policy-evaluation and
 * presence-intelligence engines. The aggregates structurally satisfy the engines' view
 * interfaces, so no mapping is required. Evaluation reports compliance (downstream domains
 * decide business outcomes); the presence recompute materialises the profile.
 */
export class AttendanceEvaluationService {
  private readonly records: AttendanceRecordRepository;
  private readonly leaves: LeaveRepository;
  private readonly policies: AttendancePolicyRepository;
  private readonly participations: ParticipationRepository;
  private readonly profiles: PresenceProfileService;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AttendanceEvaluationServiceDeps) {
    this.records = deps.records;
    this.leaves = deps.leaves;
    this.policies = deps.policies;
    this.participations = deps.participations;
    this.profiles = deps.profiles;
    this.events = deps.events;
  }

  /**
   * Evaluate a participant's attendance against the organization's active policies: summarise
   * the records (approved leave excusing absences), run the percentage rules, publish
   * {@link attendancePolicyEvaluated}, and publish {@link attendanceThresholdReached} for each
   * breached threshold. Returns the summary and evaluations.
   */
  async evaluate(
    tenantId: TenantId,
    organizationId: Uuid,
    participantId: Uuid,
  ): Promise<AttendanceEvaluationResult> {
    const records = await this.records.listByParticipant(tenantId, participantId);
    const leaves = await this.leaves.listByPerson(tenantId, participantId);
    const policies = await this.policies.listActiveForEvaluation(tenantId, organizationId);
    const summary = summarizeAttendance(records, leaves);
    const evaluations = evaluatePolicies(summary, policies);
    const compliant = evaluations.every((evaluation) => evaluation.compliant);

    await this.emit(
      attendancePolicyEvaluated(tenantId, {
        organizationId,
        participantId,
        attendancePercentage: summary.attendancePercentage,
        policiesEvaluated: evaluations.length,
        compliant,
      }),
    );
    for (const breach of breachedPolicies(evaluations)) {
      await this.emit(
        attendanceThresholdReached(tenantId, {
          organizationId,
          participantId,
          policyId: breach.policyId,
          ruleType: breach.ruleType,
          attendancePercentage: summary.attendancePercentage,
          threshold: breach.threshold ?? 0,
        }),
      );
    }
    return { summary, evaluations, compliant };
  }

  /**
   * Recompute a participant's presence profile from their records, approved leave and
   * participation, ensuring the profile exists and applying the fresh indicator snapshot.
   */
  async recomputePresence(
    tenantId: TenantId,
    organizationId: Uuid,
    participantId: Uuid,
  ): Promise<PresenceProfile> {
    const records = await this.records.listByParticipant(tenantId, participantId);
    const leaves = await this.leaves.listByPerson(tenantId, participantId);
    const participations = await this.participations.listByParticipant(tenantId, participantId);
    const indicators = computePresenceIndicators({ records, leaves, participations });
    await this.profiles.ensure(tenantId, organizationId, participantId);
    return this.profiles.apply(tenantId, participantId, indicators);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
