import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import {
  type BedAllocationRepository,
  BedAllocationService,
  type EmployeeDirectory,
  type HostelInspectionRepository,
  HostelInspectionService,
  type HostelOccupancyProfileRepository,
  HostelOccupancyProfileService,
  type HostelRepository,
  HostelService,
  type OrganizationDirectory,
  type OutpassRepository,
  OutpassService,
  type RollCallRepository,
  RollCallService,
  type RoomRepository,
  RoomService,
  type StudentDirectory,
  type WardenRepository,
  WardenService,
} from "@knowget/residential";
import type { StudentService } from "@knowget/student-lifecycle";
import type { EmployeeService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { BedAllocationController } from "./bed-allocation.controller";
import {
  EmployeeServiceDirectory,
  OrganizationServiceDirectory,
  StudentServiceDirectory,
} from "./directory.adapters";
import { HostelController } from "./hostel.controller";
import { HostelInspectionController } from "./hostel-inspection.controller";
import { HostelOccupancyProfileController } from "./hostel-occupancy-profile.controller";
import { OutpassController } from "./outpass.controller";
import { PrismaBedAllocationRepository } from "./prisma-bed-allocation.repository";
import { PrismaHostelInspectionRepository } from "./prisma-hostel-inspection.repository";
import { PrismaHostelOccupancyProfileRepository } from "./prisma-hostel-occupancy-profile.repository";
import { PrismaHostelRepository } from "./prisma-hostel.repository";
import { PrismaOutpassRepository } from "./prisma-outpass.repository";
import { PrismaRollCallRepository } from "./prisma-roll-call.repository";
import { PrismaRoomRepository } from "./prisma-room.repository";
import { PrismaWardenRepository } from "./prisma-warden.repository";
import { RollCallController } from "./roll-call.controller";
import { RoomController } from "./room.controller";
import {
  RS_ALLOCATION_REPOSITORY,
  RS_ALLOCATION_SERVICE,
  RS_EMPLOYEE_DIRECTORY,
  RS_HOSTEL_REPOSITORY,
  RS_HOSTEL_SERVICE,
  RS_INSPECTION_REPOSITORY,
  RS_INSPECTION_SERVICE,
  RS_OCCUPANCY_REPOSITORY,
  RS_OCCUPANCY_SERVICE,
  RS_ORGANIZATION_DIRECTORY,
  RS_OUTPASS_REPOSITORY,
  RS_OUTPASS_SERVICE,
  RS_ROLL_CALL_REPOSITORY,
  RS_ROLL_CALL_SERVICE,
  RS_ROOM_REPOSITORY,
  RS_ROOM_SERVICE,
  RS_STUDENT_DIRECTORY,
  RS_WARDEN_REPOSITORY,
  RS_WARDEN_SERVICE,
} from "./residential.tokens";
import { WardenController } from "./warden.controller";

const repositories: Provider[] = [
  {
    provide: RS_HOSTEL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHostelRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_WARDEN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWardenRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_ROOM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRoomRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_ALLOCATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaBedAllocationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_OUTPASS_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaOutpassRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_ROLL_CALL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRollCallRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_INSPECTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHostelInspectionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RS_OCCUPANCY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHostelOccupancyProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: RS_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: RS_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
  {
    provide: RS_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: RS_HOSTEL_SERVICE,
    useFactory: (
      repository: HostelRepository,
      organizations: OrganizationDirectory,
      wardens: WardenRepository,
      events: EventBus,
    ) => new HostelService({ repository, organizations, wardens, events }),
    inject: [RS_HOSTEL_REPOSITORY, RS_ORGANIZATION_DIRECTORY, RS_WARDEN_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RS_WARDEN_SERVICE,
    useFactory: (repository: WardenRepository, employees: EmployeeDirectory, events: EventBus) =>
      new WardenService({ repository, employees, events }),
    inject: [RS_WARDEN_REPOSITORY, RS_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RS_ROOM_SERVICE,
    useFactory: (repository: RoomRepository, hostels: HostelRepository, events: EventBus) =>
      new RoomService({ repository, hostels, events }),
    inject: [RS_ROOM_REPOSITORY, RS_HOSTEL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RS_ALLOCATION_SERVICE,
    useFactory: (
      repository: BedAllocationRepository,
      rooms: RoomRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new BedAllocationService({ repository, rooms, students, events }),
    inject: [RS_ALLOCATION_REPOSITORY, RS_ROOM_REPOSITORY, RS_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RS_OUTPASS_SERVICE,
    useFactory: (
      repository: OutpassRepository,
      allocations: BedAllocationRepository,
      wardens: WardenRepository,
      events: EventBus,
    ) => new OutpassService({ repository, allocations, wardens, events }),
    inject: [RS_OUTPASS_REPOSITORY, RS_ALLOCATION_REPOSITORY, RS_WARDEN_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RS_ROLL_CALL_SERVICE,
    useFactory: (
      repository: RollCallRepository,
      hostels: HostelRepository,
      allocations: BedAllocationRepository,
      events: EventBus,
    ) => new RollCallService({ repository, hostels, allocations, events }),
    inject: [RS_ROLL_CALL_REPOSITORY, RS_HOSTEL_REPOSITORY, RS_ALLOCATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RS_INSPECTION_SERVICE,
    useFactory: (
      repository: HostelInspectionRepository,
      hostels: HostelRepository,
      events: EventBus,
    ) => new HostelInspectionService({ repository, hostels, events }),
    inject: [RS_INSPECTION_REPOSITORY, RS_HOSTEL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RS_OCCUPANCY_SERVICE,
    useFactory: (
      repository: HostelOccupancyProfileRepository,
      hostels: HostelRepository,
      rooms: RoomRepository,
      allocations: BedAllocationRepository,
      events: EventBus,
    ) => new HostelOccupancyProfileService({ repository, hostels, rooms, allocations, events }),
    inject: [
      RS_OCCUPANCY_REPOSITORY,
      RS_HOSTEL_REPOSITORY,
      RS_ROOM_REPOSITORY,
      RS_ALLOCATION_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Residential Life, Hostel & Boarding Platform (P2-D17) — the institution's boarding system of
 * record. Follows the domain architecture pattern (ADR-0010): the pure `@knowget/residential` package
 * (eight aggregates plus the occupancy and roll-call engines) behind repository ports, Prisma/RLS
 * adapters, application services on the platform event bus, and permission-gated, tenant-scoped REST
 * controllers. Money is deliberately absent (hostel/mess fees → Finance P2-D14; facility valuation/
 * maintenance → the Asset register P2-D15). `hostel:*` gates the physical plant and its people and
 * compliance (hostels, wardens, rooms, inspections); `boarding:*` gates the operations (allocations,
 * outpasses, roll calls, occupancy). Organization (P2-D01-M01), Employee (P2-D12) and Student (P2-D03)
 * existence enter through injected directory ports; the residential domain links to them and never
 * depends on their packages directly. The sixth contract of Program C; exports every service token.
 */
@Module({
  imports: [OrganizationModule, WorkforceModule, StudentLifecycleModule],
  controllers: [
    HostelController,
    WardenController,
    RoomController,
    HostelInspectionController,
    BedAllocationController,
    OutpassController,
    RollCallController,
    HostelOccupancyProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    RS_HOSTEL_SERVICE,
    RS_WARDEN_SERVICE,
    RS_ROOM_SERVICE,
    RS_ALLOCATION_SERVICE,
    RS_OUTPASS_SERVICE,
    RS_ROLL_CALL_SERVICE,
    RS_INSPECTION_SERVICE,
    RS_OCCUPANCY_SERVICE,
  ],
})
export class ResidentialModule {}
