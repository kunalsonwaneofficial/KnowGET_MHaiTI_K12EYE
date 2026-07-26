import {
  type AlumniChapterRepository,
  AlumniChapterService,
  type AlumniEngagementProfileRepository,
  AlumniEngagementProfileService,
  type AlumniEventRepository,
  AlumniEventService,
  type AlumniProfileRepository,
  AlumniProfileService,
  type ChapterMembershipRepository,
  ChapterMembershipService,
  type ContributionRepository,
  ContributionService,
  type EventRegistrationRepository,
  EventRegistrationService,
  type MentorshipConnectionRepository,
  MentorshipConnectionService,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/alumni";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { AlumniChapterController } from "./alumni-chapter.controller";
import { AlumniEngagementProfileController } from "./alumni-engagement-profile.controller";
import { AlumniEventController } from "./alumni-event.controller";
import { AlumniProfileController } from "./alumni-profile.controller";
import {
  AL_CHAPTER_REPOSITORY,
  AL_CHAPTER_SERVICE,
  AL_CONTRIBUTION_REPOSITORY,
  AL_CONTRIBUTION_SERVICE,
  AL_ENGAGEMENT_PROFILE_REPOSITORY,
  AL_ENGAGEMENT_PROFILE_SERVICE,
  AL_EVENT_REPOSITORY,
  AL_EVENT_SERVICE,
  AL_MEMBERSHIP_REPOSITORY,
  AL_MEMBERSHIP_SERVICE,
  AL_MENTORSHIP_REPOSITORY,
  AL_MENTORSHIP_SERVICE,
  AL_ORGANIZATION_DIRECTORY,
  AL_PERSON_DIRECTORY,
  AL_PROFILE_REPOSITORY,
  AL_PROFILE_SERVICE,
  AL_REGISTRATION_REPOSITORY,
  AL_REGISTRATION_SERVICE,
} from "./alumni.tokens";
import { ChapterMembershipController } from "./chapter-membership.controller";
import { ContributionController } from "./contribution.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { EventRegistrationController } from "./event-registration.controller";
import { MentorshipConnectionController } from "./mentorship-connection.controller";
import { PrismaAlumniChapterRepository } from "./prisma-alumni-chapter.repository";
import { PrismaAlumniEngagementProfileRepository } from "./prisma-alumni-engagement-profile.repository";
import { PrismaAlumniEventRepository } from "./prisma-alumni-event.repository";
import { PrismaAlumniProfileRepository } from "./prisma-alumni-profile.repository";
import { PrismaChapterMembershipRepository } from "./prisma-chapter-membership.repository";
import { PrismaContributionRepository } from "./prisma-contribution.repository";
import { PrismaEventRegistrationRepository } from "./prisma-event-registration.repository";
import { PrismaMentorshipConnectionRepository } from "./prisma-mentorship-connection.repository";

const repositories: Provider[] = [
  {
    provide: AL_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAlumniProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_CHAPTER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAlumniChapterRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_MEMBERSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaChapterMembershipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_EVENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAlumniEventRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_REGISTRATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEventRegistrationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_MENTORSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMentorshipConnectionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_CONTRIBUTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaContributionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AL_ENGAGEMENT_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAlumniEngagementProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AL_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: AL_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AL_PROFILE_SERVICE,
    useFactory: (
      repository: AlumniProfileRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new AlumniProfileService({ repository, organizations, persons, events }),
    inject: [AL_PROFILE_REPOSITORY, AL_ORGANIZATION_DIRECTORY, AL_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AL_CHAPTER_SERVICE,
    useFactory: (
      repository: AlumniChapterRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AlumniChapterService({ repository, organizations, events }),
    inject: [AL_CHAPTER_REPOSITORY, AL_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AL_MEMBERSHIP_SERVICE,
    useFactory: (
      repository: ChapterMembershipRepository,
      chapters: AlumniChapterRepository,
      profiles: AlumniProfileRepository,
      events: EventBus,
    ) => new ChapterMembershipService({ repository, chapters, profiles, events }),
    inject: [AL_MEMBERSHIP_REPOSITORY, AL_CHAPTER_REPOSITORY, AL_PROFILE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AL_EVENT_SERVICE,
    useFactory: (
      repository: AlumniEventRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AlumniEventService({ repository, organizations, events }),
    inject: [AL_EVENT_REPOSITORY, AL_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AL_REGISTRATION_SERVICE,
    useFactory: (
      repository: EventRegistrationRepository,
      alumniEvents: AlumniEventRepository,
      profiles: AlumniProfileRepository,
      events: EventBus,
    ) => new EventRegistrationService({ repository, alumniEvents, profiles, events }),
    inject: [AL_REGISTRATION_REPOSITORY, AL_EVENT_REPOSITORY, AL_PROFILE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AL_MENTORSHIP_SERVICE,
    useFactory: (
      repository: MentorshipConnectionRepository,
      profiles: AlumniProfileRepository,
      events: EventBus,
    ) => new MentorshipConnectionService({ repository, profiles, events }),
    inject: [AL_MENTORSHIP_REPOSITORY, AL_PROFILE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AL_CONTRIBUTION_SERVICE,
    useFactory: (
      repository: ContributionRepository,
      profiles: AlumniProfileRepository,
      events: EventBus,
    ) => new ContributionService({ repository, profiles, events }),
    inject: [AL_CONTRIBUTION_REPOSITORY, AL_PROFILE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AL_ENGAGEMENT_PROFILE_SERVICE,
    useFactory: (
      profiles: AlumniEngagementProfileRepository,
      alumniProfiles: AlumniProfileRepository,
      registrations: EventRegistrationRepository,
      memberships: ChapterMembershipRepository,
      mentorships: MentorshipConnectionRepository,
      contributions: ContributionRepository,
      alumniEvents: AlumniEventRepository,
      events: EventBus,
    ) =>
      new AlumniEngagementProfileService({
        profiles,
        alumniProfiles,
        registrations,
        memberships,
        mentorships,
        contributions,
        alumniEvents,
        events,
      }),
    inject: [
      AL_ENGAGEMENT_PROFILE_REPOSITORY,
      AL_PROFILE_REPOSITORY,
      AL_REGISTRATION_REPOSITORY,
      AL_MEMBERSHIP_REPOSITORY,
      AL_MENTORSHIP_REPOSITORY,
      AL_CONTRIBUTION_REPOSITORY,
      AL_EVENT_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Alumni, Community & Relationship Platform (P2-D24) — the institution's alumni-network system of record,
 * and the sixth and final contract of Program D. Follows the domain architecture pattern (ADR-0010): the pure
 * `@knowget/alumni` package (eight aggregates plus the engagement and participation engines and the
 * engagement-profile refresh spine) behind repository ports, Prisma/RLS adapters, application services on the
 * platform event bus, and permission-gated, tenant-scoped REST controllers. It carries no money — gift amounts
 * are Finance's (P2-D14) — and the alumnus/student lifecycle record is Student Lifecycle's (P2-D03), referenced
 * not re-modelled; an alumni profile is built on P2-D03's alumnus stage. `alumni:*` gates the individual
 * relationship surface (profiles, mentorships, contributions, the engagement profile); `community:*` gates the
 * community surface (chapters, memberships, events, registrations). Organization (P2-D01-M01) and Person
 * (P2-D01-M02) existence enter through injected directory ports; the domain links to them and never depends on
 * their packages directly. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    AlumniProfileController,
    AlumniChapterController,
    ChapterMembershipController,
    AlumniEventController,
    EventRegistrationController,
    MentorshipConnectionController,
    ContributionController,
    AlumniEngagementProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AL_PROFILE_SERVICE,
    AL_CHAPTER_SERVICE,
    AL_MEMBERSHIP_SERVICE,
    AL_EVENT_SERVICE,
    AL_REGISTRATION_SERVICE,
    AL_MENTORSHIP_SERVICE,
    AL_CONTRIBUTION_SERVICE,
    AL_ENGAGEMENT_PROFILE_SERVICE,
  ],
})
export class AlumniModule {}
