import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { DuplicateInspectionError, HostelNotFoundError, InspectionNotFoundError } from "./errors";
import {
  type HostelInspection,
  inspectionComplianceAsOf,
  type RecordInspectionParams,
  recordHostelInspection,
  reinspectHostel,
  setInspectionNotes,
} from "./hostel-inspection";
import type { HostelInspectionRepository, HostelRepository } from "./ports";
import { inspectionRecorded, inspectionReinspected } from "./residential-events";
import type { InspectionOutcome } from "./residential-value";
import type { InspectionCompliance } from "./residential-view";

/** The service record input — the organization is derived from the hostel, not supplied. */
export type RecordInspectionInput = Omit<RecordInspectionParams, "organizationId">;

export interface HostelInspectionServiceDeps {
  readonly repository: HostelInspectionRepository;
  readonly hostels: HostelRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for hostel inspections — the residential-plant compliance record. Records an
 * inspection against a hostel (deriving the organization from the hostel and enforcing one inspection per
 * type per hostel), re-inspects it in place, and derives the compliance status from the next-due date.
 * Publishes the inspection events.
 */
export class HostelInspectionService {
  private readonly repository: HostelInspectionRepository;
  private readonly hostels: HostelRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HostelInspectionServiceDeps) {
    this.repository = deps.repository;
    this.hostels = deps.hostels;
    this.events = deps.events;
  }

  async record(input: RecordInspectionInput): Promise<HostelInspection> {
    const hostel = await this.hostels.findById(input.tenantId, input.hostelId);
    if (!hostel) {
      throw new HostelNotFoundError(input.hostelId);
    }
    if (await this.repository.findByHostelAndType(input.tenantId, input.hostelId, input.type)) {
      throw new DuplicateInspectionError(input.hostelId, input.type);
    }
    const inspection = recordHostelInspection({
      ...input,
      organizationId: hostel.organizationId,
    });
    await this.repository.save(inspection);
    await this.emit(inspectionRecorded(inspection));
    return inspection;
  }

  async reinspect(
    tenantId: TenantId,
    id: Uuid,
    conductedOn: string,
    outcome: InspectionOutcome,
    nextDueOn: string,
    inspector?: string | null,
  ): Promise<HostelInspection> {
    const updated = reinspectHostel(
      await this.require(tenantId, id),
      conductedOn,
      outcome,
      nextDueOn,
      inspector,
    );
    await this.repository.save(updated);
    await this.emit(inspectionReinspected(updated));
    return updated;
  }

  async setNotes(tenantId: TenantId, id: Uuid, notes: string | null): Promise<HostelInspection> {
    const updated = setInspectionNotes(await this.require(tenantId, id), notes);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<HostelInspection> {
    return this.require(tenantId, id);
  }

  async complianceFor(
    tenantId: TenantId,
    id: Uuid,
    asOfDate: string,
    warningDays?: number,
  ): Promise<InspectionCompliance> {
    return inspectionComplianceAsOf(await this.require(tenantId, id), asOfDate, warningDays);
  }

  async listForHostel(tenantId: TenantId, hostelId: Uuid): Promise<HostelInspection[]> {
    return this.repository.listByHostel(tenantId, hostelId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<HostelInspection> {
    const inspection = await this.repository.findById(tenantId, id);
    if (!inspection) {
      throw new InspectionNotFoundError(id);
    }
    return inspection;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
