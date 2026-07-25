import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateContract,
  type DraftContractParams,
  draftContract,
  type EmploymentContract,
  expireContract,
  setContractEndDate,
  setContractGrade,
  setContractTerms,
  terminateContract,
} from "./employment-contract";
import { ContractNotFoundError, EmployeeNotFoundError } from "./errors";
import type { EmployeeRepository, EmploymentContractRepository } from "./ports";
import { contractActivated, contractEnded, contractIssued } from "./workforce-events";

/** The service issue input — organization and version are derived, not supplied. */
export type IssueContractInput = Omit<DraftContractParams, "organizationId" | "version">;

export interface EmploymentContractServiceDeps {
  readonly repository: EmploymentContractRepository;
  readonly employees: EmployeeRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for employment contracts — version control for the employment relationship.
 * Issues each new version against an employee (deriving the organization and the next version
 * number), lets a draft be edited, and on activation supersedes the prior active version so at most
 * one contract is active per employee at a time. Publishes the contract issued / activated / ended
 * events. Compensation amounts are never handled here — only the pay grade/band label.
 */
export class EmploymentContractService {
  private readonly repository: EmploymentContractRepository;
  private readonly employees: EmployeeRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EmploymentContractServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async issue(input: IssueContractInput): Promise<EmploymentContract> {
    const employee = await this.employees.findById(input.tenantId, input.employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(input.employeeId);
    }
    const existing = await this.repository.listByEmployee(input.tenantId, input.employeeId);
    const version = existing.reduce((max, c) => Math.max(max, c.version), 0) + 1;
    const contract = draftContract({
      ...input,
      organizationId: employee.organizationId,
      version,
    });
    await this.repository.save(contract);
    await this.emit(contractIssued(contract));
    return contract;
  }

  async setGrade(tenantId: TenantId, id: Uuid, grade: string | null): Promise<EmploymentContract> {
    return this.mutate(tenantId, id, (c) => setContractGrade(c, grade));
  }

  async setEndDate(
    tenantId: TenantId,
    id: Uuid,
    endDate: string | null,
  ): Promise<EmploymentContract> {
    return this.mutate(tenantId, id, (c) => setContractEndDate(c, endDate));
  }

  async setTerms(tenantId: TenantId, id: Uuid, terms: string | null): Promise<EmploymentContract> {
    return this.mutate(tenantId, id, (c) => setContractTerms(c, terms));
  }

  /**
   * Activate a draft contract. Any currently-active contract for the same employee is expired and
   * recorded as the version this one supersedes, guaranteeing a single active contract per employee.
   */
  async activate(tenantId: TenantId, id: Uuid): Promise<EmploymentContract> {
    const contract = await this.require(tenantId, id);
    const current = await this.repository.findActiveByEmployee(tenantId, contract.employeeId);
    let supersedes: Uuid | null = null;
    if (current && current.id !== contract.id) {
      const expired = expireContract(current);
      await this.repository.save(expired);
      await this.emit(contractEnded(expired));
      supersedes = current.id;
    }
    const activated = activateContract(contract, supersedes);
    await this.repository.save(activated);
    await this.emit(contractActivated(activated));
    return activated;
  }

  async expire(tenantId: TenantId, id: Uuid): Promise<EmploymentContract> {
    return this.end(tenantId, id, expireContract);
  }

  async terminate(tenantId: TenantId, id: Uuid): Promise<EmploymentContract> {
    return this.end(tenantId, id, terminateContract);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EmploymentContract> {
    return this.require(tenantId, id);
  }

  async getActiveForEmployee(
    tenantId: TenantId,
    employeeId: Uuid,
  ): Promise<EmploymentContract | null> {
    return this.repository.findActiveByEmployee(tenantId, employeeId);
  }

  async listForEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract[]> {
    return this.repository.listByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<EmploymentContract[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async end(
    tenantId: TenantId,
    id: Uuid,
    fn: (contract: EmploymentContract) => EmploymentContract,
  ): Promise<EmploymentContract> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(contractEnded(updated));
    return updated;
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (contract: EmploymentContract) => EmploymentContract,
  ): Promise<EmploymentContract> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EmploymentContract> {
    const contract = await this.repository.findById(tenantId, id);
    if (!contract) {
      throw new ContractNotFoundError(id);
    }
    return contract;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
