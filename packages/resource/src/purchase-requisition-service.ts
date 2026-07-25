import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EmployeeNotFoundForResourceError, PurchaseRequisitionNotFoundError } from "./errors";
import type { EmployeeDirectory, PurchaseRequisitionRepository } from "./ports";
import {
  addRequisitionLine,
  approveRequisition,
  type DraftRequisitionParams,
  draftRequisition,
  type PurchaseRequisition,
  rejectRequisition,
  removeRequisitionLine,
  setRequisitionJustification,
  submitRequisition,
} from "./purchase-requisition";
import type { RequisitionLineInput } from "./requisition-line";
import { requisitionApproved, requisitionRejected, requisitionSubmitted } from "./resource-events";

/** The service draft input — the organization is derived from the requester, not supplied. */
export type DraftRequisitionInput = Omit<DraftRequisitionParams, "organizationId">;

export interface PurchaseRequisitionServiceDeps {
  readonly repository: PurchaseRequisitionRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for purchase requisitions — internal requests to buy. Drafts a requisition
 * against a requester (deriving the organization from the employee), edits its lines while draft, and
 * drives the `draft → submitted → approved | rejected` review lifecycle, publishing the requisition
 * events. An approved requisition authorizes raising a purchase order.
 */
export class PurchaseRequisitionService {
  private readonly repository: PurchaseRequisitionRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PurchaseRequisitionServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async draft(input: DraftRequisitionInput): Promise<PurchaseRequisition> {
    const organizationId = await this.employees.organizationOf(input.tenantId, input.requesterId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForResourceError(input.requesterId);
    }
    const requisition = draftRequisition({ ...input, organizationId });
    await this.repository.save(requisition);
    return requisition;
  }

  async setJustification(
    tenantId: TenantId,
    id: Uuid,
    justification: string | null,
  ): Promise<PurchaseRequisition> {
    return this.mutate(tenantId, id, (r) => setRequisitionJustification(r, justification));
  }

  async addLine(
    tenantId: TenantId,
    id: Uuid,
    input: RequisitionLineInput,
  ): Promise<PurchaseRequisition> {
    return this.mutate(tenantId, id, (r) => addRequisitionLine(r, input));
  }

  async removeLine(tenantId: TenantId, id: Uuid, key: string): Promise<PurchaseRequisition> {
    return this.mutate(tenantId, id, (r) => removeRequisitionLine(r, key));
  }

  async submit(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition> {
    const updated = submitRequisition(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(requisitionSubmitted(updated));
    return updated;
  }

  async approve(
    tenantId: TenantId,
    id: Uuid,
    reviewNote?: string | null,
  ): Promise<PurchaseRequisition> {
    const updated = approveRequisition(await this.require(tenantId, id), reviewNote);
    await this.repository.save(updated);
    await this.emit(requisitionApproved(updated));
    return updated;
  }

  async reject(
    tenantId: TenantId,
    id: Uuid,
    reviewNote?: string | null,
  ): Promise<PurchaseRequisition> {
    const updated = rejectRequisition(await this.require(tenantId, id), reviewNote);
    await this.repository.save(updated);
    await this.emit(requisitionRejected(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition> {
    return this.require(tenantId, id);
  }

  async listForRequester(tenantId: TenantId, requesterId: Uuid): Promise<PurchaseRequisition[]> {
    return this.repository.listByRequester(tenantId, requesterId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<PurchaseRequisition[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<PurchaseRequisition[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (requisition: PurchaseRequisition) => PurchaseRequisition,
  ): Promise<PurchaseRequisition> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition> {
    const requisition = await this.repository.findById(tenantId, id);
    if (!requisition) {
      throw new PurchaseRequisitionNotFoundError(id);
    }
    return requisition;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
