import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { DocumentNotFoundError, DuplicateDocumentError, VehicleNotFoundError } from "./errors";
import type { VehicleDocumentRepository, VehicleRepository } from "./ports";
import { documentRecorded, documentRenewed } from "./transport-events";
import type { DocumentCompliance } from "./transport-view";
import {
  documentComplianceAsOf,
  type RecordDocumentParams,
  recordVehicleDocument,
  renewDocument,
  setDocumentNotes,
  type VehicleDocument,
} from "./vehicle-document";

/** The service record input — the organization is derived from the vehicle, not supplied. */
export type RecordDocumentInput = Omit<RecordDocumentParams, "organizationId">;

export interface VehicleDocumentServiceDeps {
  readonly repository: VehicleDocumentRepository;
  readonly vehicles: VehicleRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for vehicle documents — the compliance master. Records a document against a vehicle
 * (deriving the organization from it, one per type per vehicle), renews it, and computes the compliance
 * status (valid/expiring/expired) of a vehicle's documents as of a date. Publishes the document events.
 */
export class VehicleDocumentService {
  private readonly repository: VehicleDocumentRepository;
  private readonly vehicles: VehicleRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: VehicleDocumentServiceDeps) {
    this.repository = deps.repository;
    this.vehicles = deps.vehicles;
    this.events = deps.events;
  }

  async record(input: RecordDocumentInput): Promise<VehicleDocument> {
    const vehicle = await this.vehicles.findById(input.tenantId, input.vehicleId);
    if (!vehicle) {
      throw new VehicleNotFoundError(input.vehicleId);
    }
    if (await this.repository.findByVehicleAndType(input.tenantId, input.vehicleId, input.type)) {
      throw new DuplicateDocumentError(input.vehicleId, input.type);
    }
    const document = recordVehicleDocument({ ...input, organizationId: vehicle.organizationId });
    await this.repository.save(document);
    await this.emit(documentRecorded(document));
    return document;
  }

  async renew(
    tenantId: TenantId,
    id: Uuid,
    documentNumber: string,
    issuedOn: string,
    expiresOn: string,
  ): Promise<VehicleDocument> {
    const updated = renewDocument(
      await this.require(tenantId, id),
      documentNumber,
      issuedOn,
      expiresOn,
    );
    await this.repository.save(updated);
    await this.emit(documentRenewed(updated));
    return updated;
  }

  async setNotes(tenantId: TenantId, id: Uuid, notes: string | null): Promise<VehicleDocument> {
    const updated = setDocumentNotes(await this.require(tenantId, id), notes);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<VehicleDocument> {
    return this.require(tenantId, id);
  }

  async listForVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleDocument[]> {
    return this.repository.listByVehicle(tenantId, vehicleId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<VehicleDocument[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** The compliance status of a vehicle's documents as of a date. */
  async complianceForVehicle(
    tenantId: TenantId,
    vehicleId: Uuid,
    asOfDate: string,
    warningDays?: number,
  ): Promise<DocumentCompliance[]> {
    const documents = await this.repository.listByVehicle(tenantId, vehicleId);
    return documents.map((document) => documentComplianceAsOf(document, asOfDate, warningDays));
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<VehicleDocument> {
    const document = await this.repository.findById(tenantId, id);
    if (!document) {
      throw new DocumentNotFoundError(id);
    }
    return document;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
