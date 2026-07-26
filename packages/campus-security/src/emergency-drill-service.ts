import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  cancelDrill,
  completeDrill,
  type EmergencyDrill,
  recordDrillMuster,
  type ScheduleDrillParams,
  scheduleDrill,
  setDrillExpected,
  startDrill,
} from "./emergency-drill";
import type { MusterStatus } from "./campus-security-view";
import {
  drillCancelled,
  drillCompleted,
  drillExpectedSet,
  drillMusterRecorded,
  drillScheduled,
  drillStarted,
} from "./campus-security-events";
import {
  AccessZoneNotFoundError,
  DuplicateDrillCodeError,
  EmergencyDrillNotFoundError,
  EmployeeNotFoundForSecurityError,
  OrganizationNotFoundForSecurityError,
} from "./errors";
import { computeMusterStatus } from "./presence";
import type {
  AccessZoneRepository,
  EmergencyDrillRepository,
  EmployeeDirectory,
  OrganizationDirectory,
} from "./ports";

export interface EmergencyDrillServiceDeps {
  readonly repository: EmergencyDrillRepository;
  readonly organizations: OrganizationDirectory;
  readonly zones: AccessZoneRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for emergency drills. Schedules a drill (validating the organization, an optional zone
 * that belongs to it, and an optional Employee conductor, with a code unique per tenant), sets the expected
 * roster, starts it, records the muster headcount, and completes or cancels it, publishing the drill events.
 * The drill's muster status — the safety-critical unaccounted-for count — is derived by the pure engine.
 */
export class EmergencyDrillService {
  private readonly repository: EmergencyDrillRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly zones: AccessZoneRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EmergencyDrillServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.zones = deps.zones;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async schedule(input: ScheduleDrillParams): Promise<EmergencyDrill> {
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
      input.conductedById &&
      !(await this.employees.exists(input.tenantId, input.conductedById))
    ) {
      throw new EmployeeNotFoundForSecurityError(input.conductedById);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateDrillCodeError(input.code.trim());
    }
    const drill = scheduleDrill(input);
    await this.repository.save(drill);
    await this.emit(drillScheduled(drill));
    return drill;
  }

  async setExpected(tenantId: TenantId, id: Uuid, expectedCount: number): Promise<EmergencyDrill> {
    const updated = setDrillExpected(await this.require(tenantId, id), expectedCount);
    await this.repository.save(updated);
    await this.emit(drillExpectedSet(updated));
    return updated;
  }

  async start(tenantId: TenantId, id: Uuid, startedAt: string): Promise<EmergencyDrill> {
    const updated = startDrill(await this.require(tenantId, id), startedAt);
    await this.repository.save(updated);
    await this.emit(drillStarted(updated));
    return updated;
  }

  async recordMuster(
    tenantId: TenantId,
    id: Uuid,
    accountedCount: number,
  ): Promise<EmergencyDrill> {
    const updated = recordDrillMuster(await this.require(tenantId, id), accountedCount);
    await this.repository.save(updated);
    await this.emit(drillMusterRecorded(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid, completedAt: string): Promise<EmergencyDrill> {
    const updated = completeDrill(await this.require(tenantId, id), completedAt);
    await this.repository.save(updated);
    await this.emit(drillCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<EmergencyDrill> {
    const updated = cancelDrill(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(drillCancelled(updated));
    return updated;
  }

  /** The drill's muster status (unaccounted-for count, completion percent), derived by the pure engine. */
  async musterStatus(tenantId: TenantId, id: Uuid): Promise<MusterStatus> {
    const drill = await this.require(tenantId, id);
    return computeMusterStatus(drill.expectedCount, drill.accountedCount);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EmergencyDrill> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<EmergencyDrill> {
    const drill = await this.repository.findByCode(tenantId, code);
    if (!drill) {
      throw new EmergencyDrillNotFoundError(code);
    }
    return drill;
  }

  async listForZone(tenantId: TenantId, zoneId: Uuid): Promise<EmergencyDrill[]> {
    return this.repository.listByZone(tenantId, zoneId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EmergencyDrill[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EmergencyDrill> {
    const drill = await this.repository.findById(tenantId, id);
    if (!drill) {
      throw new EmergencyDrillNotFoundError(id);
    }
    return drill;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
