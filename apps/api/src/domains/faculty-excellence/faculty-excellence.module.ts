import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  CoachingEngagementService,
  type CoachingEngagementRepository,
  CoachingSessionService,
  type CoachingSessionRepository,
  CompetencyFrameworkService,
  type CompetencyFrameworkRepository,
  DevelopmentGoalService,
  type DevelopmentGoalRepository,
  type DevelopmentRequirementRepository,
  DevelopmentService,
  type EmployeeDirectory,
  type FacultyProfileRepository,
  FacultyProfileService,
  type ObservationRepository,
  ObservationService,
  type OrganizationDirectory,
  type ProfessionalLearningActivityRepository,
} from "@knowget/faculty-excellence";
import type { OrganizationService } from "@knowget/organization";
import type { EmployeeService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { CoachingEngagementController } from "./coaching-engagement.controller";
import { CoachingSessionController } from "./coaching-session.controller";
import { CompetencyFrameworkController } from "./competency-framework.controller";
import { DevelopmentController } from "./development.controller";
import { DevelopmentGoalController } from "./development-goal.controller";
import { EmployeeServiceDirectory, OrganizationServiceDirectory } from "./directory.adapters";
import { FacultyProfileController } from "./faculty-profile.controller";
import {
  FE_ACTIVITY_REPOSITORY,
  FE_DEVELOPMENT_SERVICE,
  FE_EMPLOYEE_DIRECTORY,
  FE_ENGAGEMENT_REPOSITORY,
  FE_ENGAGEMENT_SERVICE,
  FE_FRAMEWORK_REPOSITORY,
  FE_FRAMEWORK_SERVICE,
  FE_GOAL_REPOSITORY,
  FE_GOAL_SERVICE,
  FE_OBSERVATION_REPOSITORY,
  FE_OBSERVATION_SERVICE,
  FE_ORGANIZATION_DIRECTORY,
  FE_PROFILE_REPOSITORY,
  FE_PROFILE_SERVICE,
  FE_REQUIREMENT_REPOSITORY,
  FE_SESSION_REPOSITORY,
  FE_SESSION_SERVICE,
} from "./faculty-excellence.tokens";
import { ObservationController } from "./observation.controller";
import { PrismaCoachingEngagementRepository } from "./prisma-coaching-engagement.repository";
import { PrismaCoachingSessionRepository } from "./prisma-coaching-session.repository";
import { PrismaCompetencyFrameworkRepository } from "./prisma-competency-framework.repository";
import { PrismaDevelopmentGoalRepository } from "./prisma-development-goal.repository";
import { PrismaDevelopmentRequirementRepository } from "./prisma-development-requirement.repository";
import { PrismaFacultyProfileRepository } from "./prisma-faculty-profile.repository";
import { PrismaObservationRepository } from "./prisma-observation.repository";
import { PrismaProfessionalLearningActivityRepository } from "./prisma-professional-learning-activity.repository";

const repositories: Provider[] = [
  {
    provide: FE_FRAMEWORK_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCompetencyFrameworkRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_OBSERVATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaObservationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_ENGAGEMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCoachingEngagementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_SESSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCoachingSessionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_REQUIREMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDevelopmentRequirementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_ACTIVITY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaProfessionalLearningActivityRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_GOAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDevelopmentGoalRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FE_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFacultyProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: FE_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: FE_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: FE_FRAMEWORK_SERVICE,
    useFactory: (
      repository: CompetencyFrameworkRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new CompetencyFrameworkService({ repository, organizations, events }),
    inject: [FE_FRAMEWORK_REPOSITORY, FE_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FE_OBSERVATION_SERVICE,
    useFactory: (
      repository: ObservationRepository,
      frameworks: CompetencyFrameworkRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new ObservationService({ repository, frameworks, employees, events }),
    inject: [FE_OBSERVATION_REPOSITORY, FE_FRAMEWORK_REPOSITORY, FE_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FE_ENGAGEMENT_SERVICE,
    useFactory: (
      repository: CoachingEngagementRepository,
      employees: EmployeeDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new CoachingEngagementService({ repository, employees, organizations, events }),
    inject: [FE_ENGAGEMENT_REPOSITORY, FE_EMPLOYEE_DIRECTORY, FE_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FE_SESSION_SERVICE,
    useFactory: (
      repository: CoachingSessionRepository,
      engagements: CoachingEngagementRepository,
      events: EventBus,
    ) => new CoachingSessionService({ repository, engagements, events }),
    inject: [FE_SESSION_REPOSITORY, FE_ENGAGEMENT_REPOSITORY, EVENT_BUS],
  },
  {
    provide: FE_DEVELOPMENT_SERVICE,
    useFactory: (
      requirements: DevelopmentRequirementRepository,
      activities: ProfessionalLearningActivityRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new DevelopmentService({ requirements, activities, employees, events }),
    inject: [FE_REQUIREMENT_REPOSITORY, FE_ACTIVITY_REPOSITORY, FE_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FE_GOAL_SERVICE,
    useFactory: (
      repository: DevelopmentGoalRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new DevelopmentGoalService({ repository, employees, events }),
    inject: [FE_GOAL_REPOSITORY, FE_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FE_PROFILE_SERVICE,
    useFactory: (
      repository: FacultyProfileRepository,
      employees: EmployeeDirectory,
      observations: ObservationRepository,
      goals: DevelopmentGoalRepository,
      requirements: DevelopmentRequirementRepository,
      activities: ProfessionalLearningActivityRepository,
      events: EventBus,
    ) =>
      new FacultyProfileService({
        repository,
        employees,
        observations,
        goals,
        requirements,
        activities,
        events,
      }),
    inject: [
      FE_PROFILE_REPOSITORY,
      FE_EMPLOYEE_DIRECTORY,
      FE_OBSERVATION_REPOSITORY,
      FE_GOAL_REPOSITORY,
      FE_REQUIREMENT_REPOSITORY,
      FE_ACTIVITY_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Faculty Excellence, Coaching & Professional Growth Platform (P2-D13) — the professional-
 * development system for staff, built on the workforce base (P2-D12). Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/faculty-excellence` package (eight aggregates
 * plus the development-ledger and faculty-growth engines) behind repository ports, Prisma/RLS
 * adapters, application services on the platform event bus, and permission-gated
 * (`faculty:read`/`:write`), tenant-scoped REST controllers. Organization (P2-D01-M01) and Employee
 * (P2-D12) existence enter through injected directory ports — a staff member is an Employee, never a
 * duplicate. Descriptive and explainable only; prediction is deferred to the intelligence core
 * (P2-D28). The second contract of Program C; exports every service token.
 */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    CompetencyFrameworkController,
    ObservationController,
    CoachingEngagementController,
    CoachingSessionController,
    DevelopmentController,
    DevelopmentGoalController,
    FacultyProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    FE_FRAMEWORK_SERVICE,
    FE_OBSERVATION_SERVICE,
    FE_ENGAGEMENT_SERVICE,
    FE_SESSION_SERVICE,
    FE_DEVELOPMENT_SERVICE,
    FE_GOAL_SERVICE,
    FE_PROFILE_SERVICE,
  ],
})
export class FacultyExcellenceModule {}
