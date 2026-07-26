import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateRoomNumberError,
  HostelNotActiveError,
  HostelNotFoundError,
  RoomNotFoundError,
} from "./errors";
import { isHostelActive } from "./hostel";
import type { HostelRepository, RoomRepository } from "./ports";
import {
  roomDecommissioned,
  roomDrafted,
  roomMadeAvailable,
  roomReturnedFromMaintenance,
  roomSentToMaintenance,
} from "./residential-events";
import {
  addBed,
  decommissionRoom,
  type DraftRoomParams,
  draftRoom,
  makeRoomAvailable,
  removeBed,
  type Room,
  returnRoomFromMaintenance,
  sendRoomToMaintenance,
  setRoomFloor,
} from "./room";
import type { BedInput } from "./room-bed";

/** The service create input — the organization is derived from the hostel, not supplied. */
export type CreateRoomInput = Omit<DraftRoomParams, "organizationId">;

export interface RoomServiceDeps {
  readonly repository: RoomRepository;
  readonly hostels: HostelRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for rooms. Drafts a room under an active hostel (deriving the organization from the
 * hostel and enforcing a room number unique within the hostel), edits its beds and floor while draft, and
 * drives the `draft → available ↔ under_maintenance → decommissioned` lifecycle, publishing the room
 * events.
 */
export class RoomService {
  private readonly repository: RoomRepository;
  private readonly hostels: HostelRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RoomServiceDeps) {
    this.repository = deps.repository;
    this.hostels = deps.hostels;
    this.events = deps.events;
  }

  async create(input: CreateRoomInput): Promise<Room> {
    const hostel = await this.hostels.findById(input.tenantId, input.hostelId);
    if (!hostel) {
      throw new HostelNotFoundError(input.hostelId);
    }
    if (!isHostelActive(hostel)) {
      throw new HostelNotActiveError(input.hostelId);
    }
    if (
      await this.repository.findByHostelAndNumber(
        input.tenantId,
        input.hostelId,
        input.roomNumber.trim(),
      )
    ) {
      throw new DuplicateRoomNumberError(input.hostelId, input.roomNumber.trim());
    }
    const room = draftRoom({ ...input, organizationId: hostel.organizationId });
    await this.repository.save(room);
    await this.emit(roomDrafted(room));
    return room;
  }

  async setFloor(tenantId: TenantId, id: Uuid, floor: number | null): Promise<Room> {
    return this.mutate(tenantId, id, (r) => setRoomFloor(r, floor));
  }

  async addBed(tenantId: TenantId, id: Uuid, bed: BedInput): Promise<Room> {
    return this.mutate(tenantId, id, (r) => addBed(r, bed));
  }

  async removeBed(tenantId: TenantId, id: Uuid, key: string): Promise<Room> {
    return this.mutate(tenantId, id, (r) => removeBed(r, key));
  }

  async makeAvailable(tenantId: TenantId, id: Uuid): Promise<Room> {
    const updated = makeRoomAvailable(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(roomMadeAvailable(updated));
    return updated;
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<Room> {
    const updated = sendRoomToMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(roomSentToMaintenance(updated));
    return updated;
  }

  async returnFromMaintenance(tenantId: TenantId, id: Uuid): Promise<Room> {
    const updated = returnRoomFromMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(roomReturnedFromMaintenance(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<Room> {
    const updated = decommissionRoom(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(roomDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Room> {
    return this.require(tenantId, id);
  }

  async listForHostel(tenantId: TenantId, hostelId: Uuid): Promise<Room[]> {
    return this.repository.listByHostel(tenantId, hostelId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Room[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (room: Room) => Room): Promise<Room> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Room> {
    const room = await this.repository.findById(tenantId, id);
    if (!room) {
      throw new RoomNotFoundError(id);
    }
    return room;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
