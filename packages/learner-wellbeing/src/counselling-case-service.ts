import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type {
  CounsellingGoal,
  CounsellingGoalStatus,
  CounsellingPriority,
  CounsellingReferral,
  CounsellingSession,
} from "./counselling";
import {
  addReferral,
  type AddReferralInput,
  assignCounsellor,
  closeCounsellingCase,
  type CounsellingCase,
  openCounsellingCase,
  recordSession,
  type RecordSessionInput,
  setCasePriority,
  setCounsellingGoal,
  updateCounsellingGoalStatus,
} from "./counselling-case";
import {
  CounsellingCaseNotFoundError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import { counsellingCaseClosed, counsellingCaseOpened } from "./learner-wellbeing-events";
import type { CounsellingCaseRepository, PersonDirectory, StudentDirectory } from "./ports";

export interface CounsellingCaseServiceDeps {
  readonly repository: CounsellingCaseRepository;
  readonly students: StudentDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface OpenCounsellingCaseInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly counsellorId: Uuid;
  readonly presentingConcern: string;
  readonly priority?: CounsellingPriority;
}

/**
 * Application service for counselling cases. Opens cases against a validated Student
 * (organization derived) and counsellor Person, and manages the confidential session
 * history, referrals, goals and closure. Counselling data is the most sensitive surface
 * in the platform: at the transport boundary this service sits behind an isolated,
 * enhanced-privacy `counselling:*` permission scope. Publishes
 * {@link counsellingCaseOpened} and {@link counsellingCaseClosed} — routing metadata
 * only, never confidential content.
 */
export class CounsellingCaseService {
  private readonly repository: CounsellingCaseRepository;
  private readonly students: StudentDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CounsellingCaseServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async open(input: OpenCounsellingCaseInput): Promise<CounsellingCase> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertPersonExists(input.tenantId, input.counsellorId);
    const kase = openCounsellingCase({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
      counsellorId: input.counsellorId,
      presentingConcern: input.presentingConcern,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    });
    await this.repository.save(kase);
    await this.emit(counsellingCaseOpened(kase));
    return kase;
  }

  async assignCounsellor(
    tenantId: TenantId,
    id: Uuid,
    counsellorId: Uuid,
  ): Promise<CounsellingCase> {
    await this.assertPersonExists(tenantId, counsellorId);
    return this.mutate(tenantId, id, (k) => assignCounsellor(k, counsellorId));
  }

  async setPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: CounsellingPriority,
  ): Promise<CounsellingCase> {
    return this.mutate(tenantId, id, (k) => setCasePriority(k, priority));
  }

  async recordSession(
    tenantId: TenantId,
    id: Uuid,
    input: RecordSessionInput,
  ): Promise<{ kase: CounsellingCase; session: CounsellingSession }> {
    await this.assertPersonExists(tenantId, input.recordedBy);
    const { kase, session } = recordSession(await this.require(tenantId, id), input);
    await this.repository.save(kase);
    return { kase, session };
  }

  async addReferral(
    tenantId: TenantId,
    id: Uuid,
    input: AddReferralInput,
  ): Promise<{ kase: CounsellingCase; referral: CounsellingReferral }> {
    const { kase, referral } = addReferral(await this.require(tenantId, id), input);
    await this.repository.save(kase);
    return { kase, referral };
  }

  async setGoal(
    tenantId: TenantId,
    id: Uuid,
    description: string,
  ): Promise<{ kase: CounsellingCase; goal: CounsellingGoal }> {
    const { kase, goal } = setCounsellingGoal(await this.require(tenantId, id), description);
    await this.repository.save(kase);
    return { kase, goal };
  }

  async updateGoalStatus(
    tenantId: TenantId,
    id: Uuid,
    goalId: Uuid,
    status: CounsellingGoalStatus,
  ): Promise<CounsellingCase> {
    return this.mutate(tenantId, id, (k) => updateCounsellingGoalStatus(k, goalId, status));
  }

  async close(tenantId: TenantId, id: Uuid, outcome: string): Promise<CounsellingCase> {
    const kase = closeCounsellingCase(await this.require(tenantId, id), outcome);
    await this.repository.save(kase);
    await this.emit(counsellingCaseClosed(kase));
    return kase;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CounsellingCase> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<CounsellingCase[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForCounsellor(tenantId: TenantId, counsellorId: Uuid): Promise<CounsellingCase[]> {
    return this.repository.listByCounsellor(tenantId, counsellorId);
  }

  async list(tenantId: TenantId): Promise<CounsellingCase[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CounsellingCase[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (kase: CounsellingCase) => CounsellingCase,
  ): Promise<CounsellingCase> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveOrganization(tenantId: TenantId, studentId: Uuid): Promise<Uuid> {
    const organizationId = await this.students.organizationOf(tenantId, studentId);
    if (!organizationId) {
      throw new StudentNotFoundForWellbeingError(studentId);
    }
    return organizationId;
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForWellbeingError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CounsellingCase> {
    const kase = await this.repository.findById(tenantId, id);
    if (!kase) {
      throw new CounsellingCaseNotFoundError(id);
    }
    return kase;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
