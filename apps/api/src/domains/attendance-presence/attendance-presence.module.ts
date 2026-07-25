import type { ScheduleSlotService } from "@knowget/academic-scheduling";
import type { SectionService, SubjectService } from "@knowget/academic-structure";
import {
  AttendanceEvaluationService,
  type AttendancePolicyRepository,
  AttendancePolicyService,
  type AttendanceRecordRepository,
  AttendanceRecordService,
  type AttendanceSessionRepository,
  AttendanceSessionService,
  type LeaveRepository,
  LeaveService,
  type OrganizationDirectory,
  type ParticipantDirectory,
  type ParticipationRepository,
  ParticipationService,
  type PresenceProfileRepository,
  PresenceProfileService,
  type ScheduleSlotDirectory,
  type SectionDirectory,
  type SubjectDirectory,
} from "@knowget/attendance-presence";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicSchedulingModule } from "../academic-scheduling/academic-scheduling.module";
import { SCHED_SLOT_SERVICE } from "../academic-scheduling/academic-scheduling.tokens";
import { AcademicStructureModule } from "../academic-structure/academic-structure.module";
import {
  AS_SECTION_SERVICE,
  AS_SUBJECT_SERVICE,
} from "../academic-structure/academic-structure.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { AttendanceAnalyticsController } from "./attendance-analytics.controller";
import { AttendancePolicyController } from "./attendance-policy.controller";
import {
  AP_EVALUATION_SERVICE,
  AP_LEAVE_REPOSITORY,
  AP_LEAVE_SERVICE,
  AP_ORGANIZATION_DIRECTORY,
  AP_PARTICIPANT_DIRECTORY,
  AP_PARTICIPATION_REPOSITORY,
  AP_PARTICIPATION_SERVICE,
  AP_POLICY_REPOSITORY,
  AP_POLICY_SERVICE,
  AP_PROFILE_REPOSITORY,
  AP_PROFILE_SERVICE,
  AP_RECORD_REPOSITORY,
  AP_RECORD_SERVICE,
  AP_SCHEDULE_SLOT_DIRECTORY,
  AP_SECTION_DIRECTORY,
  AP_SESSION_REPOSITORY,
  AP_SESSION_SERVICE,
  AP_SUBJECT_DIRECTORY,
} from "./attendance-presence.tokens";
import { AttendanceRecordController } from "./attendance-record.controller";
import { AttendanceSessionController } from "./attendance-session.controller";
import {
  OrganizationServiceDirectory,
  ParticipantPersonDirectory,
  ScheduleSlotServiceDirectory,
  SectionServiceDirectory,
  SubjectServiceDirectory,
} from "./directory.adapters";
import { LeaveController } from "./leave.controller";
import { ParticipationController } from "./participation.controller";
import { PresenceProfileController } from "./presence-profile.controller";
import { PrismaAttendancePolicyRepository } from "./prisma-attendance-policy.repository";
import { PrismaAttendanceRecordRepository } from "./prisma-attendance-record.repository";
import { PrismaAttendanceSessionRepository } from "./prisma-attendance-session.repository";
import { PrismaLeaveRepository } from "./prisma-leave.repository";
import { PrismaParticipationRepository } from "./prisma-participation.repository";
import { PrismaPresenceProfileRepository } from "./prisma-presence-profile.repository";

const repositories: Provider[] = [
  {
    provide: AP_SESSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAttendanceSessionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AP_RECORD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAttendanceRecordRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AP_LEAVE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLeaveRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AP_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAttendancePolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AP_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPresenceProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AP_PARTICIPATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaParticipationRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AP_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: AP_PARTICIPANT_DIRECTORY,
    useFactory: (people: PersonService) => new ParticipantPersonDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: AP_SCHEDULE_SLOT_DIRECTORY,
    useFactory: (slots: ScheduleSlotService) => new ScheduleSlotServiceDirectory(slots),
    inject: [SCHED_SLOT_SERVICE],
  },
  {
    provide: AP_SECTION_DIRECTORY,
    useFactory: (sections: SectionService) => new SectionServiceDirectory(sections),
    inject: [AS_SECTION_SERVICE],
  },
  {
    provide: AP_SUBJECT_DIRECTORY,
    useFactory: (subjects: SubjectService) => new SubjectServiceDirectory(subjects),
    inject: [AS_SUBJECT_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AP_SESSION_SERVICE,
    useFactory: (
      repository: AttendanceSessionRepository,
      organizations: OrganizationDirectory,
      scheduleSlots: ScheduleSlotDirectory,
      sections: SectionDirectory,
      subjects: SubjectDirectory,
      events: EventBus,
    ) =>
      new AttendanceSessionService({
        repository,
        organizations,
        scheduleSlots,
        sections,
        subjects,
        events,
      }),
    inject: [
      AP_SESSION_REPOSITORY,
      AP_ORGANIZATION_DIRECTORY,
      AP_SCHEDULE_SLOT_DIRECTORY,
      AP_SECTION_DIRECTORY,
      AP_SUBJECT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AP_RECORD_SERVICE,
    useFactory: (
      repository: AttendanceRecordRepository,
      sessions: AttendanceSessionRepository,
      participants: ParticipantDirectory,
      events: EventBus,
    ) => new AttendanceRecordService({ repository, sessions, participants, events }),
    inject: [AP_RECORD_REPOSITORY, AP_SESSION_REPOSITORY, AP_PARTICIPANT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AP_LEAVE_SERVICE,
    useFactory: (
      repository: LeaveRepository,
      organizations: OrganizationDirectory,
      participants: ParticipantDirectory,
      events: EventBus,
    ) => new LeaveService({ repository, organizations, participants, events }),
    inject: [AP_LEAVE_REPOSITORY, AP_ORGANIZATION_DIRECTORY, AP_PARTICIPANT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AP_POLICY_SERVICE,
    useFactory: (repository: AttendancePolicyRepository, organizations: OrganizationDirectory) =>
      new AttendancePolicyService({ repository, organizations }),
    inject: [AP_POLICY_REPOSITORY, AP_ORGANIZATION_DIRECTORY],
  },
  {
    provide: AP_PROFILE_SERVICE,
    useFactory: (
      repository: PresenceProfileRepository,
      organizations: OrganizationDirectory,
      participants: ParticipantDirectory,
    ) => new PresenceProfileService({ repository, organizations, participants }),
    inject: [AP_PROFILE_REPOSITORY, AP_ORGANIZATION_DIRECTORY, AP_PARTICIPANT_DIRECTORY],
  },
  {
    provide: AP_PARTICIPATION_SERVICE,
    useFactory: (
      repository: ParticipationRepository,
      organizations: OrganizationDirectory,
      participants: ParticipantDirectory,
      sessions: AttendanceSessionRepository,
      events: EventBus,
    ) => new ParticipationService({ repository, organizations, participants, sessions, events }),
    inject: [
      AP_PARTICIPATION_REPOSITORY,
      AP_ORGANIZATION_DIRECTORY,
      AP_PARTICIPANT_DIRECTORY,
      AP_SESSION_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AP_EVALUATION_SERVICE,
    useFactory: (
      records: AttendanceRecordRepository,
      leaves: LeaveRepository,
      policies: AttendancePolicyRepository,
      participations: ParticipationRepository,
      profiles: PresenceProfileService,
      events: EventBus,
    ) =>
      new AttendanceEvaluationService({
        records,
        leaves,
        policies,
        participations,
        profiles,
        events,
      }),
    inject: [
      AP_RECORD_REPOSITORY,
      AP_LEAVE_REPOSITORY,
      AP_POLICY_REPOSITORY,
      AP_PARTICIPATION_REPOSITORY,
      AP_PROFILE_SERVICE,
      EVENT_BUS,
    ],
  },
];

/**
 * The Attendance & Presence Intelligence Platform (P2-D08) — the authoritative record of who
 * was where, when, and how engaged. Follows the domain architecture pattern (ADR-0010): the
 * pure `@knowget/attendance-presence` package (six aggregates plus the policy-evaluation and
 * presence-intelligence engines) behind repository ports, Prisma/RLS adapters, application
 * services on the platform event bus, and permission-gated (`attendance:read`/`:write`),
 * tenant-scoped REST controllers. Organization, participant (Person), schedule-slot, section
 * and subject existence enter through injected directory ports (backed by the Organization,
 * Person, Academic-Scheduling and Academic-Structure modules). Attendance is immutable and
 * corrections are audited; approved leave excuses absences in the policy engine; the presence
 * profile is the AI-ready read model future domains consume. Third contract of the Academic
 * Excellence Platform program; exports every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule, AcademicSchedulingModule, AcademicStructureModule],
  controllers: [
    AttendanceSessionController,
    AttendanceRecordController,
    LeaveController,
    AttendancePolicyController,
    PresenceProfileController,
    ParticipationController,
    AttendanceAnalyticsController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AP_SESSION_SERVICE,
    AP_RECORD_SERVICE,
    AP_LEAVE_SERVICE,
    AP_POLICY_SERVICE,
    AP_PROFILE_SERVICE,
    AP_PARTICIPATION_SERVICE,
    AP_EVALUATION_SERVICE,
  ],
})
export class AttendancePresenceModule {}
