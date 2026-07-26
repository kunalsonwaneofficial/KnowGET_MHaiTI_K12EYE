import {
  type AcknowledgementRepository,
  AcknowledgementService,
  type AnnouncementRepository,
  AnnouncementService,
  type AudienceRepository,
  AudienceService,
  type EngagementProfileRepository,
  EngagementProfileService,
  type MessageRepository,
  MessageService,
  type MessageThreadRepository,
  MessageThreadService,
  type OrganizationDirectory,
  type PersonDirectory,
  type SurveyRepository,
  SurveyResponseService,
  type SurveyResponseRepository,
  SurveyService,
} from "@knowget/engagement";
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
import { AcknowledgementController } from "./acknowledgement.controller";
import { AnnouncementController } from "./announcement.controller";
import { AudienceController } from "./audience.controller";
import {
  EN_ACKNOWLEDGEMENT_REPOSITORY,
  EN_ACKNOWLEDGEMENT_SERVICE,
  EN_ANNOUNCEMENT_REPOSITORY,
  EN_ANNOUNCEMENT_SERVICE,
  EN_AUDIENCE_REPOSITORY,
  EN_AUDIENCE_SERVICE,
  EN_MESSAGE_REPOSITORY,
  EN_MESSAGE_SERVICE,
  EN_ORGANIZATION_DIRECTORY,
  EN_PERSON_DIRECTORY,
  EN_PROFILE_REPOSITORY,
  EN_PROFILE_SERVICE,
  EN_RESPONSE_REPOSITORY,
  EN_RESPONSE_SERVICE,
  EN_SURVEY_REPOSITORY,
  EN_SURVEY_SERVICE,
  EN_THREAD_REPOSITORY,
  EN_THREAD_SERVICE,
} from "./engagement.tokens";
import { EngagementProfileController } from "./engagement-profile.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { MessageController } from "./message.controller";
import { MessageThreadController } from "./message-thread.controller";
import { PrismaAcknowledgementRepository } from "./prisma-acknowledgement.repository";
import { PrismaAnnouncementRepository } from "./prisma-announcement.repository";
import { PrismaAudienceRepository } from "./prisma-audience.repository";
import { PrismaEngagementProfileRepository } from "./prisma-engagement-profile.repository";
import { PrismaMessageRepository } from "./prisma-message.repository";
import { PrismaMessageThreadRepository } from "./prisma-message-thread.repository";
import { PrismaSurveyRepository } from "./prisma-survey.repository";
import { PrismaSurveyResponseRepository } from "./prisma-survey-response.repository";
import { SurveyController } from "./survey.controller";
import { SurveyResponseController } from "./survey-response.controller";

const repositories: Provider[] = [
  {
    provide: EN_AUDIENCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAudienceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_ANNOUNCEMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAnnouncementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_ACKNOWLEDGEMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAcknowledgementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_THREAD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMessageThreadRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_MESSAGE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMessageRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_SURVEY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSurveyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_RESPONSE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSurveyResponseRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EN_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEngagementProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: EN_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: EN_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: EN_AUDIENCE_SERVICE,
    useFactory: (
      repository: AudienceRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AudienceService({ repository, organizations, events }),
    inject: [EN_AUDIENCE_REPOSITORY, EN_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EN_ANNOUNCEMENT_SERVICE,
    useFactory: (
      repository: AnnouncementRepository,
      audiences: AudienceRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new AnnouncementService({ repository, audiences, organizations, persons, events }),
    inject: [
      EN_ANNOUNCEMENT_REPOSITORY,
      EN_AUDIENCE_REPOSITORY,
      EN_ORGANIZATION_DIRECTORY,
      EN_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EN_ACKNOWLEDGEMENT_SERVICE,
    useFactory: (
      repository: AcknowledgementRepository,
      announcements: AnnouncementRepository,
      persons: PersonDirectory,
      events: EventBus,
    ) => new AcknowledgementService({ repository, announcements, persons, events }),
    inject: [
      EN_ACKNOWLEDGEMENT_REPOSITORY,
      EN_ANNOUNCEMENT_REPOSITORY,
      EN_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EN_THREAD_SERVICE,
    useFactory: (
      repository: MessageThreadRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new MessageThreadService({ repository, organizations, persons, events }),
    inject: [EN_THREAD_REPOSITORY, EN_ORGANIZATION_DIRECTORY, EN_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EN_MESSAGE_SERVICE,
    useFactory: (
      repository: MessageRepository,
      threads: MessageThreadRepository,
      events: EventBus,
    ) => new MessageService({ repository, threads, events }),
    inject: [EN_MESSAGE_REPOSITORY, EN_THREAD_REPOSITORY, EVENT_BUS],
  },
  {
    provide: EN_SURVEY_SERVICE,
    useFactory: (
      repository: SurveyRepository,
      audiences: AudienceRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new SurveyService({ repository, audiences, organizations, events }),
    inject: [EN_SURVEY_REPOSITORY, EN_AUDIENCE_REPOSITORY, EN_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EN_RESPONSE_SERVICE,
    useFactory: (
      repository: SurveyResponseRepository,
      surveys: SurveyRepository,
      persons: PersonDirectory,
      events: EventBus,
    ) => new SurveyResponseService({ repository, surveys, persons, events }),
    inject: [EN_RESPONSE_REPOSITORY, EN_SURVEY_REPOSITORY, EN_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EN_PROFILE_SERVICE,
    useFactory: (
      repository: EngagementProfileRepository,
      audiences: AudienceRepository,
      announcements: AnnouncementRepository,
      acknowledgements: AcknowledgementRepository,
      surveys: SurveyRepository,
      responses: SurveyResponseRepository,
      events: EventBus,
    ) =>
      new EngagementProfileService({
        repository,
        audiences,
        announcements,
        acknowledgements,
        surveys,
        responses,
        events,
      }),
    inject: [
      EN_PROFILE_REPOSITORY,
      EN_AUDIENCE_REPOSITORY,
      EN_ANNOUNCEMENT_REPOSITORY,
      EN_ACKNOWLEDGEMENT_REPOSITORY,
      EN_SURVEY_REPOSITORY,
      EN_RESPONSE_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Unified Communication, Engagement & Collaboration Platform (P2-D22) — the institution's engagement
 * system of record, and the fourth contract of Program D (Campus & Engagement). Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/engagement` package (eight aggregates plus the
 * engagement and survey-tally engines, and the engagement-profile spine) behind repository ports, Prisma/RLS
 * adapters, application services on the platform event bus, and permission-gated, tenant-scoped REST
 * controllers. It is named `@knowget/engagement` — distinct from the platform `@knowget/notifications`
 * delivery service (P1-M05), which performs channel delivery; contact preferences are Family & Guardian's
 * (P2-D04). Money is absent, and domain events carry no money and no free text (no audience/announcement/
 * message/survey content). `communication:*` gates the messaging surface (audiences, announcements +
 * acknowledgements, threads + messages); `engagement:*` gates the feedback surface (surveys, responses, the
 * engagement profile). Organization (P2-D01-M01) and Person (P2-D01-M02) existence enter through injected
 * directory ports; the domain links to them and never depends on their packages directly. Exports every
 * service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    AudienceController,
    AnnouncementController,
    AcknowledgementController,
    MessageThreadController,
    MessageController,
    SurveyController,
    SurveyResponseController,
    EngagementProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    EN_AUDIENCE_SERVICE,
    EN_ANNOUNCEMENT_SERVICE,
    EN_ACKNOWLEDGEMENT_SERVICE,
    EN_THREAD_SERVICE,
    EN_MESSAGE_SERVICE,
    EN_SURVEY_SERVICE,
    EN_RESPONSE_SERVICE,
    EN_PROFILE_SERVICE,
  ],
})
export class EngagementModule {}
