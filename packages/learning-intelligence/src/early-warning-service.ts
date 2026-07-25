import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  acknowledgeEarlyWarning,
  dismissEarlyWarning,
  type EarlyWarning,
  raiseEarlyWarning,
  type RaiseEarlyWarningParams,
  resolveEarlyWarning,
} from "./early-warning";
import { earlyWarningRaised, earlyWarningResolved } from "./learning-intelligence-events";
import {
  EarlyWarningNotFoundError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import type { EarlyWarningRepository, OrganizationDirectory, StudentDirectory } from "./ports";

export interface EarlyWarningServiceDeps {
  readonly repository: EarlyWarningRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export type RaiseEarlyWarningInput = Omit<RaiseEarlyWarningParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for early warnings. Raises a transparent, rule-based flag for a validated
 * Student in a validated Organization — but never a duplicate: if an open warning already exists
 * for the same rule it is returned unchanged, so a rule that keeps tripping does not spam the feed.
 * Drives raised → acknowledged → resolved | dismissed. Publishes {@link earlyWarningRaised} and
 * {@link earlyWarningResolved}.
 */
export class EarlyWarningService {
  private readonly repository: EarlyWarningRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EarlyWarningServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async raise(input: RaiseEarlyWarningInput): Promise<EarlyWarning> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForInsightError(input.studentId);
    }
    const open = await this.repository.findOpenByStudentAndRule(
      input.tenantId,
      input.studentId,
      input.ruleId,
    );
    if (open) {
      return open;
    }
    const warning = raiseEarlyWarning(input);
    await this.repository.save(warning);
    await this.emit(earlyWarningRaised(warning));
    return warning;
  }

  async acknowledge(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<EarlyWarning> {
    return this.mutate(tenantId, id, (w) => acknowledgeEarlyWarning(w, actor, note));
  }

  async resolve(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<EarlyWarning> {
    const resolved = await this.mutate(tenantId, id, (w) => resolveEarlyWarning(w, actor, note));
    await this.emit(earlyWarningResolved(resolved));
    return resolved;
  }

  async dismiss(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<EarlyWarning> {
    return this.mutate(tenantId, id, (w) => dismissEarlyWarning(w, actor, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EarlyWarning> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<EarlyWarning[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EarlyWarning[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (warning: EarlyWarning) => EarlyWarning,
  ): Promise<EarlyWarning> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EarlyWarning> {
    const warning = await this.repository.findById(tenantId, id);
    if (!warning) {
      throw new EarlyWarningNotFoundError(id);
    }
    return warning;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
