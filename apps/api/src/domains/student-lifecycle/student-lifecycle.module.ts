import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { MembershipService } from "@knowget/membership";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import {
  ApplicantService,
  EducationalJourneyService,
  IntelligenceProfileService,
  ProspectService,
  StudentService,
  TimelineService,
  type ApplicantRepository,
  type EducationalJourneyRepository,
  type IntelligenceProfileRepository,
  type MembershipDirectory,
  type OrganizationDirectory,
  type PersonDirectory,
  type ProspectRepository,
  type StudentRepository,
  type TimelineRepository,
} from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { MembershipModule } from "../membership/membership.module";
import { MEMBERSHIP_SERVICE } from "../membership/membership.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { ApplicantController } from "./applicant.controller";
import {
  MembershipServiceDirectory,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
} from "./directory.adapters";
import { EducationalJourneyController } from "./educational-journey.controller";
import { IntelligenceProfileController } from "./intelligence-profile.controller";
import { PrismaStudentApplicantRepository } from "./prisma-student-applicant.repository";
import { PrismaStudentIntelligenceRepository } from "./prisma-student-intelligence.repository";
import { PrismaStudentJourneyRepository } from "./prisma-student-journey.repository";
import { PrismaStudentProspectRepository } from "./prisma-student-prospect.repository";
import { PrismaStudentRepository } from "./prisma-student.repository";
import { PrismaStudentTimelineRepository } from "./prisma-student-timeline.repository";
import { ProspectController } from "./prospect.controller";
import { StudentController } from "./student.controller";
import {
  STUDENT_APPLICANT_REPOSITORY,
  STUDENT_APPLICANT_SERVICE,
  STUDENT_INTELLIGENCE_REPOSITORY,
  STUDENT_INTELLIGENCE_SERVICE,
  STUDENT_JOURNEY_REPOSITORY,
  STUDENT_JOURNEY_SERVICE,
  STUDENT_MEMBERSHIP_DIRECTORY,
  STUDENT_ORGANIZATION_DIRECTORY,
  STUDENT_PERSON_DIRECTORY,
  STUDENT_PROSPECT_REPOSITORY,
  STUDENT_PROSPECT_SERVICE,
  STUDENT_REPOSITORY,
  STUDENT_SERVICE,
  STUDENT_TIMELINE_REPOSITORY,
  STUDENT_TIMELINE_SERVICE,
} from "./student-lifecycle.tokens";
import { TimelineController } from "./timeline.controller";

const repositories: Provider[] = [
  {
    provide: STUDENT_PROSPECT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentProspectRepository(db),
    inject: [DATABASE],
  },
  {
    provide: STUDENT_APPLICANT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentApplicantRepository(db),
    inject: [DATABASE],
  },
  {
    provide: STUDENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: STUDENT_JOURNEY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentJourneyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: STUDENT_INTELLIGENCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentIntelligenceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: STUDENT_TIMELINE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentTimelineRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: STUDENT_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: STUDENT_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: STUDENT_MEMBERSHIP_DIRECTORY,
    useFactory: (memberships: MembershipService) => new MembershipServiceDirectory(memberships),
    inject: [MEMBERSHIP_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: STUDENT_PROSPECT_SERVICE,
    useFactory: (
      repository: ProspectRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ProspectService({ repository, persons, organizations, events }),
    inject: [
      STUDENT_PROSPECT_REPOSITORY,
      STUDENT_PERSON_DIRECTORY,
      STUDENT_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: STUDENT_APPLICANT_SERVICE,
    useFactory: (
      repository: ApplicantRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ApplicantService({ repository, persons, organizations, events }),
    inject: [
      STUDENT_APPLICANT_REPOSITORY,
      STUDENT_PERSON_DIRECTORY,
      STUDENT_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: STUDENT_SERVICE,
    useFactory: (
      repository: StudentRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      memberships: MembershipDirectory,
      events: EventBus,
    ) => new StudentService({ repository, persons, organizations, memberships, events }),
    inject: [
      STUDENT_REPOSITORY,
      STUDENT_PERSON_DIRECTORY,
      STUDENT_ORGANIZATION_DIRECTORY,
      STUDENT_MEMBERSHIP_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: STUDENT_JOURNEY_SERVICE,
    useFactory: (repository: EducationalJourneyRepository, students: StudentRepository) =>
      new EducationalJourneyService({ repository, students }),
    inject: [STUDENT_JOURNEY_REPOSITORY, STUDENT_REPOSITORY],
  },
  {
    provide: STUDENT_INTELLIGENCE_SERVICE,
    useFactory: (repository: IntelligenceProfileRepository, students: StudentRepository) =>
      new IntelligenceProfileService({ repository, students }),
    inject: [STUDENT_INTELLIGENCE_REPOSITORY, STUDENT_REPOSITORY],
  },
  {
    provide: STUDENT_TIMELINE_SERVICE,
    useFactory: (repository: TimelineRepository, students: StudentRepository) =>
      new TimelineService({ repository, students }),
    inject: [STUDENT_TIMELINE_REPOSITORY, STUDENT_REPOSITORY],
  },
];

/**
 * The Student Lifecycle Intelligence Platform (P2-D03) — the authoritative domain for
 * a learner's institutional journey (prospect → applicant → student → alumni), plus
 * the educational journey, intelligence profile and permanent timeline. Follows the
 * domain architecture pattern (ADR-0010): the pure `@knowget/student-lifecycle`
 * package behind repository ports, Prisma/RLS adapters, application services on the
 * platform event bus, and permission-gated REST controllers. Person, Organization and
 * Membership existence enter through injected directory ports; imports their modules.
 */
@Module({
  imports: [OrganizationModule, PersonModule, MembershipModule],
  controllers: [
    ProspectController,
    ApplicantController,
    StudentController,
    EducationalJourneyController,
    IntelligenceProfileController,
    TimelineController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    STUDENT_PROSPECT_SERVICE,
    STUDENT_APPLICANT_SERVICE,
    STUDENT_SERVICE,
    STUDENT_JOURNEY_SERVICE,
    STUDENT_INTELLIGENCE_SERVICE,
    STUDENT_TIMELINE_SERVICE,
  ],
})
export class StudentLifecycleModule {}
