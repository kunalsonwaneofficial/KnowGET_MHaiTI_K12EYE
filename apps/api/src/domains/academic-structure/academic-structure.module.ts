import {
  AcademicCalendarService,
  type AcademicCalendarRepository,
  AcademicClassService,
  type AcademicClassRepository,
  AcademicProgramService,
  type AcademicProgramRepository,
  CurriculumFrameworkService,
  type CurriculumFrameworkRepository,
  GradeService,
  type GradeRepository,
  LearningOutcomeService,
  type LearningOutcomeRepository,
  type OrganizationDirectory,
  SectionService,
  type SectionRepository,
  SubjectService,
  type SubjectRepository,
} from "@knowget/academic-structure";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { AcademicCalendarController } from "./academic-calendar.controller";
import { AcademicClassController } from "./academic-class.controller";
import { AcademicProgramController } from "./academic-program.controller";
import {
  AS_CALENDAR_REPOSITORY,
  AS_CALENDAR_SERVICE,
  AS_CLASS_REPOSITORY,
  AS_CLASS_SERVICE,
  AS_CURRICULUM_REPOSITORY,
  AS_CURRICULUM_SERVICE,
  AS_GRADE_REPOSITORY,
  AS_GRADE_SERVICE,
  AS_LEARNING_OUTCOME_REPOSITORY,
  AS_LEARNING_OUTCOME_SERVICE,
  AS_ORGANIZATION_DIRECTORY,
  AS_PROGRAM_REPOSITORY,
  AS_PROGRAM_SERVICE,
  AS_SECTION_REPOSITORY,
  AS_SECTION_SERVICE,
  AS_SUBJECT_REPOSITORY,
  AS_SUBJECT_SERVICE,
} from "./academic-structure.tokens";
import { CurriculumFrameworkController } from "./curriculum-framework.controller";
import { OrganizationServiceDirectory } from "./directory.adapters";
import { GradeController } from "./grade.controller";
import { LearningOutcomeController } from "./learning-outcome.controller";
import { PrismaAcademicCalendarRepository } from "./prisma-academic-calendar.repository";
import { PrismaAcademicClassRepository } from "./prisma-academic-class.repository";
import { PrismaAcademicProgramRepository } from "./prisma-academic-program.repository";
import { PrismaCurriculumFrameworkRepository } from "./prisma-curriculum-framework.repository";
import { PrismaGradeRepository } from "./prisma-grade.repository";
import { PrismaLearningOutcomeRepository } from "./prisma-learning-outcome.repository";
import { PrismaSectionRepository } from "./prisma-section.repository";
import { PrismaSubjectRepository } from "./prisma-subject.repository";
import { SectionController } from "./section.controller";
import { SubjectController } from "./subject.controller";

const repositories: Provider[] = [
  {
    provide: AS_CALENDAR_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcademicCalendarRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_PROGRAM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcademicProgramRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_CURRICULUM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCurriculumFrameworkRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_GRADE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGradeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_CLASS_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcademicClassRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_SECTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSectionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_SUBJECT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSubjectRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AS_LEARNING_OUTCOME_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLearningOutcomeRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AS_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AS_CALENDAR_SERVICE,
    useFactory: (
      repository: AcademicCalendarRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AcademicCalendarService({ repository, organizations, events }),
    inject: [AS_CALENDAR_REPOSITORY, AS_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AS_PROGRAM_SERVICE,
    useFactory: (repository: AcademicProgramRepository, organizations: OrganizationDirectory) =>
      new AcademicProgramService({ repository, organizations }),
    inject: [AS_PROGRAM_REPOSITORY, AS_ORGANIZATION_DIRECTORY],
  },
  {
    provide: AS_CURRICULUM_SERVICE,
    useFactory: (
      repository: CurriculumFrameworkRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new CurriculumFrameworkService({ repository, organizations, events }),
    inject: [AS_CURRICULUM_REPOSITORY, AS_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AS_GRADE_SERVICE,
    useFactory: (
      repository: GradeRepository,
      programs: AcademicProgramRepository,
      events: EventBus,
    ) => new GradeService({ repository, programs, events }),
    inject: [AS_GRADE_REPOSITORY, AS_PROGRAM_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AS_CLASS_SERVICE,
    useFactory: (
      repository: AcademicClassRepository,
      grades: GradeRepository,
      curricula: CurriculumFrameworkRepository,
      events: EventBus,
    ) => new AcademicClassService({ repository, grades, curricula, events }),
    inject: [AS_CLASS_REPOSITORY, AS_GRADE_REPOSITORY, AS_CURRICULUM_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AS_SECTION_SERVICE,
    useFactory: (
      repository: SectionRepository,
      classes: AcademicClassRepository,
      events: EventBus,
    ) => new SectionService({ repository, classes, events }),
    inject: [AS_SECTION_REPOSITORY, AS_CLASS_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AS_SUBJECT_SERVICE,
    useFactory: (
      repository: SubjectRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new SubjectService({ repository, organizations, events }),
    inject: [AS_SUBJECT_REPOSITORY, AS_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AS_LEARNING_OUTCOME_SERVICE,
    useFactory: (
      repository: LearningOutcomeRepository,
      subjects: SubjectRepository,
      curricula: CurriculumFrameworkRepository,
      events: EventBus,
    ) => new LearningOutcomeService({ repository, subjects, curricula, events }),
    inject: [
      AS_LEARNING_OUTCOME_REPOSITORY,
      AS_SUBJECT_REPOSITORY,
      AS_CURRICULUM_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Academic Structure & Curriculum Platform (P2-D06) — the authoritative source for an
 * institution's academic organization: academic calendars, programs, curriculum
 * frameworks, grades, classes, sections, subjects and learning outcomes. Follows the
 * domain architecture pattern (ADR-0010): the pure `@knowget/academic-structure` package
 * behind repository ports, Prisma/RLS adapters, application services on the platform event
 * bus, and permission-gated (`academic:read`/`:write`), tenant-scoped REST controllers.
 * Organization existence enters through an injected directory port; grades, classes,
 * sections and outcomes derive their organization from their parent aggregate via the
 * shared repositories, so the academic hierarchy is validated without re-modelling. The
 * first contract of the Academic Excellence Platform program; exports every service token.
 */
@Module({
  imports: [OrganizationModule],
  controllers: [
    AcademicCalendarController,
    AcademicProgramController,
    CurriculumFrameworkController,
    GradeController,
    AcademicClassController,
    SectionController,
    SubjectController,
    LearningOutcomeController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AS_CALENDAR_SERVICE,
    AS_PROGRAM_SERVICE,
    AS_CURRICULUM_SERVICE,
    AS_GRADE_SERVICE,
    AS_CLASS_SERVICE,
    AS_SECTION_SERVICE,
    AS_SUBJECT_SERVICE,
    AS_LEARNING_OUTCOME_SERVICE,
  ],
})
export class AcademicStructureModule {}
