import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { IncidentSeverity } from "./campus-security-value";
import {
  incidentAssigned,
  incidentCancelled,
  incidentClosed,
  incidentInvestigationStarted,
  incidentReported,
  incidentResolved,
  incidentSeveritySet,
  incidentTriaged,
} from "./campus-security-events";
import {
  AccessZoneNotFoundError,
  DuplicateIncidentCodeError,
  EmployeeNotFoundForSecurityError,
  OrganizationNotFoundForSecurityError,
  PersonNotFoundForSecurityError,
  SecurityIncidentNotFoundError,
} from "./errors";
import type {
  AccessZoneRepository,
  EmployeeDirectory,
  OrganizationDirectory,
  PersonDirectory,
  SecurityIncidentRepository,
} from "./ports";
import {
  assignIncident,
  cancelIncident,
  closeIncident,
  type ReportIncidentParams,
  reportIncident,
  resolveIncident,
  type SecurityIncident,
  setIncidentSeverity,
  startIncidentInvestigation,
  triageIncident,
} from "./security-incident";

export interface SecurityIncidentServiceDeps {
  readonly repository: SecurityIncidentRepository;
  readonly organizations: OrganizationDirectory;
  readonly zones: AccessZoneRepository;
  readonly persons: PersonDirectory;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for security incidents — the operational security log. Reports an incident (validating
 * the organization, an optional location zone that belongs to it, and an optional reporter Person, with a
 * code unique per tenant), triages it, assigns it to an Employee officer, edits its severity, and drives
 * `reported → triaged → investigating → resolved → closed` (with `cancelled` from any open state, and an
 * assignee required before investigation), publishing the incident events.
 */
export class SecurityIncidentService {
  private readonly repository: SecurityIncidentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly zones: AccessZoneRepository;
  private readonly persons: PersonDirectory;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SecurityIncidentServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.zones = deps.zones;
    this.persons = deps.persons;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async report(input: ReportIncidentParams): Promise<SecurityIncident> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSecurityError(input.organizationId);
    }
    if (input.zoneId) {
      const zone = await this.zones.findById(input.tenantId, input.zoneId);
      if (!zone || zone.organizationId !== input.organizationId) {
        throw new AccessZoneNotFoundError(input.zoneId);
      }
    }
    if (
      input.reportedByPersonId &&
      !(await this.persons.exists(input.tenantId, input.reportedByPersonId))
    ) {
      throw new PersonNotFoundForSecurityError(input.reportedByPersonId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateIncidentCodeError(input.code.trim());
    }
    const incident = reportIncident(input);
    await this.repository.save(incident);
    await this.emit(incidentReported(incident));
    return incident;
  }

  async triage(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    const updated = triageIncident(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(incidentTriaged(updated));
    return updated;
  }

  async assign(tenantId: TenantId, id: Uuid, assigneeId: Uuid): Promise<SecurityIncident> {
    if (!(await this.employees.exists(tenantId, assigneeId))) {
      throw new EmployeeNotFoundForSecurityError(assigneeId);
    }
    const updated = assignIncident(await this.require(tenantId, id), assigneeId);
    await this.repository.save(updated);
    await this.emit(incidentAssigned(updated));
    return updated;
  }

  async setSeverity(
    tenantId: TenantId,
    id: Uuid,
    severity: IncidentSeverity,
  ): Promise<SecurityIncident> {
    const updated = setIncidentSeverity(await this.require(tenantId, id), severity);
    await this.repository.save(updated);
    await this.emit(incidentSeveritySet(updated));
    return updated;
  }

  async startInvestigation(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    const updated = startIncidentInvestigation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(incidentInvestigationStarted(updated));
    return updated;
  }

  async resolve(tenantId: TenantId, id: Uuid, resolvedOn: string): Promise<SecurityIncident> {
    const updated = resolveIncident(await this.require(tenantId, id), resolvedOn);
    await this.repository.save(updated);
    await this.emit(incidentResolved(updated));
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    const updated = closeIncident(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(incidentClosed(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    const updated = cancelIncident(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(incidentCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<SecurityIncident> {
    const incident = await this.repository.findByCode(tenantId, code);
    if (!incident) {
      throw new SecurityIncidentNotFoundError(code);
    }
    return incident;
  }

  async listForZone(tenantId: TenantId, zoneId: Uuid): Promise<SecurityIncident[]> {
    return this.repository.listByZone(tenantId, zoneId);
  }

  async listForAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<SecurityIncident[]> {
    return this.repository.listByAssignee(tenantId, assigneeId);
  }

  async listOpen(tenantId: TenantId): Promise<SecurityIncident[]> {
    return this.repository.listOpen(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SecurityIncident[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<SecurityIncident> {
    const incident = await this.repository.findById(tenantId, id);
    if (!incident) {
      throw new SecurityIncidentNotFoundError(id);
    }
    return incident;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
