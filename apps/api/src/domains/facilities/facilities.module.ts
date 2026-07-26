import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  type BuildingRepository,
  BuildingService,
  ComfortAssessmentService,
  type ComfortPolicyRepository,
  ComfortPolicyService,
  type EmployeeDirectory,
  type EnvironmentReadingRepository,
  EnvironmentReadingService,
  type FacilityProfileRepository,
  FacilityProfileService,
  type FacilitySystemRepository,
  FacilitySystemService,
  type MaintenanceOrderRepository,
  MaintenanceOrderService,
  type OrganizationDirectory,
  type SensorRepository,
  SensorService,
  type SpaceRepository,
  SpaceService,
} from "@knowget/facilities";
import type { OrganizationService } from "@knowget/organization";
import type { EmployeeService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { BuildingController } from "./building.controller";
import { ComfortAssessmentController } from "./comfort-assessment.controller";
import { ComfortPolicyController } from "./comfort-policy.controller";
import { EmployeeServiceDirectory, OrganizationServiceDirectory } from "./directory.adapters";
import { EnvironmentReadingController } from "./environment-reading.controller";
import {
  FAC_BUILDING_REPOSITORY,
  FAC_BUILDING_SERVICE,
  FAC_COMFORT_ASSESSMENT_SERVICE,
  FAC_EMPLOYEE_DIRECTORY,
  FAC_MAINTENANCE_REPOSITORY,
  FAC_MAINTENANCE_SERVICE,
  FAC_ORGANIZATION_DIRECTORY,
  FAC_POLICY_REPOSITORY,
  FAC_POLICY_SERVICE,
  FAC_PROFILE_REPOSITORY,
  FAC_PROFILE_SERVICE,
  FAC_READING_REPOSITORY,
  FAC_READING_SERVICE,
  FAC_SENSOR_REPOSITORY,
  FAC_SENSOR_SERVICE,
  FAC_SPACE_REPOSITORY,
  FAC_SPACE_SERVICE,
  FAC_SYSTEM_REPOSITORY,
  FAC_SYSTEM_SERVICE,
} from "./facilities.tokens";
import { FacilityProfileController } from "./facility-profile.controller";
import { FacilitySystemController } from "./facility-system.controller";
import { MaintenanceOrderController } from "./maintenance-order.controller";
import { PrismaBuildingRepository } from "./prisma-building.repository";
import { PrismaComfortPolicyRepository } from "./prisma-comfort-policy.repository";
import { PrismaEnvironmentReadingRepository } from "./prisma-environment-reading.repository";
import { PrismaFacilityProfileRepository } from "./prisma-facility-profile.repository";
import { PrismaFacilitySystemRepository } from "./prisma-facility-system.repository";
import { PrismaMaintenanceOrderRepository } from "./prisma-maintenance-order.repository";
import { PrismaSensorRepository } from "./prisma-sensor.repository";
import { PrismaSpaceRepository } from "./prisma-space.repository";
import { SensorController } from "./sensor.controller";
import { SpaceController } from "./space.controller";

const repositories: Provider[] = [
  {
    provide: FAC_BUILDING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaBuildingRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_SPACE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSpaceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_SYSTEM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFacilitySystemRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_SENSOR_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSensorRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_READING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEnvironmentReadingRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_MAINTENANCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMaintenanceOrderRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaComfortPolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FAC_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFacilityProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: FAC_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: FAC_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: FAC_BUILDING_SERVICE,
    useFactory: (
      repository: BuildingRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new BuildingService({ repository, organizations, events }),
    inject: [FAC_BUILDING_REPOSITORY, FAC_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FAC_SPACE_SERVICE,
    useFactory: (repository: SpaceRepository, buildings: BuildingRepository, events: EventBus) =>
      new SpaceService({ repository, buildings, events }),
    inject: [FAC_SPACE_REPOSITORY, FAC_BUILDING_REPOSITORY, EVENT_BUS],
  },
  {
    provide: FAC_SYSTEM_SERVICE,
    useFactory: (
      repository: FacilitySystemRepository,
      buildings: BuildingRepository,
      events: EventBus,
    ) => new FacilitySystemService({ repository, buildings, events }),
    inject: [FAC_SYSTEM_REPOSITORY, FAC_BUILDING_REPOSITORY, EVENT_BUS],
  },
  {
    provide: FAC_SENSOR_SERVICE,
    useFactory: (repository: SensorRepository, spaces: SpaceRepository, events: EventBus) =>
      new SensorService({ repository, spaces, events }),
    inject: [FAC_SENSOR_REPOSITORY, FAC_SPACE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: FAC_READING_SERVICE,
    useFactory: (
      repository: EnvironmentReadingRepository,
      sensors: SensorRepository,
      events: EventBus,
    ) => new EnvironmentReadingService({ repository, sensors, events }),
    inject: [FAC_READING_REPOSITORY, FAC_SENSOR_REPOSITORY, EVENT_BUS],
  },
  {
    provide: FAC_MAINTENANCE_SERVICE,
    useFactory: (
      repository: MaintenanceOrderRepository,
      buildings: BuildingRepository,
      spaces: SpaceRepository,
      systems: FacilitySystemRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new MaintenanceOrderService({ repository, buildings, spaces, systems, employees, events }),
    inject: [
      FAC_MAINTENANCE_REPOSITORY,
      FAC_BUILDING_REPOSITORY,
      FAC_SPACE_REPOSITORY,
      FAC_SYSTEM_REPOSITORY,
      FAC_EMPLOYEE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FAC_POLICY_SERVICE,
    useFactory: (
      repository: ComfortPolicyRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ComfortPolicyService({ repository, organizations, events }),
    inject: [FAC_POLICY_REPOSITORY, FAC_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FAC_PROFILE_SERVICE,
    useFactory: (
      repository: FacilityProfileRepository,
      buildings: BuildingRepository,
      spaces: SpaceRepository,
      systems: FacilitySystemRepository,
      maintenanceOrders: MaintenanceOrderRepository,
      events: EventBus,
    ) =>
      new FacilityProfileService({
        repository,
        buildings,
        spaces,
        systems,
        maintenanceOrders,
        events,
      }),
    inject: [
      FAC_PROFILE_REPOSITORY,
      FAC_BUILDING_REPOSITORY,
      FAC_SPACE_REPOSITORY,
      FAC_SYSTEM_REPOSITORY,
      FAC_MAINTENANCE_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FAC_COMFORT_ASSESSMENT_SERVICE,
    useFactory: (
      readings: EnvironmentReadingRepository,
      policies: ComfortPolicyRepository,
      spaces: SpaceRepository,
    ) => new ComfortAssessmentService({ readings, policies, spaces }),
    inject: [FAC_READING_REPOSITORY, FAC_POLICY_REPOSITORY, FAC_SPACE_REPOSITORY],
  },
];

/**
 * The Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20) — the institution's system of
 * record for its built environment and smart-environment telemetry. Follows the domain architecture pattern
 * (ADR-0010): the pure `@knowget/facilities` package (eight aggregates plus the building-condition and
 * comfort-index engines) behind repository ports, Prisma/RLS adapters, application services on the platform
 * event bus, and permission-gated, tenant-scoped REST controllers. Money is deliberately absent — asset
 * value and costed maintenance are Procurement & Assets' (P2-D15), utility billing is Finance's (P2-D14) —
 * and domain events carry no money, only ids, codes, types, statuses and counts. `facilities:*` gates the
 * built environment and its operational work (buildings, spaces, fixed systems, maintenance orders, the
 * per-building condition profile); `environment:*` gates the smart environment (sensors, telemetry readings,
 * comfort policies, the live comfort assessment). Organization (P2-D01-M01) and Employee (P2-D12, the
 * work-order assignees) existence enter through injected directory ports; the domain links to them and never
 * depends on their packages directly. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    BuildingController,
    SpaceController,
    FacilitySystemController,
    MaintenanceOrderController,
    FacilityProfileController,
    SensorController,
    EnvironmentReadingController,
    ComfortPolicyController,
    ComfortAssessmentController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    FAC_BUILDING_SERVICE,
    FAC_SPACE_SERVICE,
    FAC_SYSTEM_SERVICE,
    FAC_SENSOR_SERVICE,
    FAC_READING_SERVICE,
    FAC_MAINTENANCE_SERVICE,
    FAC_POLICY_SERVICE,
    FAC_PROFILE_SERVICE,
    FAC_COMFORT_ASSESSMENT_SERVICE,
  ],
})
export class FacilitiesModule {}
