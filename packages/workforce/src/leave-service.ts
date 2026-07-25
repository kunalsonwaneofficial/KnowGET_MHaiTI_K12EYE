import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateEntitlementError,
  EmployeeNotFoundError,
  LeaveEntitlementNotFoundError,
  LeaveRequestNotFoundError,
} from "./errors";
import { computeLeaveLedger } from "./leave-ledger";
import {
  type GrantEntitlementParams,
  grantEntitlement,
  type LeaveEntitlement,
  setEntitledDays,
} from "./leave-entitlement";
import {
  approveLeave,
  cancelLeave,
  type LeaveRequest,
  rejectLeave,
  type RequestLeaveParams,
  requestLeave,
} from "./leave-request";
import type {
  EmployeeRepository,
  LeaveEntitlementRepository,
  LeaveRequestRepository,
} from "./ports";
import type { LeaveLedger } from "./workforce-view";
import { leaveApproved, leaveCancelled, leaveRejected, leaveRequested } from "./workforce-events";

/** The service grant input — the organization is derived from the employee, not supplied. */
export type GrantEntitlementInput = Omit<GrantEntitlementParams, "organizationId">;
/** The service leave input — the organization is derived from the employee, not supplied. */
export type RequestLeaveInput = Omit<RequestLeaveParams, "organizationId">;

export interface LeaveServiceDeps {
  readonly entitlements: LeaveEntitlementRepository;
  readonly requests: LeaveRequestRepository;
  readonly employees: EmployeeRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for staff leave — the entitlement/request pair that feeds the pure leave-ledger
 * engine. Grants entitlements (one per leave type per period), records and adjudicates leave requests
 * (`requested → approved | rejected | cancelled`), and reconciles the two into a per-type ledger via
 * {@link computeLeaveLedger}. Publishes the leave lifecycle events.
 */
export class LeaveService {
  private readonly entitlements: LeaveEntitlementRepository;
  private readonly requests: LeaveRequestRepository;
  private readonly employees: EmployeeRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LeaveServiceDeps) {
    this.entitlements = deps.entitlements;
    this.requests = deps.requests;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async grant(input: GrantEntitlementInput): Promise<LeaveEntitlement> {
    const employee = await this.requireEmployee(input.tenantId, input.employeeId);
    const existing = await this.entitlements.findByScope(
      input.tenantId,
      input.employeeId,
      input.leaveType,
      input.period,
    );
    if (existing) {
      throw new DuplicateEntitlementError(input.leaveType, input.period);
    }
    const entitlement = grantEntitlement({ ...input, organizationId: employee.organizationId });
    await this.entitlements.save(entitlement);
    return entitlement;
  }

  async reviseEntitlement(
    tenantId: TenantId,
    id: Uuid,
    entitledDays: number,
  ): Promise<LeaveEntitlement> {
    const entitlement = await this.entitlements.findById(tenantId, id);
    if (!entitlement) {
      throw new LeaveEntitlementNotFoundError(id);
    }
    const updated = setEntitledDays(entitlement, entitledDays);
    await this.entitlements.save(updated);
    return updated;
  }

  async request(input: RequestLeaveInput): Promise<LeaveRequest> {
    const employee = await this.requireEmployee(input.tenantId, input.employeeId);
    const request = requestLeave({ ...input, organizationId: employee.organizationId });
    await this.requests.save(request);
    await this.emit(leaveRequested(request));
    return request;
  }

  async approve(tenantId: TenantId, id: Uuid, decidedBy?: Uuid | null): Promise<LeaveRequest> {
    return this.decide(tenantId, id, (r) => approveLeave(r, decidedBy), leaveApproved);
  }

  async reject(tenantId: TenantId, id: Uuid, decidedBy?: Uuid | null): Promise<LeaveRequest> {
    return this.decide(tenantId, id, (r) => rejectLeave(r, decidedBy), leaveRejected);
  }

  async cancel(tenantId: TenantId, id: Uuid, decidedBy?: Uuid | null): Promise<LeaveRequest> {
    return this.decide(tenantId, id, (r) => cancelLeave(r, decidedBy), leaveCancelled);
  }

  /**
   * Reconcile the employee's entitlements and requests for a period into a per-type ledger — the
   * genuine read model of staff leave, computed by the pure engine over narrow views.
   */
  async computeLedger(tenantId: TenantId, employeeId: Uuid, period: string): Promise<LeaveLedger> {
    const [entitlements, requests] = await Promise.all([
      this.entitlements.listByEmployee(tenantId, employeeId),
      this.requests.listByEmployee(tenantId, employeeId),
    ]);
    return computeLeaveLedger(
      entitlements
        .filter((e) => e.period === period)
        .map((e) => ({ leaveType: e.leaveType, entitledDays: e.entitledDays })),
      requests
        .filter((r) => r.period === period)
        .map((r) => ({ leaveType: r.leaveType, days: r.days, status: r.status })),
    );
  }

  async getRequest(tenantId: TenantId, id: Uuid): Promise<LeaveRequest> {
    const request = await this.requests.findById(tenantId, id);
    if (!request) {
      throw new LeaveRequestNotFoundError(id);
    }
    return request;
  }

  async listRequests(tenantId: TenantId, employeeId: Uuid): Promise<LeaveRequest[]> {
    return this.requests.listByEmployee(tenantId, employeeId);
  }

  async listEntitlements(tenantId: TenantId, employeeId: Uuid): Promise<LeaveEntitlement[]> {
    return this.entitlements.listByEmployee(tenantId, employeeId);
  }

  private async decide(
    tenantId: TenantId,
    id: Uuid,
    fn: (request: LeaveRequest) => LeaveRequest,
    event: (request: LeaveRequest) => DomainEvent,
  ): Promise<LeaveRequest> {
    const request = await this.requests.findById(tenantId, id);
    if (!request) {
      throw new LeaveRequestNotFoundError(id);
    }
    const updated = fn(request);
    await this.requests.save(updated);
    await this.emit(event(updated));
    return updated;
  }

  private async requireEmployee(tenantId: TenantId, employeeId: Uuid) {
    const employee = await this.employees.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }
    return employee;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
