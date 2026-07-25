import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { DepartmentController } from "./department.controller";
import { EmployeeController } from "./employee.controller";
import { EmploymentContractController } from "./employment-contract.controller";
import { LeaveController } from "./leave.controller";
import { PerformanceReviewController } from "./performance-review.controller";
import { PositionController } from "./position.controller";
import { WorkforceModule } from "./workforce.module";
import {
  WF_CONTRACT_SERVICE,
  WF_DEPARTMENT_SERVICE,
  WF_EMPLOYEE_SERVICE,
  WF_LEAVE_SERVICE,
  WF_POSITION_SERVICE,
  WF_PROFILE_SERVICE,
  WF_REVIEW_SERVICE,
} from "./workforce.tokens";
import { WorkforceProfileController } from "./workforce-profile.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain modules
 * inject, so the workforce DI graph — including the imported Organization and Person modules — can
 * compile without a live database. The Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("WorkforceModule (integration)", () => {
  it("compiles the full workforce DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, WorkforceModule],
    }).compile();

    expect(moduleRef.get(DepartmentController)).toBeInstanceOf(DepartmentController);
    expect(moduleRef.get(PositionController)).toBeInstanceOf(PositionController);
    expect(moduleRef.get(EmployeeController)).toBeInstanceOf(EmployeeController);
    expect(moduleRef.get(EmploymentContractController)).toBeInstanceOf(
      EmploymentContractController,
    );
    expect(moduleRef.get(LeaveController)).toBeInstanceOf(LeaveController);
    expect(moduleRef.get(PerformanceReviewController)).toBeInstanceOf(PerformanceReviewController);
    expect(moduleRef.get(WorkforceProfileController)).toBeInstanceOf(WorkforceProfileController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, WorkforceModule],
    }).compile();

    for (const token of [
      WF_DEPARTMENT_SERVICE,
      WF_POSITION_SERVICE,
      WF_EMPLOYEE_SERVICE,
      WF_CONTRACT_SERVICE,
      WF_LEAVE_SERVICE,
      WF_REVIEW_SERVICE,
      WF_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
