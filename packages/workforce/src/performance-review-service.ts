import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EmployeeNotFoundError, ReviewNotFoundError } from "./errors";
import type { EmployeeRepository, PerformanceReviewRepository } from "./ports";
import {
  acknowledgeReview,
  type DraftReviewParams,
  draftReview,
  finalizeReview,
  type PerformanceReview,
  setOverallRating,
  setReviewNarrative,
  submitReview,
} from "./performance-review";
import { reviewFinalized, reviewSubmitted } from "./workforce-events";

/** The service draft input — the organization is derived from the employee, not supplied. */
export type DraftReviewInput = Omit<DraftReviewParams, "organizationId">;

export interface PerformanceReviewServiceDeps {
  readonly repository: PerformanceReviewRepository;
  readonly employees: EmployeeRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for performance reviews. Opens a review against an employee (deriving the
 * organization), lets a draft be edited, and drives the `draft → submitted → acknowledged →
 * finalized` lifecycle — publishing the submitted and finalized events. Only a finalized review
 * counts toward an employee's review standing in the workforce-intelligence engine.
 */
export class PerformanceReviewService {
  private readonly repository: PerformanceReviewRepository;
  private readonly employees: EmployeeRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PerformanceReviewServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async draft(input: DraftReviewInput): Promise<PerformanceReview> {
    const employee = await this.employees.findById(input.tenantId, input.employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(input.employeeId);
    }
    const review = draftReview({ ...input, organizationId: employee.organizationId });
    await this.repository.save(review);
    return review;
  }

  async setRating(
    tenantId: TenantId,
    id: Uuid,
    overallRating: number | null,
  ): Promise<PerformanceReview> {
    return this.mutate(tenantId, id, (r) => setOverallRating(r, overallRating));
  }

  async setNarrative(
    tenantId: TenantId,
    id: Uuid,
    narrative: {
      readonly summary?: string | null;
      readonly strengths?: string | null;
      readonly improvements?: string | null;
    },
  ): Promise<PerformanceReview> {
    return this.mutate(tenantId, id, (r) => setReviewNarrative(r, narrative));
  }

  async submit(tenantId: TenantId, id: Uuid): Promise<PerformanceReview> {
    const updated = submitReview(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(reviewSubmitted(updated));
    return updated;
  }

  async acknowledge(tenantId: TenantId, id: Uuid): Promise<PerformanceReview> {
    return this.mutate(tenantId, id, acknowledgeReview);
  }

  async finalize(tenantId: TenantId, id: Uuid): Promise<PerformanceReview> {
    const updated = finalizeReview(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(reviewFinalized(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<PerformanceReview> {
    return this.require(tenantId, id);
  }

  async listForEmployee(tenantId: TenantId, employeeId: Uuid): Promise<PerformanceReview[]> {
    return this.repository.listByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<PerformanceReview[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (review: PerformanceReview) => PerformanceReview,
  ): Promise<PerformanceReview> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<PerformanceReview> {
    const review = await this.repository.findById(tenantId, id);
    if (!review) {
      throw new ReviewNotFoundError(id);
    }
    return review;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
