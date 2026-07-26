import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AccessZone,
  type CreateAccessZoneParams,
  createAccessZone,
  decommissionZone,
  liftZoneLockdown,
  lockDownZone,
  renameZone,
  setZoneCapacity,
  setZoneSecurityLevel,
} from "./access-zone";
import type { SecurityLevel } from "./campus-security-value";
import {
  zoneCapacitySet,
  zoneCreated,
  zoneDecommissioned,
  zoneLockdownLifted,
  zoneLockedDown,
  zoneRenamed,
  zoneSecurityLevelSet,
} from "./campus-security-events";
import {
  AccessZoneNotFoundError,
  DuplicateZoneCodeError,
  OrganizationNotFoundForSecurityError,
} from "./errors";
import type { AccessZoneRepository, OrganizationDirectory } from "./ports";

export interface AccessZoneServiceDeps {
  readonly repository: AccessZoneRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for access zones — the controlled-area master. Creates a zone (validating the
 * organization and a unique code), edits its name/security-level/capacity, and drives the
 * `active ↔ locked_down` / `→ decommissioned` lifecycle, publishing the zone events.
 */
export class AccessZoneService {
  private readonly repository: AccessZoneRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AccessZoneServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAccessZoneParams): Promise<AccessZone> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSecurityError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateZoneCodeError(input.code.trim());
    }
    const zone = createAccessZone(input);
    await this.repository.save(zone);
    await this.emit(zoneCreated(zone));
    return zone;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AccessZone> {
    const updated = renameZone(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(zoneRenamed(updated));
    return updated;
  }

  async setSecurityLevel(
    tenantId: TenantId,
    id: Uuid,
    securityLevel: SecurityLevel,
  ): Promise<AccessZone> {
    const updated = setZoneSecurityLevel(await this.require(tenantId, id), securityLevel);
    await this.repository.save(updated);
    await this.emit(zoneSecurityLevelSet(updated));
    return updated;
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number): Promise<AccessZone> {
    const updated = setZoneCapacity(await this.require(tenantId, id), capacity);
    await this.repository.save(updated);
    await this.emit(zoneCapacitySet(updated));
    return updated;
  }

  async lockDown(tenantId: TenantId, id: Uuid): Promise<AccessZone> {
    const updated = lockDownZone(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(zoneLockedDown(updated));
    return updated;
  }

  async liftLockdown(tenantId: TenantId, id: Uuid): Promise<AccessZone> {
    const updated = liftZoneLockdown(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(zoneLockdownLifted(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<AccessZone> {
    const updated = decommissionZone(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(zoneDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AccessZone> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<AccessZone> {
    const zone = await this.repository.findByCode(tenantId, code);
    if (!zone) {
      throw new AccessZoneNotFoundError(code);
    }
    return zone;
  }

  async list(tenantId: TenantId): Promise<AccessZone[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessZone[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AccessZone> {
    const zone = await this.repository.findById(tenantId, id);
    if (!zone) {
      throw new AccessZoneNotFoundError(id);
    }
    return zone;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
