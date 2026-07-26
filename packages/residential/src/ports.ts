import type { TenantId, Uuid } from "@knowget/types";
import type { BedAllocation } from "./bed-allocation";
import type { Hostel } from "./hostel";
import type { Outpass } from "./outpass";
import type { RollCall } from "./roll-call-session";
import type { Room } from "./room";
import type { Warden } from "./warden";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Hostels, rooms and roll calls attach to it; the residential domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a warden is an Employee. `exists` answers presence;
 * `organizationOf` resolves the employee's organization (or `null` if unknown) so a warden derives its
 * organization from the staff member it links to. The residential domain links to workforce and never
 * depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/**
 * Read model over the student-lifecycle domain (P2-D03): a resident is a Student. `exists` answers
 * presence; `organizationOf` resolves the student's organization so a residential record derives its org
 * from the student it serves. The residential domain links to student-lifecycle and never depends on
 * `@knowget/student-lifecycle` directly.
 */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for hostels. Tenant-scoped (explicit argument + RLS). */
export interface HostelRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Hostel | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Hostel | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]>;
  listByTenant(tenantId: TenantId): Promise<Hostel[]>;
  save(hostel: Hostel): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link HostelRepository} — the default for tests and bootstrap. */
export class InMemoryHostelRepository implements HostelRepository {
  private readonly byId = new Map<string, Hostel>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Hostel | null> {
    const hostel = this.byId.get(id);
    return hostel && hostel.tenantId === tenantId ? hostel : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Hostel | null> {
    return [...this.byId.values()].find((h) => h.tenantId === tenantId && h.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Hostel[]> {
    return [...this.byId.values()].filter(
      (h) => h.tenantId === tenantId && h.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Hostel[]> {
    return [...this.byId.values()].filter((h) => h.tenantId === tenantId);
  }

  async save(hostel: Hostel): Promise<void> {
    this.byId.set(hostel.id, hostel);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const hostel = this.byId.get(id);
    if (hostel && hostel.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for wardens. Tenant-scoped (explicit argument + RLS). */
export interface WardenRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Warden | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]>;
  listByTenant(tenantId: TenantId): Promise<Warden[]>;
  save(warden: Warden): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link WardenRepository} — the default for tests and bootstrap. */
export class InMemoryWardenRepository implements WardenRepository {
  private readonly byId = new Map<string, Warden>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Warden | null> {
    const warden = this.byId.get(id);
    return warden && warden.tenantId === tenantId ? warden : null;
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null> {
    return (
      [...this.byId.values()].find((w) => w.tenantId === tenantId && w.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]> {
    return [...this.byId.values()].filter(
      (w) => w.tenantId === tenantId && w.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Warden[]> {
    return [...this.byId.values()].filter((w) => w.tenantId === tenantId);
  }

  async save(warden: Warden): Promise<void> {
    this.byId.set(warden.id, warden);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const warden = this.byId.get(id);
    if (warden && warden.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for rooms. Tenant-scoped (explicit argument + RLS). */
export interface RoomRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Room | null>;
  findByHostelAndNumber(
    tenantId: TenantId,
    hostelId: Uuid,
    roomNumber: string,
  ): Promise<Room | null>;
  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Room[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Room[]>;
  listByTenant(tenantId: TenantId): Promise<Room[]>;
  save(room: Room): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RoomRepository} — the default for tests and bootstrap. */
export class InMemoryRoomRepository implements RoomRepository {
  private readonly byId = new Map<string, Room>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Room | null> {
    const room = this.byId.get(id);
    return room && room.tenantId === tenantId ? room : null;
  }

  async findByHostelAndNumber(
    tenantId: TenantId,
    hostelId: Uuid,
    roomNumber: string,
  ): Promise<Room | null> {
    return (
      [...this.byId.values()].find(
        (r) => r.tenantId === tenantId && r.hostelId === hostelId && r.roomNumber === roomNumber,
      ) ?? null
    );
  }

  async listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Room[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.hostelId === hostelId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Room[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Room[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(room: Room): Promise<void> {
    this.byId.set(room.id, room);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const room = this.byId.get(id);
    if (room && room.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for bed allocations. Tenant-scoped (explicit argument + RLS). */
export interface BedAllocationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<BedAllocation | null>;
  findActiveByBed(tenantId: TenantId, roomId: Uuid, bedKey: string): Promise<BedAllocation | null>;
  findActiveByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation | null>;
  listActiveByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]>;
  listActiveByHostel(tenantId: TenantId, hostelId: Uuid): Promise<BedAllocation[]>;
  listByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BedAllocation[]>;
  listByTenant(tenantId: TenantId): Promise<BedAllocation[]>;
  save(allocation: BedAllocation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link BedAllocationRepository} — the default for tests and bootstrap. */
export class InMemoryBedAllocationRepository implements BedAllocationRepository {
  private readonly byId = new Map<string, BedAllocation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<BedAllocation | null> {
    const allocation = this.byId.get(id);
    return allocation && allocation.tenantId === tenantId ? allocation : null;
  }

  async findActiveByBed(
    tenantId: TenantId,
    roomId: Uuid,
    bedKey: string,
  ): Promise<BedAllocation | null> {
    return (
      [...this.byId.values()].find(
        (a) =>
          a.tenantId === tenantId &&
          a.roomId === roomId &&
          a.bedKey === bedKey &&
          a.status === "active",
      ) ?? null
    );
  }

  async findActiveByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.tenantId === tenantId && a.studentId === studentId && a.status === "active",
      ) ?? null
    );
  }

  async listActiveByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.roomId === roomId && a.status === "active",
    );
  }

  async listActiveByHostel(tenantId: TenantId, hostelId: Uuid): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.hostelId === hostelId && a.status === "active",
    );
  }

  async listByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId && a.roomId === roomId);
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<BedAllocation[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(allocation: BedAllocation): Promise<void> {
    this.byId.set(allocation.id, allocation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const allocation = this.byId.get(id);
    if (allocation && allocation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for outpasses. Tenant-scoped (explicit argument + RLS). */
export interface OutpassRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Outpass | null>;
  findOpenByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass[]>;
  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]>;
  listOpenByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Outpass[]>;
  listByTenant(tenantId: TenantId): Promise<Outpass[]>;
  save(outpass: Outpass): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

const OPEN_OUTPASS: readonly string[] = ["requested", "approved", "checked_out"];

/** In-memory {@link OutpassRepository} — the default for tests and bootstrap. */
export class InMemoryOutpassRepository implements OutpassRepository {
  private readonly byId = new Map<string, Outpass>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Outpass | null> {
    const outpass = this.byId.get(id);
    return outpass && outpass.tenantId === tenantId ? outpass : null;
  }

  async findOpenByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass | null> {
    return (
      [...this.byId.values()].find(
        (o) =>
          o.tenantId === tenantId && o.studentId === studentId && OPEN_OUTPASS.includes(o.status),
      ) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.studentId === studentId,
    );
  }

  async listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.hostelId === hostelId,
    );
  }

  async listOpenByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.hostelId === hostelId && OPEN_OUTPASS.includes(o.status),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Outpass[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Outpass[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(outpass: Outpass): Promise<void> {
    this.byId.set(outpass.id, outpass);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const outpass = this.byId.get(id);
    if (outpass && outpass.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for roll calls. Tenant-scoped (explicit argument + RLS). */
export interface RollCallRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<RollCall | null>;
  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<RollCall[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<RollCall[]>;
  listByTenant(tenantId: TenantId): Promise<RollCall[]>;
  save(rollCall: RollCall): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RollCallRepository} — the default for tests and bootstrap. */
export class InMemoryRollCallRepository implements RollCallRepository {
  private readonly byId = new Map<string, RollCall>();

  async findById(tenantId: TenantId, id: Uuid): Promise<RollCall | null> {
    const rollCall = this.byId.get(id);
    return rollCall && rollCall.tenantId === tenantId ? rollCall : null;
  }

  async listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<RollCall[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.hostelId === hostelId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<RollCall[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<RollCall[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(rollCall: RollCall): Promise<void> {
    this.byId.set(rollCall.id, rollCall);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const rollCall = this.byId.get(id);
    if (rollCall && rollCall.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
