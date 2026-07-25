import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  approveConcession,
  type Concession,
  concessionAmount,
  rejectConcession,
  type RequestConcessionParams,
  requestConcession,
  revokeConcession,
} from "./concession";
import { ConcessionNotFoundError, StudentNotFoundForFinanceError } from "./errors";
import {
  concessionApproved,
  concessionRejected,
  concessionRequested,
  concessionRevoked,
} from "./finance-events";
import type { Money } from "./money";
import type { ConcessionRepository, StudentDirectory } from "./ports";

/** The service request input — the organization is derived from the student, not supplied. */
export type RequestConcessionInput = Omit<RequestConcessionParams, "organizationId">;

export interface ConcessionServiceDeps {
  readonly repository: ConcessionRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for concessions — scholarships and discounts on a student's fees. Requests a
 * concession against a student (deriving the organization), drives the `requested → approved →
 * revoked` / `rejected` review lifecycle, and exposes the pure {@link concessionAmount} so callers can
 * compute the money an approved concession takes off a base.
 */
export class ConcessionService {
  private readonly repository: ConcessionRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ConcessionServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.events = deps.events;
  }

  async request(input: RequestConcessionInput): Promise<Concession> {
    const organizationId = await this.students.organizationOf(input.tenantId, input.studentId);
    if (organizationId === null) {
      throw new StudentNotFoundForFinanceError(input.studentId);
    }
    const concession = requestConcession({ ...input, organizationId });
    await this.repository.save(concession);
    await this.emit(concessionRequested(concession));
    return concession;
  }

  async approve(tenantId: TenantId, id: Uuid, reviewNote?: string | null): Promise<Concession> {
    const updated = approveConcession(await this.require(tenantId, id), reviewNote);
    await this.repository.save(updated);
    await this.emit(concessionApproved(updated));
    return updated;
  }

  async reject(tenantId: TenantId, id: Uuid, reviewNote?: string | null): Promise<Concession> {
    const updated = rejectConcession(await this.require(tenantId, id), reviewNote);
    await this.repository.save(updated);
    await this.emit(concessionRejected(updated));
    return updated;
  }

  async revoke(tenantId: TenantId, id: Uuid, reviewNote?: string | null): Promise<Concession> {
    const updated = revokeConcession(await this.require(tenantId, id), reviewNote);
    await this.repository.save(updated);
    await this.emit(concessionRevoked(updated));
    return updated;
  }

  /** Compute the money this concession takes off a base amount (pure; no state change). */
  async amountOff(tenantId: TenantId, id: Uuid, base: Money): Promise<Money> {
    return concessionAmount(await this.require(tenantId, id), base);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Concession> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Concession[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Concession[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<Concession[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Concession> {
    const concession = await this.repository.findById(tenantId, id);
    if (!concession) {
      throw new ConcessionNotFoundError(id);
    }
    return concession;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
