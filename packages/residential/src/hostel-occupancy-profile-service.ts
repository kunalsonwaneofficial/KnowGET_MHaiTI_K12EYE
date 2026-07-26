import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { HostelNotFoundError, HostelOccupancyProfileNotFoundError } from "./errors";
import {
  createHostelOccupancyProfile,
  type HostelOccupancyProfile,
  profileMemberView,
  refreshHostelOccupancyProfile,
} from "./hostel-occupancy-profile";
import {
  computeHostelOccupancy,
  computeRoomOccupancy,
  summarizeResidenceOccupancy,
} from "./occupancy";
import type {
  BedAllocationRepository,
  HostelOccupancyProfileRepository,
  HostelRepository,
  RoomRepository,
} from "./ports";
import { occupancyRefreshed } from "./residential-events";
import type { ResidenceOccupancySummary, RoomOccupancyMemberView } from "./residential-view";

/** Rooms in these statuses are part of the operating stock counted for occupancy. */
const IN_SERVICE_ROOM_STATUSES = new Set(["available", "under_maintenance"]);

export interface HostelOccupancyProfileServiceDeps {
  readonly repository: HostelOccupancyProfileRepository;
  readonly hostels: HostelRepository;
  readonly rooms: RoomRepository;
  readonly allocations: BedAllocationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for hostel occupancy profiles — the descriptive read model. `refresh` reconciles a
 * hostel's in-service rooms and their active allocations through the pure occupancy engine and creates or
 * version-bumps the one profile per hostel; `summarize` rolls all of a tenant's profiles into the
 * institution occupancy picture. It is always derived, never posted to directly. Publishes the refresh
 * event.
 */
export class HostelOccupancyProfileService {
  private readonly repository: HostelOccupancyProfileRepository;
  private readonly hostels: HostelRepository;
  private readonly rooms: RoomRepository;
  private readonly allocations: BedAllocationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HostelOccupancyProfileServiceDeps) {
    this.repository = deps.repository;
    this.hostels = deps.hostels;
    this.rooms = deps.rooms;
    this.allocations = deps.allocations;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, hostelId: Uuid): Promise<HostelOccupancyProfile> {
    const hostel = await this.hostels.findById(tenantId, hostelId);
    if (!hostel) {
      throw new HostelNotFoundError(hostelId);
    }
    const rooms = (await this.rooms.listByHostel(tenantId, hostelId)).filter((r) =>
      IN_SERVICE_ROOM_STATUSES.has(r.status),
    );
    const members: RoomOccupancyMemberView[] = [];
    for (const room of rooms) {
      const occupants = (await this.allocations.listActiveByRoom(tenantId, room.id)).length;
      const occ = computeRoomOccupancy(room.beds.length, occupants);
      members.push({
        bedCount: occ.bedCount,
        occupantCount: occ.occupantCount,
        overCapacity: occ.overCapacity,
      });
    }
    const occupancy = computeHostelOccupancy(members);
    const existing = await this.repository.findByHostel(tenantId, hostelId);
    const profile = existing
      ? refreshHostelOccupancyProfile(existing, hostel.code, occupancy)
      : createHostelOccupancyProfile({
          tenantId,
          organizationId: hostel.organizationId,
          hostelId,
          hostelCode: hostel.code,
          occupancy,
        });
    await this.repository.save(profile);
    await this.emit(occupancyRefreshed(profile));
    return profile;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<HostelOccupancyProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new HostelOccupancyProfileNotFoundError(id);
    }
    return profile;
  }

  async getForHostel(tenantId: TenantId, hostelId: Uuid): Promise<HostelOccupancyProfile | null> {
    return this.repository.findByHostel(tenantId, hostelId);
  }

  async list(tenantId: TenantId): Promise<HostelOccupancyProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  async summarize(tenantId: TenantId): Promise<ResidenceOccupancySummary> {
    const profiles = await this.repository.listByTenant(tenantId);
    return summarizeResidenceOccupancy(profiles.map(profileMemberView));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
