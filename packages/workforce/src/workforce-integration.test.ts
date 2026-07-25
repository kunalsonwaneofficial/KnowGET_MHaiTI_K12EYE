import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DepartmentService } from "./department-service";
import { EmployeeService } from "./employee-service";
import { EmploymentContractService } from "./employment-contract-service";
import { LeaveService } from "./leave-service";
import { PerformanceReviewService } from "./performance-review-service";
import {
  InMemoryDepartmentRepository,
  InMemoryEmployeeRepository,
  InMemoryEmploymentContractRepository,
  InMemoryLeaveEntitlementRepository,
  InMemoryLeaveRequestRepository,
  InMemoryPerformanceReviewRepository,
  InMemoryPositionRepository,
  InMemoryWorkforceProfileRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";
import { PositionService } from "./position-service";
import { WorkforceProfileService } from "./workforce-profile-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const ASOF = "2026-11-01";

/**
 * End-to-end: a staff member is hired into a department/position, put on an active contract, granted
 * and takes leave, is reviewed, and finally has a descriptive workforce profile refreshed and rolled
 * up — exercising every aggregate and both pure engines through the real services.
 */
describe("workforce integration", () => {
  it("runs the full hire-to-insight lifecycle across all services", async () => {
    const departments = new InMemoryDepartmentRepository();
    const positions = new InMemoryPositionRepository();
    const employeesRepo = new InMemoryEmployeeRepository();
    const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
    const persons: PersonDirectory = { exists: async (_t, id) => id === PERSON };

    const entitlementsRepo = new InMemoryLeaveEntitlementRepository();
    const leaveRequestsRepo = new InMemoryLeaveRequestRepository();
    const reviewsRepo = new InMemoryPerformanceReviewRepository();

    const departmentSvc = new DepartmentService({ repository: departments, organizations: orgs });
    const positionSvc = new PositionService({ repository: positions, departments });
    const employeeSvc = new EmployeeService({
      repository: employeesRepo,
      persons,
      organizations: orgs,
      departments,
      positions,
    });
    const contractSvc = new EmploymentContractService({
      repository: new InMemoryEmploymentContractRepository(),
      employees: employeesRepo,
    });
    const leaveSvc = new LeaveService({
      entitlements: entitlementsRepo,
      requests: leaveRequestsRepo,
      employees: employeesRepo,
    });
    const reviewSvc = new PerformanceReviewService({
      repository: reviewsRepo,
      employees: employeesRepo,
    });
    const profileSvc = new WorkforceProfileService({
      repository: new InMemoryWorkforceProfileRepository(),
      employees: employeesRepo,
      entitlements: entitlementsRepo,
      requests: leaveRequestsRepo,
      reviews: reviewsRepo,
    });

    // 1. HR structure: a department and an open position
    const dept = await departmentSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MATH",
      name: "Mathematics",
    });
    const position = await positionSvc.create({
      tenantId: TENANT,
      departmentId: dept.id,
      code: "TEACH-MATH",
      title: "Mathematics Teacher",
      employmentType: "full_time",
    });
    await positionSvc.open(TENANT, position.id);

    // 2. Hire: onboard → active, placed in the department/position
    let employee = await employeeSvc.onboard({
      tenantId: TENANT,
      organizationId: ORG,
      personId: PERSON,
      employeeNumber: "E-1001",
      employmentType: "full_time",
      departmentId: dept.id,
      positionId: position.id,
      hireDate: "2021-06-01",
    });
    employee = await employeeSvc.activate(TENANT, employee.id);
    expect(employee.status).toBe("active");

    // 3. Contract: issue v1 and activate it
    const contract = await contractSvc.issue({
      tenantId: TENANT,
      employeeId: employee.id,
      employmentType: "full_time",
      startDate: "2021-06-01",
      grade: "TGT-II",
    });
    const activeContract = await contractSvc.activate(TENANT, contract.id);
    expect(activeContract.status).toBe("active");
    expect(activeContract.grade).toBe("TGT-II");
    expect(Object.keys(activeContract)).not.toContain("salary"); // compensation lives in Finance

    // 4. Leave: grant 20 annual days, take 8, one still pending
    await leaveSvc.grant({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      period: "2026",
      entitledDays: 20,
    });
    const taken = await leaveSvc.request({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      days: 8,
      startDate: "2026-05-01",
    });
    await leaveSvc.approve(TENANT, taken.id);
    await leaveSvc.request({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      days: 2,
      startDate: "2026-08-01",
    });
    const ledger = await leaveSvc.computeLedger(TENANT, employee.id, "2026");
    expect(ledger.totalTaken).toBe(8);
    expect(ledger.totalPending).toBe(2);
    expect(ledger.utilizationRate).toBe(40);

    // 5. Review: draft → finalize with a strong rating
    let review = await reviewSvc.draft({
      tenantId: TENANT,
      employeeId: employee.id,
      period: "2026",
    });
    await reviewSvc.setRating(TENANT, review.id, 5);
    await reviewSvc.submit(TENANT, review.id);
    await reviewSvc.acknowledge(TENANT, review.id);
    review = await reviewSvc.finalize(TENANT, review.id);
    expect(review.status).toBe("finalized");

    // 6. Profile: refresh the descriptive indicators and roll up the org
    const profile = await profileSvc.refresh(TENANT, employee.id, ASOF);
    expect(profile.tenureMonths).toBeGreaterThan(60); // hired mid-2021
    expect(profile.leaveUtilizationRate).toBe(40);
    expect(profile.reviewsFinalized).toBe(1);
    expect(profile.averageReviewRating).toBe(5);
    expect(profile.attritionRiskBand).toBe("low"); // tenured, well-reviewed, moderate leave

    const summary = await profileSvc.summarizeOrganization(TENANT, ORG, ASOF);
    expect(summary.headcount).toBe(1);
    expect(summary.activeHeadcount).toBe(1);
    expect(summary.riskDistribution.low).toBe(1);
    expect(summary.atRiskCount).toBe(0);
  });
});
