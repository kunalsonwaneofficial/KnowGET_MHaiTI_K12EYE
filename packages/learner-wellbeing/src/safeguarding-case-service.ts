import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  PersonNotFoundForWellbeingError,
  SafeguardingCaseNotFoundError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import { safeguardingCaseEscalated, safeguardingCaseOpened } from "./learner-wellbeing-events";
import type { PersonDirectory, SafeguardingCaseRepository, StudentDirectory } from "./ports";
import type {
  ExternalAgencyInvolvement,
  SafeguardingEscalation,
  SafeguardingIncidentReport,
  SafeguardingRiskLevel,
} from "./safeguarding";
import {
  beginInvestigation,
  classifyRisk,
  coordinateExternalAgency,
  type CoordinateExternalAgencyInput,
  escalateSafeguardingCase,
  type EscalateInput,
  fileIncidentReport,
  type FileIncidentReportInput,
  openSafeguardingCase,
  resolveSafeguardingCase,
  type SafeguardingCase,
} from "./safeguarding-case";

export interface SafeguardingCaseServiceDeps {
  readonly repository: SafeguardingCaseRepository;
  readonly students: StudentDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface OpenSafeguardingCaseInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly concern: string;
  readonly category: string;
  readonly reportedBy: Uuid;
  readonly riskLevel?: SafeguardingRiskLevel;
}

/**
 * Application service for safeguarding (child-protection) cases. Opens cases against a
 * validated Student (organization derived) and reporter Person, drives the
 * investigation-and-escalation workflow, coordinates external agencies and tracks
 * resolution. Safeguarding is the most restricted surface in the platform: at the
 * transport boundary this service sits behind a dedicated `safeguarding:*` scope.
 * Publishes {@link safeguardingCaseOpened} and {@link safeguardingCaseEscalated} —
 * routing and risk metadata only, never the concern or report content.
 */
export class SafeguardingCaseService {
  private readonly repository: SafeguardingCaseRepository;
  private readonly students: StudentDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SafeguardingCaseServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async open(input: OpenSafeguardingCaseInput): Promise<SafeguardingCase> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertPersonExists(input.tenantId, input.reportedBy);
    const kase = openSafeguardingCase({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
      concern: input.concern,
      category: input.category,
      reportedBy: input.reportedBy,
      ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
    });
    await this.repository.save(kase);
    await this.emit(safeguardingCaseOpened(kase));
    return kase;
  }

  async classifyRisk(
    tenantId: TenantId,
    id: Uuid,
    riskLevel: SafeguardingRiskLevel,
  ): Promise<SafeguardingCase> {
    return this.mutate(tenantId, id, (k) => classifyRisk(k, riskLevel));
  }

  async beginInvestigation(tenantId: TenantId, id: Uuid): Promise<SafeguardingCase> {
    return this.mutate(tenantId, id, (k) => beginInvestigation(k));
  }

  async fileIncidentReport(
    tenantId: TenantId,
    id: Uuid,
    input: FileIncidentReportInput,
  ): Promise<{ kase: SafeguardingCase; report: SafeguardingIncidentReport }> {
    await this.assertPersonExists(tenantId, input.reportedBy);
    const { kase, report } = fileIncidentReport(await this.require(tenantId, id), input);
    await this.repository.save(kase);
    return { kase, report };
  }

  async escalate(
    tenantId: TenantId,
    id: Uuid,
    input: EscalateInput,
  ): Promise<{ kase: SafeguardingCase; escalation: SafeguardingEscalation }> {
    await this.assertPersonExists(tenantId, input.escalatedBy);
    const { kase, escalation } = escalateSafeguardingCase(await this.require(tenantId, id), input);
    await this.repository.save(kase);
    await this.emit(safeguardingCaseEscalated(kase, escalation.escalatedTo));
    return { kase, escalation };
  }

  async coordinateExternalAgency(
    tenantId: TenantId,
    id: Uuid,
    input: CoordinateExternalAgencyInput,
  ): Promise<{ kase: SafeguardingCase; involvement: ExternalAgencyInvolvement }> {
    const { kase, involvement } = coordinateExternalAgency(await this.require(tenantId, id), input);
    await this.repository.save(kase);
    return { kase, involvement };
  }

  async resolve(tenantId: TenantId, id: Uuid, resolution: string): Promise<SafeguardingCase> {
    return this.mutate(tenantId, id, (k) => resolveSafeguardingCase(k, resolution));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<SafeguardingCase> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<SafeguardingCase[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<SafeguardingCase[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SafeguardingCase[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (kase: SafeguardingCase) => SafeguardingCase,
  ): Promise<SafeguardingCase> {
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

  private async require(tenantId: TenantId, id: Uuid): Promise<SafeguardingCase> {
    const kase = await this.repository.findById(tenantId, id);
    if (!kase) {
      throw new SafeguardingCaseNotFoundError(id);
    }
    return kase;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
