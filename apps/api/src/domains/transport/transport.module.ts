import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { StudentService } from "@knowget/student-lifecycle";
import {
  type DriverRepository,
  DriverService,
  type EmployeeDirectory,
  type OrganizationDirectory,
  type RouteRepository,
  RouteService,
  type RouteUtilizationProfileRepository,
  RouteUtilizationProfileService,
  type StudentDirectory,
  type TransportSubscriptionRepository,
  TransportSubscriptionService,
  type TripRepository,
  TripService,
  type VehicleAssignmentRepository,
  VehicleAssignmentService,
  type VehicleDocumentRepository,
  VehicleDocumentService,
  type VehicleRepository,
  VehicleService,
} from "@knowget/transport";
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
import {
  EmployeeServiceDirectory,
  OrganizationServiceDirectory,
  StudentServiceDirectory,
} from "./directory.adapters";
import { DriverController } from "./driver.controller";
import { PrismaDriverRepository } from "./prisma-driver.repository";
import { PrismaRouteRepository } from "./prisma-route.repository";
import { PrismaRouteUtilizationProfileRepository } from "./prisma-route-utilization-profile.repository";
import { PrismaTransportSubscriptionRepository } from "./prisma-transport-subscription.repository";
import { PrismaTripRepository } from "./prisma-trip.repository";
import { PrismaVehicleAssignmentRepository } from "./prisma-vehicle-assignment.repository";
import { PrismaVehicleDocumentRepository } from "./prisma-vehicle-document.repository";
import { PrismaVehicleRepository } from "./prisma-vehicle.repository";
import { RouteController } from "./route.controller";
import { RouteUtilizationProfileController } from "./route-utilization-profile.controller";
import { TransportSubscriptionController } from "./transport-subscription.controller";
import {
  TR_ASSIGNMENT_REPOSITORY,
  TR_ASSIGNMENT_SERVICE,
  TR_DOCUMENT_REPOSITORY,
  TR_DOCUMENT_SERVICE,
  TR_DRIVER_REPOSITORY,
  TR_DRIVER_SERVICE,
  TR_EMPLOYEE_DIRECTORY,
  TR_ORGANIZATION_DIRECTORY,
  TR_ROUTE_REPOSITORY,
  TR_ROUTE_SERVICE,
  TR_STUDENT_DIRECTORY,
  TR_SUBSCRIPTION_REPOSITORY,
  TR_SUBSCRIPTION_SERVICE,
  TR_TRIP_REPOSITORY,
  TR_TRIP_SERVICE,
  TR_UTILIZATION_REPOSITORY,
  TR_UTILIZATION_SERVICE,
  TR_VEHICLE_REPOSITORY,
  TR_VEHICLE_SERVICE,
} from "./transport.tokens";
import { TripController } from "./trip.controller";
import { VehicleAssignmentController } from "./vehicle-assignment.controller";
import { VehicleController } from "./vehicle.controller";
import { VehicleDocumentController } from "./vehicle-document.controller";

const repositories: Provider[] = [
  {
    provide: TR_VEHICLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaVehicleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_DRIVER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDriverRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_ROUTE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRouteRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_ASSIGNMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaVehicleAssignmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_SUBSCRIPTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaTransportSubscriptionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_TRIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaTripRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_DOCUMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaVehicleDocumentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TR_UTILIZATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRouteUtilizationProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: TR_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: TR_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
  {
    provide: TR_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: TR_VEHICLE_SERVICE,
    useFactory: (
      repository: VehicleRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new VehicleService({ repository, organizations, events }),
    inject: [TR_VEHICLE_REPOSITORY, TR_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: TR_DRIVER_SERVICE,
    useFactory: (repository: DriverRepository, employees: EmployeeDirectory, events: EventBus) =>
      new DriverService({ repository, employees, events }),
    inject: [TR_DRIVER_REPOSITORY, TR_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: TR_ROUTE_SERVICE,
    useFactory: (
      repository: RouteRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new RouteService({ repository, organizations, events }),
    inject: [TR_ROUTE_REPOSITORY, TR_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: TR_ASSIGNMENT_SERVICE,
    useFactory: (
      repository: VehicleAssignmentRepository,
      routes: RouteRepository,
      vehicles: VehicleRepository,
      drivers: DriverRepository,
      events: EventBus,
    ) => new VehicleAssignmentService({ repository, routes, vehicles, drivers, events }),
    inject: [
      TR_ASSIGNMENT_REPOSITORY,
      TR_ROUTE_REPOSITORY,
      TR_VEHICLE_REPOSITORY,
      TR_DRIVER_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TR_SUBSCRIPTION_SERVICE,
    useFactory: (
      repository: TransportSubscriptionRepository,
      students: StudentDirectory,
      routes: RouteRepository,
      events: EventBus,
    ) => new TransportSubscriptionService({ repository, students, routes, events }),
    inject: [TR_SUBSCRIPTION_REPOSITORY, TR_STUDENT_DIRECTORY, TR_ROUTE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: TR_TRIP_SERVICE,
    useFactory: (
      repository: TripRepository,
      routes: RouteRepository,
      vehicles: VehicleRepository,
      drivers: DriverRepository,
      events: EventBus,
    ) => new TripService({ repository, routes, vehicles, drivers, events }),
    inject: [
      TR_TRIP_REPOSITORY,
      TR_ROUTE_REPOSITORY,
      TR_VEHICLE_REPOSITORY,
      TR_DRIVER_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TR_DOCUMENT_SERVICE,
    useFactory: (
      repository: VehicleDocumentRepository,
      vehicles: VehicleRepository,
      events: EventBus,
    ) => new VehicleDocumentService({ repository, vehicles, events }),
    inject: [TR_DOCUMENT_REPOSITORY, TR_VEHICLE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: TR_UTILIZATION_SERVICE,
    useFactory: (
      repository: RouteUtilizationProfileRepository,
      routes: RouteRepository,
      assignments: VehicleAssignmentRepository,
      vehicles: VehicleRepository,
      subscriptions: TransportSubscriptionRepository,
      events: EventBus,
    ) =>
      new RouteUtilizationProfileService({
        repository,
        routes,
        assignments,
        vehicles,
        subscriptions,
        events,
      }),
    inject: [
      TR_UTILIZATION_REPOSITORY,
      TR_ROUTE_REPOSITORY,
      TR_ASSIGNMENT_REPOSITORY,
      TR_VEHICLE_REPOSITORY,
      TR_SUBSCRIPTION_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Smart Mobility, Transport & Fleet Platform (P2-D16) — the institution's operational transport
 * system. Follows the domain architecture pattern (ADR-0010): the pure `@knowget/transport` package
 * (eight aggregates plus the route-schedule / seat-utilization and trip-occupancy engines) behind
 * repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers. Money is deliberately absent (transport fees →
 * Finance P2-D14; vehicle valuation/maintenance → the Asset register P2-D15). `fleet:*` gates the fleet
 * and its people and compliance (vehicles, drivers, documents); `transport:*` gates the operations
 * (routes, assignments, subscriptions, trips, utilization). Organization (P2-D01-M01), Employee (P2-D12)
 * and Student (P2-D03) existence enter through injected directory ports; the transport domain links to
 * them and never depends on their packages directly. The fifth contract of Program C; exports every
 * service token.
 */
@Module({
  imports: [OrganizationModule, WorkforceModule, StudentLifecycleModule],
  controllers: [
    VehicleController,
    DriverController,
    VehicleDocumentController,
    RouteController,
    VehicleAssignmentController,
    TransportSubscriptionController,
    TripController,
    RouteUtilizationProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    TR_VEHICLE_SERVICE,
    TR_DRIVER_SERVICE,
    TR_ROUTE_SERVICE,
    TR_ASSIGNMENT_SERVICE,
    TR_SUBSCRIPTION_SERVICE,
    TR_TRIP_SERVICE,
    TR_DOCUMENT_SERVICE,
    TR_UTILIZATION_SERVICE,
  ],
})
export class TransportModule {}
