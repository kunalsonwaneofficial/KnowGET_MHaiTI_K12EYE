import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type BedAllocation,
  type CreateAllocationParams,
  createBedAllocation,
  endAllocation,
} from "./bed-allocation";
import {
  AllocationNotFoundError,
  BedNotFoundError,
  BedOccupiedError,
  RoomNotAvailableError,
  RoomNotFoundError,
  StudentAlreadyResidentError,
  StudentNotFoundForResidentialError,
} from "./errors";
import type { BedAllocationRepository, RoomRepository, StudentDirectory } from "./ports";
import { allocationCreated, allocationEnded } from "./residential-events";
import { isRoomAvailable, roomHasBed } from "./room";

/**
 * The service create input — the organization and hostel are derived from the room, not supplied.
 */
export type CreateAllocationInput = Pick<
  CreateAllocationParams,
  "tenantId" | "roomId" | "bedKey" | "studentId" | "effectiveFrom"
>;

export interface BedAllocationServiceDeps {
  readonly repository: BedAllocationRepository;
  readonly rooms: RoomRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for bed allocations — a student's residency in a bed. It validates the student
 * exists, the room is available, the bed is a bed on that room, and enforces **one active allocation per
 * bed** and **one active allocation per student** (both check-then-act, TD-37). The organization and
 * hostel are derived from the room. Publishes the allocation events.
 */
export class BedAllocationService {
  private readonly repository: BedAllocationRepository;
  private readonly rooms: RoomRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: BedAllocationServiceDeps) {
    this.repository = deps.repository;
    this.rooms = deps.rooms;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateAllocationInput): Promise<BedAllocation> {
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForResidentialError(input.studentId);
    }
    const room = await this.rooms.findById(input.tenantId, input.roomId);
    if (!room) {
      throw new RoomNotFoundError(input.roomId);
    }
    if (!isRoomAvailable(room)) {
      throw new RoomNotAvailableError(input.roomId);
    }
    if (!roomHasBed(room, input.bedKey)) {
      throw new BedNotFoundError(input.bedKey);
    }
    if (await this.repository.findActiveByBed(input.tenantId, input.roomId, input.bedKey)) {
      throw new BedOccupiedError(input.roomId, input.bedKey);
    }
    if (await this.repository.findActiveByStudent(input.tenantId, input.studentId)) {
      throw new StudentAlreadyResidentError(input.studentId);
    }
    const allocation = createBedAllocation({
      ...input,
      organizationId: room.organizationId,
      hostelId: room.hostelId,
    });
    await this.repository.save(allocation);
    await this.emit(allocationCreated(allocation));
    return allocation;
  }

  async end(tenantId: TenantId, id: Uuid, effectiveTo?: string | null): Promise<BedAllocation> {
    const updated = endAllocation(await this.require(tenantId, id), effectiveTo);
    await this.repository.save(updated);
    await this.emit(allocationEnded(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<BedAllocation> {
    return this.require(tenantId, id);
  }

  async getActiveForStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation | null> {
    return this.repository.findActiveByStudent(tenantId, studentId);
  }

  async listActiveForRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]> {
    return this.repository.listActiveByRoom(tenantId, roomId);
  }

  async listActiveForHostel(tenantId: TenantId, hostelId: Uuid): Promise<BedAllocation[]> {
    return this.repository.listActiveByHostel(tenantId, hostelId);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BedAllocation[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<BedAllocation> {
    const allocation = await this.repository.findById(tenantId, id);
    if (!allocation) {
      throw new AllocationNotFoundError(id);
    }
    return allocation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
