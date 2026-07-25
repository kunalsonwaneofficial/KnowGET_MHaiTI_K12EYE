import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  CohortInsightService,
  type CohortInsightRepository,
  EarlyWarningService,
  type EarlyWarningRepository,
  EducationalInsightService,
  type EducationalInsightRepository,
  GrowthPlanService,
  type GrowthPlanRepository,
  LearnerInsightProfileService,
  type LearnerInsightProfileRepository,
  LearningSignalService,
  type LearningSignalRepository,
  type OrganizationDirectory,
  RecommendationService,
  type RecommendationRepository,
  type StudentDirectory,
} from "@knowget/learning-intelligence";
import type { OrganizationService } from "@knowget/organization";
import type { StudentService } from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { CohortInsightController } from "./cohort-insight.controller";
import { OrganizationServiceDirectory, StudentServiceDirectory } from "./directory.adapters";
import { EarlyWarningController } from "./early-warning.controller";
import { EducationalInsightController } from "./educational-insight.controller";
import { GrowthPlanController } from "./growth-plan.controller";
import { LearnerInsightProfileController } from "./learner-insight-profile.controller";
import { LearningSignalController } from "./learning-signal.controller";
import { PrismaCohortInsightRepository } from "./prisma-cohort-insight.repository";
import { PrismaEarlyWarningRepository } from "./prisma-early-warning.repository";
import { PrismaEducationalInsightRepository } from "./prisma-educational-insight.repository";
import { PrismaGrowthPlanRepository } from "./prisma-growth-plan.repository";
import { PrismaLearnerInsightProfileRepository } from "./prisma-learner-insight-profile.repository";
import { PrismaLearningSignalRepository } from "./prisma-learning-signal.repository";
import { PrismaRecommendationRepository } from "./prisma-recommendation.repository";
import { RecommendationController } from "./recommendation.controller";
import {
  LI_COHORT_REPOSITORY,
  LI_COHORT_SERVICE,
  LI_EARLY_WARNING_REPOSITORY,
  LI_EARLY_WARNING_SERVICE,
  LI_GROWTH_PLAN_REPOSITORY,
  LI_GROWTH_PLAN_SERVICE,
  LI_INSIGHT_REPOSITORY,
  LI_INSIGHT_SERVICE,
  LI_ORGANIZATION_DIRECTORY,
  LI_PROFILE_REPOSITORY,
  LI_PROFILE_SERVICE,
  LI_RECOMMENDATION_REPOSITORY,
  LI_RECOMMENDATION_SERVICE,
  LI_SIGNAL_REPOSITORY,
  LI_SIGNAL_SERVICE,
  LI_STUDENT_DIRECTORY,
} from "./learning-intelligence.tokens";

const repositories: Provider[] = [
  {
    provide: LI_SIGNAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearningSignalRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearnerInsightProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_EARLY_WARNING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEarlyWarningRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_INSIGHT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEducationalInsightRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_RECOMMENDATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRecommendationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_GROWTH_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGrowthPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LI_COHORT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCohortInsightRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: LI_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: LI_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: LI_SIGNAL_SERVICE,
    useFactory: (
      repository: LearningSignalRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new LearningSignalService({ repository, organizations, students, events }),
    inject: [LI_SIGNAL_REPOSITORY, LI_ORGANIZATION_DIRECTORY, LI_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LI_PROFILE_SERVICE,
    useFactory: (
      repository: LearnerInsightProfileRepository,
      signals: LearningSignalRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new LearnerInsightProfileService({ repository, signals, organizations, students, events }),
    inject: [
      LI_PROFILE_REPOSITORY,
      LI_SIGNAL_REPOSITORY,
      LI_ORGANIZATION_DIRECTORY,
      LI_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: LI_EARLY_WARNING_SERVICE,
    useFactory: (
      repository: EarlyWarningRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new EarlyWarningService({ repository, organizations, students, events }),
    inject: [
      LI_EARLY_WARNING_REPOSITORY,
      LI_ORGANIZATION_DIRECTORY,
      LI_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: LI_INSIGHT_SERVICE,
    useFactory: (
      repository: EducationalInsightRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new EducationalInsightService({ repository, organizations, students, events }),
    inject: [LI_INSIGHT_REPOSITORY, LI_ORGANIZATION_DIRECTORY, LI_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LI_RECOMMENDATION_SERVICE,
    useFactory: (
      repository: RecommendationRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new RecommendationService({ repository, organizations, students, events }),
    inject: [
      LI_RECOMMENDATION_REPOSITORY,
      LI_ORGANIZATION_DIRECTORY,
      LI_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: LI_GROWTH_PLAN_SERVICE,
    useFactory: (
      repository: GrowthPlanRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new GrowthPlanService({ repository, organizations, students, events }),
    inject: [LI_GROWTH_PLAN_REPOSITORY, LI_ORGANIZATION_DIRECTORY, LI_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LI_COHORT_SERVICE,
    useFactory: (
      repository: CohortInsightRepository,
      profiles: LearnerInsightProfileRepository,
      organizations: OrganizationDirectory,
    ) => new CohortInsightService({ repository, profiles, organizations }),
    inject: [LI_COHORT_REPOSITORY, LI_PROFILE_REPOSITORY, LI_ORGANIZATION_DIRECTORY],
  },
];

/**
 * The Learning Intelligence & Educational Insights Platform (P2-D11) — the capstone academic
 * domain that synthesizes the upstream domains' descriptive indicators into unified learner
 * intelligence and explainable educational insights. Follows the domain architecture pattern
 * (ADR-0010): the pure `@knowget/learning-intelligence` package (seven aggregates plus the
 * synthesis, early-warning and cohort-rollup engines) behind repository ports, Prisma/RLS
 * adapters, application services on the platform event bus, and permission-gated
 * (`insight:read`/`:write`), tenant-scoped REST controllers. Organization (P2-D01-M01) and student
 * (Student-Lifecycle) existence enter through injected directory ports; upstream evidence is
 * referenced, not recomputed. Descriptive and explainable only — ML prediction is a non-goal
 * (deferred to the intelligence core, P2-D28). Sixth and final contract of the Academic Excellence
 * Platform program; exports every service token.
 */
@Module({
  imports: [OrganizationModule, StudentLifecycleModule],
  controllers: [
    LearningSignalController,
    LearnerInsightProfileController,
    EarlyWarningController,
    EducationalInsightController,
    RecommendationController,
    GrowthPlanController,
    CohortInsightController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    LI_SIGNAL_SERVICE,
    LI_PROFILE_SERVICE,
    LI_EARLY_WARNING_SERVICE,
    LI_INSIGHT_SERVICE,
    LI_RECOMMENDATION_SERVICE,
    LI_GROWTH_PLAN_SERVICE,
    LI_COHORT_SERVICE,
  ],
})
export class LearningIntelligenceModule {}
