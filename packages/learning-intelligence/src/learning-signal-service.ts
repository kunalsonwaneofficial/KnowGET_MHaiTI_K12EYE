import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  captureLearningSignal,
  type CaptureLearningSignalParams,
  type LearningSignal,
} from "./learning-signal";
import { signalCaptured } from "./learning-intelligence-events";
import {
  LearningSignalNotFoundError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import type { LearningSignalRepository, OrganizationDirectory, StudentDirectory } from "./ports";

export interface LearningSignalServiceDeps {
  readonly repository: LearningSignalRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export type CaptureLearningSignalInput = Omit<CaptureLearningSignalParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for learning signals. Captures an immutable, evidence-bearing signal about a
 * validated Student in a validated Organization into the learner's append-only feed — the raw
 * material the synthesis engine reads. Publishes {@link signalCaptured}. Signals are captured, not
 * edited; there is no update path.
 */
export class LearningSignalService {
  private readonly repository: LearningSignalRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearningSignalServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async capture(input: CaptureLearningSignalInput): Promise<LearningSignal> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForInsightError(input.studentId);
    }
    const signal = captureLearningSignal(input);
    await this.repository.save(signal);
    await this.emit(signalCaptured(signal));
    return signal;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearningSignal> {
    const signal = await this.repository.findById(tenantId, id);
    if (!signal) {
      throw new LearningSignalNotFoundError(id);
    }
    return signal;
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
