import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { HostelNotActiveError, HostelNotFoundError, RollCallNotFoundError } from "./errors";
import { isHostelActive } from "./hostel";
import type { BedAllocationRepository, HostelRepository, RollCallRepository } from "./ports";
import {
  rollCallCancelled,
  rollCallCompleted,
  rollCallScheduled,
  rollCallStarted,
} from "./residential-events";
import type { RollCallMarkInput } from "./roll-call-mark";
import {
  cancelRollCall,
  completeRollCall,
  recordRollCallMark,
  type RollCall,
  rollCallSummary,
  scheduleRollCall,
  startRollCall,
} from "./roll-call-session";
import type { RollCallSummary } from "./residential-view";

export interface ScheduleRollCallInput {
  readonly tenantId: TenantId;
  readonly hostelId: Uuid;
  readonly scheduledFor: string;
}

export interface RollCallServiceDeps {
  readonly repository: RollCallRepository;
  readonly hostels: HostelRepository;
  readonly allocations: BedAllocationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for roll calls. Schedules a curfew roll call for an active hostel, capturing the
 * roster from the hostel's **active bed allocations**; starts it; records one marking per resident
 * (validated on the roster); and completes or cancels it. The reconciled summary — including the
 * safety-critical unaccounted-for count — rides the completion event. Publishes the roll-call events.
 */
export class RollCallService {
  private readonly repository: RollCallRepository;
  private readonly hostels: HostelRepository;
  private readonly allocations: BedAllocationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RollCallServiceDeps) {
    this.repository = deps.repository;
    this.hostels = deps.hostels;
    this.allocations = deps.allocations;
    this.events = deps.events;
  }

  async schedule(input: ScheduleRollCallInput): Promise<RollCall> {
    const hostel = await this.hostels.findById(input.tenantId, input.hostelId);
    if (!hostel) {
      throw new HostelNotFoundError(input.hostelId);
    }
    if (!isHostelActive(hostel)) {
      throw new HostelNotActiveError(input.hostelId);
    }
    const active = await this.allocations.listActiveByHostel(input.tenantId, input.hostelId);
    const expectedResidentIds = [...new Set(active.map((a) => a.studentId))];
    const rollCall = scheduleRollCall({
      tenantId: input.tenantId,
      organizationId: hostel.organizationId,
      hostelId: input.hostelId,
      scheduledFor: input.scheduledFor,
      expectedResidentIds,
    });
    await this.repository.save(rollCall);
    await this.emit(rollCallScheduled(rollCall));
    return rollCall;
  }

  async start(tenantId: TenantId, id: Uuid): Promise<RollCall> {
    const updated = startRollCall(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(rollCallStarted(updated));
    return updated;
  }

  async mark(tenantId: TenantId, id: Uuid, input: RollCallMarkInput): Promise<RollCall> {
    const updated = recordRollCallMark(await this.require(tenantId, id), input);
    await this.repository.save(updated);
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<RollCall> {
    const updated = completeRollCall(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(rollCallCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<RollCall> {
    const updated = cancelRollCall(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(rollCallCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<RollCall> {
    return this.require(tenantId, id);
  }

  async summaryFor(tenantId: TenantId, id: Uuid): Promise<RollCallSummary> {
    return rollCallSummary(await this.require(tenantId, id));
  }

  async listForHostel(tenantId: TenantId, hostelId: Uuid): Promise<RollCall[]> {
    return this.repository.listByHostel(tenantId, hostelId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<RollCall> {
    const rollCall = await this.repository.findById(tenantId, id);
    if (!rollCall) {
      throw new RollCallNotFoundError(id);
    }
    return rollCall;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
