import type { SubjectService } from "@knowget/academic-structure";
import {
  AcademicRecordService,
  type AcademicRecordRepository,
  AssessmentAnalyticsService,
  AssessmentFrameworkService,
  type AssessmentFrameworkRepository,
  AssessmentPlanService,
  type AssessmentPlanRepository,
  AssessmentService,
  type AssessmentRepository,
  CompetencyProfileService,
  type CompetencyProfileRepository,
  EvaluationService,
  type EvaluationRepository,
  type OrganizationDirectory,
  QuestionBankService,
  type QuestionBankRepository,
  ReportingService,
  type StudentDirectory,
  type SubjectDirectory,
} from "@knowget/assessment-evaluation";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { StudentService } from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicStructureModule } from "../academic-structure/academic-structure.module";
import { AS_SUBJECT_SERVICE } from "../academic-structure/academic-structure.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { AcademicRecordController } from "./academic-record.controller";
import { AssessmentAnalyticsController } from "./assessment-analytics.controller";
import { AssessmentFrameworkController } from "./assessment-framework.controller";
import { AssessmentPlanController } from "./assessment-plan.controller";
import { AssessmentController } from "./assessment.controller";
import { CompetencyProfileController } from "./competency-profile.controller";
import {
  OrganizationServiceDirectory,
  StudentServiceDirectory,
  SubjectServiceDirectory,
} from "./directory.adapters";
import { EvaluationController } from "./evaluation.controller";
import { PrismaAcademicRecordRepository } from "./prisma-academic-record.repository";
import { PrismaAssessmentFrameworkRepository } from "./prisma-assessment-framework.repository";
import { PrismaAssessmentPlanRepository } from "./prisma-assessment-plan.repository";
import { PrismaAssessmentRepository } from "./prisma-assessment.repository";
import { PrismaCompetencyProfileRepository } from "./prisma-competency-profile.repository";
import { PrismaEvaluationRepository } from "./prisma-evaluation.repository";
import { PrismaQuestionBankRepository } from "./prisma-question-bank.repository";
import { QuestionBankController } from "./question-bank.controller";
import { ReportingController } from "./reporting.controller";
import {
  AE_ACADEMIC_RECORD_REPOSITORY,
  AE_ACADEMIC_RECORD_SERVICE,
  AE_ANALYTICS_SERVICE,
  AE_ASSESSMENT_REPOSITORY,
  AE_ASSESSMENT_SERVICE,
  AE_COMPETENCY_PROFILE_REPOSITORY,
  AE_COMPETENCY_PROFILE_SERVICE,
  AE_EVALUATION_REPOSITORY,
  AE_EVALUATION_SERVICE,
  AE_FRAMEWORK_REPOSITORY,
  AE_FRAMEWORK_SERVICE,
  AE_ORGANIZATION_DIRECTORY,
  AE_PLAN_REPOSITORY,
  AE_PLAN_SERVICE,
  AE_QUESTION_BANK_REPOSITORY,
  AE_QUESTION_BANK_SERVICE,
  AE_REPORTING_SERVICE,
  AE_STUDENT_DIRECTORY,
  AE_SUBJECT_DIRECTORY,
} from "./assessment-evaluation.tokens";

const repositories: Provider[] = [
  {
    provide: AE_FRAMEWORK_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssessmentFrameworkRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssessmentPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_ASSESSMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssessmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_QUESTION_BANK_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaQuestionBankRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_EVALUATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEvaluationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_COMPETENCY_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCompetencyProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AE_ACADEMIC_RECORD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcademicRecordRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AE_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: AE_SUBJECT_DIRECTORY,
    useFactory: (subjects: SubjectService) => new SubjectServiceDirectory(subjects),
    inject: [AS_SUBJECT_SERVICE],
  },
  {
    provide: AE_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AE_FRAMEWORK_SERVICE,
    useFactory: (repository: AssessmentFrameworkRepository, organizations: OrganizationDirectory) =>
      new AssessmentFrameworkService({ repository, organizations }),
    inject: [AE_FRAMEWORK_REPOSITORY, AE_ORGANIZATION_DIRECTORY],
  },
  {
    provide: AE_PLAN_SERVICE,
    useFactory: (
      repository: AssessmentPlanRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
    ) => new AssessmentPlanService({ repository, organizations, subjects }),
    inject: [AE_PLAN_REPOSITORY, AE_ORGANIZATION_DIRECTORY, AE_SUBJECT_DIRECTORY],
  },
  {
    provide: AE_ASSESSMENT_SERVICE,
    useFactory: (
      repository: AssessmentRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
      frameworks: AssessmentFrameworkRepository,
      plans: AssessmentPlanRepository,
      events: EventBus,
    ) => new AssessmentService({ repository, organizations, subjects, frameworks, plans, events }),
    inject: [
      AE_ASSESSMENT_REPOSITORY,
      AE_ORGANIZATION_DIRECTORY,
      AE_SUBJECT_DIRECTORY,
      AE_FRAMEWORK_REPOSITORY,
      AE_PLAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AE_QUESTION_BANK_SERVICE,
    useFactory: (
      repository: QuestionBankRepository,
      organizations: OrganizationDirectory,
      subjects: SubjectDirectory,
    ) => new QuestionBankService({ repository, organizations, subjects }),
    inject: [AE_QUESTION_BANK_REPOSITORY, AE_ORGANIZATION_DIRECTORY, AE_SUBJECT_DIRECTORY],
  },
  {
    provide: AE_EVALUATION_SERVICE,
    useFactory: (
      repository: EvaluationRepository,
      assessments: AssessmentRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new EvaluationService({ repository, assessments, students, events }),
    inject: [AE_EVALUATION_REPOSITORY, AE_ASSESSMENT_REPOSITORY, AE_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AE_COMPETENCY_PROFILE_SERVICE,
    useFactory: (
      repository: CompetencyProfileRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new CompetencyProfileService({ repository, organizations, students, events }),
    inject: [
      AE_COMPETENCY_PROFILE_REPOSITORY,
      AE_ORGANIZATION_DIRECTORY,
      AE_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AE_ACADEMIC_RECORD_SERVICE,
    useFactory: (
      repository: AcademicRecordRepository,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new AcademicRecordService({ repository, organizations, students, events }),
    inject: [
      AE_ACADEMIC_RECORD_REPOSITORY,
      AE_ORGANIZATION_DIRECTORY,
      AE_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AE_REPORTING_SERVICE,
    useFactory: (
      academicRecords: AcademicRecordRepository,
      competencyProfiles: CompetencyProfileRepository,
      events: EventBus,
    ) => new ReportingService({ academicRecords, competencyProfiles, events }),
    inject: [AE_ACADEMIC_RECORD_REPOSITORY, AE_COMPETENCY_PROFILE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AE_ANALYTICS_SERVICE,
    useFactory: (
      assessments: AssessmentRepository,
      evaluations: EvaluationRepository,
      competencyProfiles: CompetencyProfileRepository,
    ) => new AssessmentAnalyticsService({ assessments, evaluations, competencyProfiles }),
    inject: [AE_ASSESSMENT_REPOSITORY, AE_EVALUATION_REPOSITORY, AE_COMPETENCY_PROFILE_REPOSITORY],
  },
];

/**
 * The Assessment & Evaluation Platform (P2-D10) — the authoritative domain for assessment design,
 * marking, competency mastery, academic records, reporting and analytics. Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/assessment-evaluation` package (seven
 * aggregates plus the grading and assessment-intelligence engines) behind repository ports,
 * Prisma/RLS adapters, application services on the platform event bus, and permission-gated
 * (`assessment:read`/`:write`), tenant-scoped REST controllers. Organization, subject
 * (Academic-Structure) and student (Student-Lifecycle) existence enter through injected directory
 * ports. Grades flow through one pure grading engine; competency mastery is tracked independently
 * of raw marks; published academic records are immutable except through the reasoned amendment
 * workflow. Fifth contract of the Academic Excellence Platform program; exports every service token.
 */
@Module({
  imports: [OrganizationModule, AcademicStructureModule, StudentLifecycleModule],
  controllers: [
    AssessmentFrameworkController,
    AssessmentPlanController,
    AssessmentController,
    QuestionBankController,
    EvaluationController,
    CompetencyProfileController,
    AcademicRecordController,
    ReportingController,
    AssessmentAnalyticsController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AE_FRAMEWORK_SERVICE,
    AE_PLAN_SERVICE,
    AE_ASSESSMENT_SERVICE,
    AE_QUESTION_BANK_SERVICE,
    AE_EVALUATION_SERVICE,
    AE_COMPETENCY_PROFILE_SERVICE,
    AE_ACADEMIC_RECORD_SERVICE,
    AE_REPORTING_SERVICE,
    AE_ANALYTICS_SERVICE,
  ],
})
export class AssessmentEvaluationModule {}
