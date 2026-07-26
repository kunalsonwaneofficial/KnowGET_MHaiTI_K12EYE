import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  OutpassNotFoundError,
  ResidentHasOpenOutpassError,
  StudentNotResidentError,
  WardenNotActiveError,
  WardenNotFoundError,
} from "./errors";
import {
  approveOutpass,
  cancelOutpass,
  checkOutOutpass,
  type Outpass,
  rejectOutpass,
  type RequestOutpassParams,
  requestOutpass,
  returnOutpass,
} from "./outpass";
import type { BedAllocationRepository, OutpassRepository, WardenRepository } from "./ports";
import {
  outpassApproved,
  outpassCancelled,
  outpassCheckedOut,
  outpassRejected,
  outpassRequested,
  outpassReturned,
} from "./residential-events";
import { isWardenActive } from "./warden";

/** The service request input — the organization and hostel are derived from the resident's allocation. */
export type RequestOutpassInput = Pick<
  RequestOutpassParams,
  "tenantId" | "studentId" | "type" | "expectedOutAt" | "expectedInAt" | "reason"
>;

export interface OutpassServiceDeps {
  readonly repository: OutpassRepository;
  readonly allocations: BedAllocationRepository;
  readonly wardens: WardenRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for outpasses. Requests an outpass for a **current resident** (a student with an
 * active bed allocation), deriving the organization and hostel from that allocation and enforcing **one
 * open outpass per resident**; approves it against an active warden; and drives the
 * `approved → checked_out → returned` / `rejected` / `cancelled` lifecycle, publishing the outpass events.
 */
export class OutpassService {
  private readonly repository: OutpassRepository;
  private readonly allocations: BedAllocationRepository;
  private readonly wardens: WardenRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: OutpassServiceDeps) {
    this.repository = deps.repository;
    this.allocations = deps.allocations;
    this.wardens = deps.wardens;
    this.events = deps.events;
  }

  async request(input: RequestOutpassInput): Promise<Outpass> {
    const allocation = await this.allocations.findActiveByStudent(input.tenantId, input.studentId);
    if (!allocation) {
      throw new StudentNotResidentError(input.studentId);
    }
    if (await this.repository.findOpenByStudent(input.tenantId, input.studentId)) {
      throw new ResidentHasOpenOutpassError(input.studentId);
    }
    const outpass = requestOutpass({
      ...input,
      organizationId: allocation.organizationId,
      hostelId: allocation.hostelId,
    });
    await this.repository.save(outpass);
    await this.emit(outpassRequested(outpass));
    return outpass;
  }

  async approve(tenantId: TenantId, id: Uuid, approvedBy: Uuid): Promise<Outpass> {
    const warden = await this.wardens.findById(tenantId, approvedBy);
    if (!warden) {
      throw new WardenNotFoundError(approvedBy);
    }
    if (!isWardenActive(warden)) {
      throw new WardenNotActiveError(approvedBy);
    }
    const updated = approveOutpass(await this.require(tenantId, id), approvedBy);
    await this.repository.save(updated);
    await this.emit(outpassApproved(updated));
    return updated;
  }

  async reject(tenantId: TenantId, id: Uuid): Promise<Outpass> {
    const updated = rejectOutpass(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(outpassRejected(updated));
    return updated;
  }

  async checkOut(tenantId: TenantId, id: Uuid, actualOutAt?: string): Promise<Outpass> {
    const updated = checkOutOutpass(await this.require(tenantId, id), actualOutAt);
    await this.repository.save(updated);
    await this.emit(outpassCheckedOut(updated));
    return updated;
  }

  async return(tenantId: TenantId, id: Uuid, actualInAt?: string): Promise<Outpass> {
    const updated = returnOutpass(await this.require(tenantId, id), actualInAt);
    await this.repository.save(updated);
    await this.emit(outpassReturned(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Outpass> {
    const updated = cancelOutpass(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(outpassCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Outpass> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Outpass[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return this.repository.listByHostel(tenantId, hostelId);
  }

  async listOpenForHostel(tenantId: TenantId, hostelId: Uuid): Promise<Outpass[]> {
    return this.repository.listOpenByHostel(tenantId, hostelId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Outpass> {
    const outpass = await this.repository.findById(tenantId, id);
    if (!outpass) {
      throw new OutpassNotFoundError(id);
    }
    return outpass;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
