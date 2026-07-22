import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  BehaviourRecordService,
  type BehaviourRecordRepository,
  CounsellingCaseService,
  type CounsellingCaseRepository,
  HealthRecordService,
  type HealthRecordRepository,
  InterventionPlanService,
  type InterventionPlanRepository,
  LearnerSupportPlanService,
  type LearnerSupportPlanRepository,
  type PersonDirectory,
  SafeguardingCaseService,
  type SafeguardingCaseRepository,
  type StudentDirectory,
  WellbeingProfileService,
  type WellbeingProfileRepository,
} from "@knowget/learner-wellbeing";
import type { PersonService } from "@knowget/person";
import type { StudentService } from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { BehaviourRecordController } from "./behaviour-record.controller";
import { CounsellingCaseController } from "./counselling-case.controller";
import { PersonServiceDirectory, StudentServiceDirectory } from "./directory.adapters";
import { HealthRecordController } from "./health-record.controller";
import { InterventionPlanController } from "./intervention-plan.controller";
import { LearnerSupportPlanController } from "./learner-support-plan.controller";
import { PrismaBehaviourRecordRepository } from "./prisma-behaviour-record.repository";
import { PrismaCounsellingCaseRepository } from "./prisma-counselling-case.repository";
import { PrismaHealthRecordRepository } from "./prisma-health-record.repository";
import { PrismaInterventionPlanRepository } from "./prisma-intervention-plan.repository";
import { PrismaLearnerSupportPlanRepository } from "./prisma-learner-support-plan.repository";
import { PrismaSafeguardingCaseRepository } from "./prisma-safeguarding-case.repository";
import { PrismaWellbeingProfileRepository } from "./prisma-wellbeing-profile.repository";
import { SafeguardingCaseController } from "./safeguarding-case.controller";
import { WellbeingProfileController } from "./wellbeing-profile.controller";
import {
  LW_BEHAVIOUR_RECORD_REPOSITORY,
  LW_BEHAVIOUR_RECORD_SERVICE,
  LW_COUNSELLING_CASE_REPOSITORY,
  LW_COUNSELLING_CASE_SERVICE,
  LW_HEALTH_RECORD_REPOSITORY,
  LW_HEALTH_RECORD_SERVICE,
  LW_INTERVENTION_PLAN_REPOSITORY,
  LW_INTERVENTION_PLAN_SERVICE,
  LW_PERSON_DIRECTORY,
  LW_SAFEGUARDING_CASE_REPOSITORY,
  LW_SAFEGUARDING_CASE_SERVICE,
  LW_STUDENT_DIRECTORY,
  LW_SUPPORT_PLAN_REPOSITORY,
  LW_SUPPORT_PLAN_SERVICE,
  LW_WELLBEING_PROFILE_REPOSITORY,
  LW_WELLBEING_PROFILE_SERVICE,
} from "./learner-wellbeing.tokens";

const repositories: Provider[] = [
  {
    provide: LW_WELLBEING_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWellbeingProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_HEALTH_RECORD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHealthRecordRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_BEHAVIOUR_RECORD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaBehaviourRecordRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_COUNSELLING_CASE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCounsellingCaseRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_SAFEGUARDING_CASE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSafeguardingCaseRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_SUPPORT_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearnerSupportPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LW_INTERVENTION_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaInterventionPlanRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: LW_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
  {
    provide: LW_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: LW_WELLBEING_PROFILE_SERVICE,
    useFactory: (repository: WellbeingProfileRepository, students: StudentDirectory) =>
      new WellbeingProfileService({ repository, students }),
    inject: [LW_WELLBEING_PROFILE_REPOSITORY, LW_STUDENT_DIRECTORY],
  },
  {
    provide: LW_HEALTH_RECORD_SERVICE,
    useFactory: (
      repository: HealthRecordRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new HealthRecordService({ repository, students, events }),
    inject: [LW_HEALTH_RECORD_REPOSITORY, LW_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LW_BEHAVIOUR_RECORD_SERVICE,
    useFactory: (
      repository: BehaviourRecordRepository,
      students: StudentDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new BehaviourRecordService({ repository, students, persons, events }),
    inject: [LW_BEHAVIOUR_RECORD_REPOSITORY, LW_STUDENT_DIRECTORY, LW_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LW_COUNSELLING_CASE_SERVICE,
    useFactory: (
      repository: CounsellingCaseRepository,
      students: StudentDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new CounsellingCaseService({ repository, students, persons, events }),
    inject: [LW_COUNSELLING_CASE_REPOSITORY, LW_STUDENT_DIRECTORY, LW_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LW_SAFEGUARDING_CASE_SERVICE,
    useFactory: (
      repository: SafeguardingCaseRepository,
      students: StudentDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new SafeguardingCaseService({ repository, students, persons, events }),
    inject: [LW_SAFEGUARDING_CASE_REPOSITORY, LW_STUDENT_DIRECTORY, LW_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LW_SUPPORT_PLAN_SERVICE,
    useFactory: (
      repository: LearnerSupportPlanRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new LearnerSupportPlanService({ repository, students, events }),
    inject: [LW_SUPPORT_PLAN_REPOSITORY, LW_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LW_INTERVENTION_PLAN_SERVICE,
    useFactory: (
      repository: InterventionPlanRepository,
      students: StudentDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new InterventionPlanService({ repository, students, persons, events }),
    inject: [LW_INTERVENTION_PLAN_REPOSITORY, LW_STUDENT_DIRECTORY, LW_PERSON_DIRECTORY, EVENT_BUS],
  },
];

/**
 * The Learner Wellbeing, Safety & Success Platform (P2-D05) — the authoritative domain
 * for a learner's physical, emotional, behavioural, psychological and social wellbeing:
 * the wellbeing profile, health record, behaviour record, counselling and safeguarding
 * cases, and learner support and intervention plans. Follows the domain architecture
 * pattern (ADR-0010): the pure `@knowget/learner-wellbeing` package behind repository
 * ports, Prisma/RLS adapters, application services on the platform event bus, and
 * REST controllers gated by fine-grained per-area permission scopes (wellbeing / health
 * / behaviour / counselling / safeguarding / support / intervention). Student (P2-D03)
 * and Person (P2-D01-M02) existence enter through injected directory ports — the Student
 * directory both validates the learner and supplies the organization — so the pure
 * package never depends on those domains; imports their modules.
 */
@Module({
  imports: [StudentLifecycleModule, PersonModule],
  controllers: [
    WellbeingProfileController,
    HealthRecordController,
    BehaviourRecordController,
    CounsellingCaseController,
    SafeguardingCaseController,
    LearnerSupportPlanController,
    InterventionPlanController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    LW_WELLBEING_PROFILE_SERVICE,
    LW_HEALTH_RECORD_SERVICE,
    LW_BEHAVIOUR_RECORD_SERVICE,
    LW_COUNSELLING_CASE_SERVICE,
    LW_SAFEGUARDING_CASE_SERVICE,
    LW_SUPPORT_PLAN_SERVICE,
    LW_INTERVENTION_PLAN_SERVICE,
  ],
})
export class LearnerWellbeingModule {}
