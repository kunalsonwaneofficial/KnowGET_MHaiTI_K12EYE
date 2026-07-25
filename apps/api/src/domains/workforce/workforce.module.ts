import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import {
  DepartmentService,
  type DepartmentRepository,
  EmployeeService,
  type EmployeeRepository,
  EmploymentContractService,
  type EmploymentContractRepository,
  LeaveService,
  type LeaveEntitlementRepository,
  type LeaveRequestRepository,
  type OrganizationDirectory,
  PerformanceReviewService,
  type PerformanceReviewRepository,
  type PersonDirectory,
  PositionService,
  type PositionRepository,
  WorkforceProfileService,
  type WorkforceProfileRepository,
} from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { DepartmentController } from "./department.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { EmployeeController } from "./employee.controller";
import { EmploymentContractController } from "./employment-contract.controller";
import { LeaveController } from "./leave.controller";
import { PerformanceReviewController } from "./performance-review.controller";
import { PositionController } from "./position.controller";
import { PrismaDepartmentRepository } from "./prisma-department.repository";
import { PrismaEmployeeRepository } from "./prisma-employee.repository";
import { PrismaEmploymentContractRepository } from "./prisma-employment-contract.repository";
import { PrismaLeaveEntitlementRepository } from "./prisma-leave-entitlement.repository";
import { PrismaLeaveRequestRepository } from "./prisma-leave-request.repository";
import { PrismaPerformanceReviewRepository } from "./prisma-performance-review.repository";
import { PrismaPositionRepository } from "./prisma-position.repository";
import { PrismaWorkforceProfileRepository } from "./prisma-workforce-profile.repository";
import { WorkforceProfileController } from "./workforce-profile.controller";
import {
  WF_CONTRACT_REPOSITORY,
  WF_CONTRACT_SERVICE,
  WF_DEPARTMENT_REPOSITORY,
  WF_DEPARTMENT_SERVICE,
  WF_EMPLOYEE_REPOSITORY,
  WF_EMPLOYEE_SERVICE,
  WF_LEAVE_ENTITLEMENT_REPOSITORY,
  WF_LEAVE_REQUEST_REPOSITORY,
  WF_LEAVE_SERVICE,
  WF_ORGANIZATION_DIRECTORY,
  WF_PERSON_DIRECTORY,
  WF_POSITION_REPOSITORY,
  WF_POSITION_SERVICE,
  WF_PROFILE_REPOSITORY,
  WF_PROFILE_SERVICE,
  WF_REVIEW_REPOSITORY,
  WF_REVIEW_SERVICE,
} from "./workforce.tokens";

const repositories: Provider[] = [
  {
    provide: WF_DEPARTMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDepartmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_POSITION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPositionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_EMPLOYEE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEmployeeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_CONTRACT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEmploymentContractRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_LEAVE_ENTITLEMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLeaveEntitlementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_LEAVE_REQUEST_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLeaveRequestRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_REVIEW_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPerformanceReviewRepository(db),
    inject: [DATABASE],
  },
  {
    provide: WF_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWorkforceProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: WF_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: WF_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: WF_DEPARTMENT_SERVICE,
    useFactory: (
      repository: DepartmentRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new DepartmentService({ repository, organizations, events }),
    inject: [WF_DEPARTMENT_REPOSITORY, WF_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: WF_POSITION_SERVICE,
    useFactory: (
      repository: PositionRepository,
      departments: DepartmentRepository,
      events: EventBus,
    ) => new PositionService({ repository, departments, events }),
    inject: [WF_POSITION_REPOSITORY, WF_DEPARTMENT_REPOSITORY, EVENT_BUS],
  },
  {
    provide: WF_EMPLOYEE_SERVICE,
    useFactory: (
      repository: EmployeeRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      departments: DepartmentRepository,
      positions: PositionRepository,
      events: EventBus,
    ) =>
      new EmployeeService({ repository, persons, organizations, departments, positions, events }),
    inject: [
      WF_EMPLOYEE_REPOSITORY,
      WF_PERSON_DIRECTORY,
      WF_ORGANIZATION_DIRECTORY,
      WF_DEPARTMENT_REPOSITORY,
      WF_POSITION_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: WF_CONTRACT_SERVICE,
    useFactory: (
      repository: EmploymentContractRepository,
      employees: EmployeeRepository,
      events: EventBus,
    ) => new EmploymentContractService({ repository, employees, events }),
    inject: [WF_CONTRACT_REPOSITORY, WF_EMPLOYEE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: WF_LEAVE_SERVICE,
    useFactory: (
      entitlements: LeaveEntitlementRepository,
      requests: LeaveRequestRepository,
      employees: EmployeeRepository,
      events: EventBus,
    ) => new LeaveService({ entitlements, requests, employees, events }),
    inject: [
      WF_LEAVE_ENTITLEMENT_REPOSITORY,
      WF_LEAVE_REQUEST_REPOSITORY,
      WF_EMPLOYEE_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: WF_REVIEW_SERVICE,
    useFactory: (
      repository: PerformanceReviewRepository,
      employees: EmployeeRepository,
      events: EventBus,
    ) => new PerformanceReviewService({ repository, employees, events }),
    inject: [WF_REVIEW_REPOSITORY, WF_EMPLOYEE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: WF_PROFILE_SERVICE,
    useFactory: (
      repository: WorkforceProfileRepository,
      employees: EmployeeRepository,
      entitlements: LeaveEntitlementRepository,
      requests: LeaveRequestRepository,
      reviews: PerformanceReviewRepository,
      events: EventBus,
    ) =>
      new WorkforceProfileService({
        repository,
        employees,
        entitlements,
        requests,
        reviews,
        events,
      }),
    inject: [
      WF_PROFILE_REPOSITORY,
      WF_EMPLOYEE_REPOSITORY,
      WF_LEAVE_ENTITLEMENT_REPOSITORY,
      WF_LEAVE_REQUEST_REPOSITORY,
      WF_REVIEW_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Workforce & Human Capital Platform (P2-D12) — the staff system of record, the HR analog of
 * Student Lifecycle. Follows the domain architecture pattern (ADR-0010): the pure
 * `@knowget/workforce` package (eight aggregates plus the leave-ledger and workforce-intelligence
 * engines) behind repository ports, Prisma/RLS adapters, application services on the platform event
 * bus, and permission-gated (`workforce:read`/`:write`), tenant-scoped REST controllers.
 * Organization (P2-D01-M01) and Person (P2-D01-M02) existence enter through injected directory
 * ports — an employee is a Person, never a duplicate identity. Compensation amounts are out of
 * scope (Finance, P2-D14); the workforce profile is descriptive only, never a prediction (P2-D28).
 * Exports every service token for cross-domain use.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    DepartmentController,
    PositionController,
    EmployeeController,
    EmploymentContractController,
    LeaveController,
    PerformanceReviewController,
    WorkforceProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    WF_DEPARTMENT_SERVICE,
    WF_POSITION_SERVICE,
    WF_EMPLOYEE_SERVICE,
    WF_CONTRACT_SERVICE,
    WF_LEAVE_SERVICE,
    WF_REVIEW_SERVICE,
    WF_PROFILE_SERVICE,
  ],
})
export class WorkforceModule {}
