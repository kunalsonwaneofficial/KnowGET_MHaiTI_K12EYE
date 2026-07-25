import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { type Employee, activateEmployee, onboardEmployee } from "./employee";
import { grantEntitlement } from "./leave-entitlement";
import { approveLeave, requestLeave } from "./leave-request";
import {
  acknowledgeReview,
  draftReview,
  finalizeReview,
  type PerformanceReview,
  setOverallRating,
  submitReview,
} from "./performance-review";
import {
  InMemoryEmployeeRepository,
  InMemoryLeaveEntitlementRepository,
  InMemoryLeaveRequestRepository,
  InMemoryPerformanceReviewRepository,
  InMemoryWorkforceProfileRepository,
} from "./ports";
import { WorkforceProfileService } from "./workforce-profile-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ASOF = "2026-11-01";

function harness() {
  const employees = new InMemoryEmployeeRepository();
  const entitlements = new InMemoryLeaveEntitlementRepository();
  const requests = new InMemoryLeaveRequestRepository();
  const reviews = new InMemoryPerformanceReviewRepository();
  const events: DomainEvent[] = [];
  const svc = new WorkforceProfileService({
    repository: new InMemoryWorkforceProfileRepository(),
    employees,
    entitlements,
    requests,
    reviews,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, employees, entitlements, requests, reviews, events };
}

const employee = (personId: string, hireDate: string): Employee =>
  activateEmployee(
    onboardEmployee({
      tenantId: TENANT,
      organizationId: ORG,
      personId: personId as Uuid,
      employeeNumber: `E-${personId.slice(0, 4)}`,
      employmentType: "full_time",
      hireDate,
    }),
  );

const finalizedReview = (employeeId: Uuid, rating: number): PerformanceReview =>
  finalizeReview(
    acknowledgeReview(
      submitReview(
        setOverallRating(
          draftReview({ tenantId: TENANT, organizationId: ORG, employeeId, period: "2026" }),
          rating,
        ),
      ),
    ),
  );

describe("WorkforceProfileService", () => {
  it("refreshes an employee's profile from tenure, leave and review facts", async () => {
    const { svc, employees, entitlements, requests, reviews } = harness();
    const e = employee("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "2020-01-01");
    await employees.save(e);
    await entitlements.save(
      grantEntitlement({
        tenantId: TENANT,
        organizationId: ORG,
        employeeId: e.id,
        leaveType: "annual",
        period: "2026",
        entitledDays: 20,
      }),
    );
    await requests.save(
      approveLeave(
        requestLeave({
          tenantId: TENANT,
          organizationId: ORG,
          employeeId: e.id,
          leaveType: "annual",
          days: 6,
          startDate: "2026-04-01",
        }),
      ),
    );
    await reviews.save(finalizedReview(e.id, 4));

    const profile = await svc.refresh(TENANT, e.id, ASOF);
    expect(profile.status).toBe("refreshed");
    expect(profile.version).toBe(2);
    expect(profile.tenureMonths).toBeGreaterThan(60);
    expect(profile.leaveUtilizationRate).toBe(30); // 100 * 6 / 20
    expect(profile.reviewsFinalized).toBe(1);
    expect(profile.averageReviewRating).toBe(4);
    expect(profile.attritionRiskBand).toBe("low");

    // a second refresh bumps the version, not a duplicate profile
    const again = await svc.refresh(TENANT, e.id, ASOF);
    expect(again.id).toBe(profile.id);
    expect(again.version).toBe(3);
    expect(await svc.list(TENANT)).toHaveLength(1);
  });

  it("rolls up an organization's live workforce by status and attrition risk", async () => {
    const { svc, employees, reviews } = harness();
    const tenured = employee("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "2019-01-01");
    const fresh = employee("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "2026-09-01"); // short tenure
    await employees.save(tenured);
    await employees.save(fresh);
    await reviews.save(finalizedReview(fresh.id, 2)); // weak review → high risk

    await svc.refresh(TENANT, tenured.id, ASOF);
    await svc.refresh(TENANT, fresh.id, ASOF);

    const summary = await svc.summarizeOrganization(TENANT, ORG, ASOF);
    expect(summary.headcount).toBe(2);
    expect(summary.activeHeadcount).toBe(2);
    expect(summary.riskDistribution.high).toBe(1); // the weak-review employee
    expect(summary.riskDistribution.low).toBe(1);
    expect(summary.atRiskCount).toBe(1);
  });
});
