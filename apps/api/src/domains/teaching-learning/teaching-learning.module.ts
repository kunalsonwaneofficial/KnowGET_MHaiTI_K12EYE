import type { ScheduleSlotService } from "@knowget/academic-scheduling";
import type {
  CurriculumFrameworkService,
  SectionService,
  SubjectService,
} from "@knowget/academic-structure";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { StudentService } from "@knowget/student-lifecycle";
import {
  AcademicPlanService,
  type AcademicPlanRepository,
  AssignmentService,
  type AssignmentRepository,
  ClassroomSessionService,
  type ClassroomSessionRepository,
  type CurriculumDirectory,
  InstructionalAnalyticsService,
  LearningEvidenceService,
  type LearningEvidenceRepository,
  LearningResourceService,
  type LearningResourceRepository,
  LessonPlanService,
  type LessonPlanRepository,
  type OrganizationDirectory,
  type ScheduleSlotDirectory,
  type SectionDirectory,
  type StudentDirectory,
  type SubjectDirectory,
  UnitPlanService,
  type UnitPlanRepository,
} from "@knowget/teaching-learning";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicSchedulingModule } from "../academic-scheduling/academic-scheduling.module";
import { SCHED_SLOT_SERVICE } from "../academic-scheduling/academic-scheduling.tokens";
import { AcademicStructureModule } from "../academic-structure/academic-structure.module";
import {
  AS_CURRICULUM_SERVICE,
  AS_SECTION_SERVICE,
  AS_SUBJECT_SERVICE,
} from "../academic-structure/academic-structure.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { AcademicPlanController } from "./academic-plan.controller";
import { AssignmentController } from "./assignment.controller";
import { ClassroomSessionController } from "./classroom-session.controller";
import {
  CurriculumServiceDirectory,
  OrganizationServiceDirectory,
  ScheduleSlotServiceDirectory,
  SectionServiceDirectory,
  StudentServiceDirectory,
  SubjectServiceDirectory,
} from "./directory.adapters";
import { InstructionalAnalyticsController } from "./instructional-analytics.controller";
import { LearningEvidenceController } from "./learning-evidence.controller";
import { LearningResourceController } from "./learning-resource.controller";
import { LessonPlanController } from "./lesson-plan.controller";
import { PrismaAcademicPlanRepository } from "./prisma-academic-plan.repository";
import { PrismaAssignmentRepository } from "./prisma-assignment.repository";
import { PrismaClassroomSessionRepository } from "./prisma-classroom-session.repository";
import { PrismaLearningEvidenceRepository } from "./prisma-learning-evidence.repository";
import { PrismaLearningResourceRepository } from "./prisma-learning-resource.repository";
import { PrismaLessonPlanRepository } from "./prisma-lesson-plan.repository";
import { PrismaUnitPlanRepository } from "./prisma-unit-plan.repository";
import { UnitPlanController } from "./unit-plan.controller";
import {
  TL_ACADEMIC_PLAN_REPOSITORY,
  TL_ACADEMIC_PLAN_SERVICE,
  TL_ANALYTICS_SERVICE,
  TL_ASSIGNMENT_REPOSITORY,
  TL_ASSIGNMENT_SERVICE,
  TL_CLASSROOM_SESSION_REPOSITORY,
  TL_CLASSROOM_SESSION_SERVICE,
  TL_CURRICULUM_DIRECTORY,
  TL_LEARNING_EVIDENCE_REPOSITORY,
  TL_LEARNING_EVIDENCE_SERVICE,
  TL_LEARNING_RESOURCE_REPOSITORY,
  TL_LEARNING_RESOURCE_SERVICE,
  TL_LESSON_PLAN_REPOSITORY,
  TL_LESSON_PLAN_SERVICE,
  TL_ORGANIZATION_DIRECTORY,
  TL_SCHEDULE_SLOT_DIRECTORY,
  TL_SECTION_DIRECTORY,
  TL_STUDENT_DIRECTORY,
  TL_SUBJECT_DIRECTORY,
  TL_UNIT_PLAN_REPOSITORY,
  TL_UNIT_PLAN_SERVICE,
} from "./teaching-learning.tokens";

const repositories: Provider[] = [
  {
    provide: TL_ACADEMIC_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcademicPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_UNIT_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaUnitPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_LESSON_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLessonPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_LEARNING_RESOURCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearningResourceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_CLASSROOM_SESSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaClassroomSessionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_ASSIGNMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssignmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: TL_LEARNING_EVIDENCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearningEvidenceRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: TL_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: TL_SUBJECT_DIRECTORY,
    useFactory: (subjects: SubjectService) => new SubjectServiceDirectory(subjects),
    inject: [AS_SUBJECT_SERVICE],
  },
  {
    provide: TL_SECTION_DIRECTORY,
    useFactory: (sections: SectionService) => new SectionServiceDirectory(sections),
    inject: [AS_SECTION_SERVICE],
  },
  {
    provide: TL_CURRICULUM_DIRECTORY,
    useFactory: (curricula: CurriculumFrameworkService) =>
      new CurriculumServiceDirectory(curricula),
    inject: [AS_CURRICULUM_SERVICE],
  },
  {
    provide: TL_SCHEDULE_SLOT_DIRECTORY,
    useFactory: (slots: ScheduleSlotService) => new ScheduleSlotServiceDirectory(slots),
    inject: [SCHED_SLOT_SERVICE],
  },
  {
    provide: TL_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: TL_ACADEMIC_PLAN_SERVICE,
    useFactory: (
      repository: AcademicPlanRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      events: EventBus,
    ) => new AcademicPlanService({ repository, organizations, subjects, events }),
    inject: [
      TL_ACADEMIC_PLAN_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_UNIT_PLAN_SERVICE,
    useFactory: (
      repository: UnitPlanRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      curricula: CurriculumDirectory,
      academicPlans: AcademicPlanRepository,
      events: EventBus,
    ) =>
      new UnitPlanService({
        repository,
        organizations,
        subjects,
        curricula,
        academicPlans,
        events,
      }),
    inject: [
      TL_UNIT_PLAN_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      TL_CURRICULUM_DIRECTORY,
      TL_ACADEMIC_PLAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_LESSON_PLAN_SERVICE,
    useFactory: (
      repository: LessonPlanRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      unitPlans: UnitPlanRepository,
      events: EventBus,
    ) => new LessonPlanService({ repository, organizations, subjects, unitPlans, events }),
    inject: [
      TL_LESSON_PLAN_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      TL_UNIT_PLAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_LEARNING_RESOURCE_SERVICE,
    useFactory: (
      repository: LearningResourceRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      events: EventBus,
    ) => new LearningResourceService({ repository, organizations, subjects, events }),
    inject: [
      TL_LEARNING_RESOURCE_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_CLASSROOM_SESSION_SERVICE,
    useFactory: (
      repository: ClassroomSessionRepository,
      organizations: OrganizationDirectory,
      scheduleSlots: ScheduleSlotDirectory,
      sections: SectionDirectory,
      subjects: SubjectDirectory,
      lessonPlans: LessonPlanRepository,
      events: EventBus,
    ) =>
      new ClassroomSessionService({
        repository,
        organizations,
        scheduleSlots,
        sections,
        subjects,
        lessonPlans,
        events,
      }),
    inject: [
      TL_CLASSROOM_SESSION_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SCHEDULE_SLOT_DIRECTORY,
      TL_SECTION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      TL_LESSON_PLAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_ASSIGNMENT_SERVICE,
    useFactory: (
      repository: AssignmentRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      sections: SectionDirectory,
      lessonPlans: LessonPlanRepository,
      students: StudentDirectory,
      events: EventBus,
    ) =>
      new AssignmentService({
        repository,
        organizations,
        subjects,
        sections,
        lessonPlans,
        students,
        events,
      }),
    inject: [
      TL_ASSIGNMENT_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      TL_SECTION_DIRECTORY,
      TL_LESSON_PLAN_REPOSITORY,
      TL_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_LEARNING_EVIDENCE_SERVICE,
    useFactory: (
      repository: LearningEvidenceRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      subjects: SubjectDirectory,
      lessonPlans: LessonPlanRepository,
      sessions: ClassroomSessionRepository,
      assignments: AssignmentRepository,
      events: EventBus,
    ) =>
      new LearningEvidenceService({
        repository,
        organizations,
        students,
        subjects,
        lessonPlans,
        sessions,
        assignments,
        events,
      }),
    inject: [
      TL_LEARNING_EVIDENCE_REPOSITORY,
      TL_ORGANIZATION_DIRECTORY,
      TL_STUDENT_DIRECTORY,
      TL_SUBJECT_DIRECTORY,
      TL_LESSON_PLAN_REPOSITORY,
      TL_CLASSROOM_SESSION_REPOSITORY,
      TL_ASSIGNMENT_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: TL_ANALYTICS_SERVICE,
    useFactory: (
      unitPlans: UnitPlanRepository,
      lessonPlans: LessonPlanRepository,
      sessions: ClassroomSessionRepository,
      assignments: AssignmentRepository,
    ) => new InstructionalAnalyticsService({ unitPlans, lessonPlans, sessions, assignments }),
    inject: [
      TL_UNIT_PLAN_REPOSITORY,
      TL_LESSON_PLAN_REPOSITORY,
      TL_CLASSROOM_SESSION_REPOSITORY,
      TL_ASSIGNMENT_REPOSITORY,
    ],
  },
];

/**
 * The Teaching, Learning & Instruction Intelligence Platform (P2-D09) — the authoritative
 * domain for planning, delivering, monitoring and continuously improving instruction. Follows
 * the domain architecture pattern (ADR-0010): the pure `@knowget/teaching-learning` package
 * (seven aggregates plus the instructional-intelligence engine) behind repository ports,
 * Prisma/RLS adapters, application services on the platform event bus, and permission-gated
 * (`teaching:read`/`:write`), tenant-scoped REST controllers. Organization, subject, section,
 * curriculum (Academic-Structure), schedule-slot (Academic-Scheduling) and student
 * (Student-Lifecycle) existence enter through injected directory ports. Every instructional
 * activity is traceable to curriculum outcomes; the analytics surface reads descriptive
 * indicators over the aggregates. Fourth contract of the Academic Excellence Platform program;
 * exports every service token.
 */
@Module({
  imports: [
    OrganizationModule,
    AcademicStructureModule,
    AcademicSchedulingModule,
    StudentLifecycleModule,
  ],
  controllers: [
    AcademicPlanController,
    UnitPlanController,
    LessonPlanController,
    LearningResourceController,
    ClassroomSessionController,
    AssignmentController,
    LearningEvidenceController,
    InstructionalAnalyticsController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    TL_ACADEMIC_PLAN_SERVICE,
    TL_UNIT_PLAN_SERVICE,
    TL_LESSON_PLAN_SERVICE,
    TL_LEARNING_RESOURCE_SERVICE,
    TL_CLASSROOM_SESSION_SERVICE,
    TL_ASSIGNMENT_SERVICE,
    TL_LEARNING_EVIDENCE_SERVICE,
    TL_ANALYTICS_SERVICE,
  ],
})
export class TeachingLearningModule {}
