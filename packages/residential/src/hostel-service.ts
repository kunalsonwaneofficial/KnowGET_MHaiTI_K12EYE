import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateHostelCodeError,
  HostelNotFoundError,
  OrganizationNotFoundForResidentialError,
  WardenNotActiveError,
  WardenNotFoundError,
} from "./errors";
import {
  assignHostelWarden,
  decommissionHostel,
  type Hostel,
  type RegisterHostelParams,
  registerHostel,
  renameHostel,
  returnHostelFromMaintenance,
  sendHostelToMaintenance,
  unassignHostelWarden,
} from "./hostel";
import type { HostelRepository, OrganizationDirectory, WardenRepository } from "./ports";
import {
  hostelDecommissioned,
  hostelRegistered,
  hostelReturnedFromMaintenance,
  hostelSentToMaintenance,
  hostelWardenAssigned,
} from "./residential-events";
import { isWardenActive } from "./warden";

export interface HostelServiceDeps {
  readonly repository: HostelRepository;
  readonly organizations: OrganizationDirectory;
  readonly wardens: WardenRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for hostels — the residential facility master. Registers a hostel (validating the
 * organization and a unique code), renames it, assigns/clears a supervising warden (validating the warden
 * is active), and drives the `active ↔ under_maintenance` / `→ decommissioned` lifecycle, publishing the
 * hostel events.
 */
export class HostelService {
  private readonly repository: HostelRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly wardens: WardenRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HostelServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.wardens = deps.wardens;
    this.events = deps.events;
  }

  async create(input: RegisterHostelParams): Promise<Hostel> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForResidentialError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateHostelCodeError(input.code.trim());
    }
    const hostel = registerHostel(input);
    await this.repository.save(hostel);
    await this.emit(hostelRegistered(hostel));
    return hostel;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Hostel> {
    return this.mutate(tenantId, id, (h) => renameHostel(h, name));
  }

  async assignWarden(tenantId: TenantId, id: Uuid, wardenId: Uuid): Promise<Hostel> {
    const warden = await this.wardens.findById(tenantId, wardenId);
    if (!warden) {
      throw new WardenNotFoundError(wardenId);
    }
    if (!isWardenActive(warden)) {
      throw new WardenNotActiveError(wardenId);
    }
    const updated = assignHostelWarden(await this.require(tenantId, id), wardenId);
    await this.repository.save(updated);
    await this.emit(hostelWardenAssigned(updated));
    return updated;
  }

  async unassignWarden(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    const updated = unassignHostelWarden(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(hostelWardenAssigned(updated));
    return updated;
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    const updated = sendHostelToMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(hostelSentToMaintenance(updated));
    return updated;
  }

  async returnFromMaintenance(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    const updated = returnHostelFromMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(hostelReturnedFromMaintenance(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    const updated = decommissionHostel(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(hostelDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Hostel> {
    const hostel = await this.repository.findByCode(tenantId, code);
    if (!hostel) {
      throw new HostelNotFoundError(code);
    }
    return hostel;
  }

  async list(tenantId: TenantId): Promise<Hostel[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (hostel: Hostel) => Hostel,
  ): Promise<Hostel> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Hostel> {
    const hostel = await this.repository.findById(tenantId, id);
    if (!hostel) {
      throw new HostelNotFoundError(id);
    }
    return hostel;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
