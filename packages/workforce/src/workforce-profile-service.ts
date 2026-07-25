import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EmployeeNotFoundError } from "./errors";
import { computeLeaveLedger } from "./leave-ledger";
import type {
  EmployeeRepository,
  LeaveEntitlementRepository,
  LeaveRequestRepository,
  PerformanceReviewRepository,
  WorkforceProfileRepository,
} from "./ports";
import {
  createWorkforceProfile,
  refreshWorkforceProfile,
  type WorkforceProfile,
} from "./workforce-profile";
import { computeWorkforceIndicators, summarizeWorkforce } from "./workforce-intelligence";
import type { WorkforceMemberView, WorkforceSummary } from "./workforce-view";
import { workforceProfileRefreshed } from "./workforce-events";

export interface WorkforceProfileServiceDeps {
  readonly repository: WorkforceProfileRepository;
  readonly employees: EmployeeRepository;
  readonly entitlements: LeaveEntitlementRepository;
  readonly requests: LeaveRequestRepository;
  readonly reviews: PerformanceReviewRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the workforce profile — the descriptive, AI-ready indicator snapshot per
 * employee, and the leadership-facing organization rollup. It gathers the employee's tenure, leave
 * utilization (via the pure leave-ledger) and finalized-review standing, runs the pure
 * {@link computeWorkforceIndicators} engine, and refreshes the one-per-employee profile — every
 * value explainable, nothing predicted (prediction is deferred to the intelligence core, P2-D28).
 */
export class WorkforceProfileService {
  private readonly repository: WorkforceProfileRepository;
  private readonly employees: EmployeeRepository;
  private readonly entitlements: LeaveEntitlementRepository;
  private readonly requests: LeaveRequestRepository;
  private readonly reviews: PerformanceReviewRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: WorkforceProfileServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.entitlements = deps.entitlements;
    this.requests = deps.requests;
    this.reviews = deps.reviews;
    this.events = deps.events;
  }

  /**
   * Refresh (or first create) an employee's workforce profile as of `asOf` (ISO date). Leave
   * utilization is scoped to `period` (defaulting to the as-of year).
   */
  async refresh(
    tenantId: TenantId,
    employeeId: Uuid,
    asOf: string,
    period?: string,
  ): Promise<WorkforceProfile> {
    const employee = await this.employees.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }
    const scopedPeriod = period ?? asOf.slice(0, 4);
    const [entitlements, requests, reviews] = await Promise.all([
      this.entitlements.listByEmployee(tenantId, employeeId),
      this.requests.listByEmployee(tenantId, employeeId),
      this.reviews.listByEmployee(tenantId, employeeId),
    ]);
    const ledger = computeLeaveLedger(
      entitlements
        .filter((e) => e.period === scopedPeriod)
        .map((e) => ({ leaveType: e.leaveType, entitledDays: e.entitledDays })),
      requests
        .filter((r) => r.period === scopedPeriod)
        .map((r) => ({ leaveType: r.leaveType, days: r.days, status: r.status })),
    );
    const indicators = computeWorkforceIndicators(
      {
        employee: { status: employee.status, hireDate: employee.hireDate },
        leaveUtilizationRate: ledger.utilizationRate,
        reviews: reviews.map((r) => ({ status: r.status, overallRating: r.overallRating })),
      },
      asOf,
    );
    const existing =
      (await this.repository.findByEmployee(tenantId, employeeId)) ??
      createWorkforceProfile({
        tenantId,
        organizationId: employee.organizationId,
        employeeId,
        employmentStatus: employee.status,
      });
    const refreshed = refreshWorkforceProfile(existing, indicators);
    await this.repository.save(refreshed);
    await this.emit(workforceProfileRefreshed(refreshed));
    return refreshed;
  }

  async getByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<WorkforceProfile | null> {
    return this.repository.findByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<WorkforceProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * A leadership-facing descriptive rollup of an organization's live workforce — headcount, status
   * and attrition-risk distribution — computed by the pure {@link summarizeWorkforce} engine over
   * the current employees joined to their latest profile risk band.
   */
  async summarizeOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
    asOf: string,
  ): Promise<WorkforceSummary> {
    const [employees, profiles] = await Promise.all([
      this.employees.listByOrganization(tenantId, organizationId),
      this.repository.listByOrganization(tenantId, organizationId),
    ]);
    const bandByEmployee = new Map(profiles.map((p) => [p.employeeId, p.attritionRiskBand]));
    const members: WorkforceMemberView[] = employees.map((e) => ({
      status: e.status,
      hireDate: e.hireDate,
      attritionRiskBand: bandByEmployee.get(e.id) ?? "low",
    }));
    return summarizeWorkforce(members, asOf);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
