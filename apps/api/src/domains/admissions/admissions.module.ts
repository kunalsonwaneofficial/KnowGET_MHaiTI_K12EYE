import {
  type AdmissionCycleRepository,
  AdmissionCycleService,
  type AdmissionEvaluationRepository,
  AdmissionEvaluationService,
  type AdmissionsFunnelProfileRepository,
  AdmissionsFunnelProfileService,
  type ApplicationRepository,
  ApplicationService,
  type EnrollmentConfirmationRepository,
  EnrollmentConfirmationService,
  type LeadRepository,
  LeadService,
  type MarketingCampaignRepository,
  MarketingCampaignService,
  type OfferRepository,
  OfferService,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/admissions";
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
import { AdmissionCycleController } from "./admission-cycle.controller";
import { AdmissionEvaluationController } from "./admission-evaluation.controller";
import {
  AD_APPLICATION_REPOSITORY,
  AD_APPLICATION_SERVICE,
  AD_CAMPAIGN_REPOSITORY,
  AD_CAMPAIGN_SERVICE,
  AD_CYCLE_REPOSITORY,
  AD_CYCLE_SERVICE,
  AD_ENROLLMENT_REPOSITORY,
  AD_ENROLLMENT_SERVICE,
  AD_EVALUATION_REPOSITORY,
  AD_EVALUATION_SERVICE,
  AD_LEAD_REPOSITORY,
  AD_LEAD_SERVICE,
  AD_OFFER_REPOSITORY,
  AD_OFFER_SERVICE,
  AD_ORGANIZATION_DIRECTORY,
  AD_PERSON_DIRECTORY,
  AD_PROFILE_REPOSITORY,
  AD_PROFILE_SERVICE,
} from "./admissions.tokens";
import { AdmissionsFunnelProfileController } from "./admissions-funnel-profile.controller";
import { ApplicationController } from "./application.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { EnrollmentConfirmationController } from "./enrollment-confirmation.controller";
import { LeadController } from "./lead.controller";
import { MarketingCampaignController } from "./marketing-campaign.controller";
import { OfferController } from "./offer.controller";
import { PrismaAdmissionCycleRepository } from "./prisma-admission-cycle.repository";
import { PrismaAdmissionEvaluationRepository } from "./prisma-admission-evaluation.repository";
import { PrismaAdmissionsFunnelProfileRepository } from "./prisma-admissions-funnel-profile.repository";
import { PrismaApplicationRepository } from "./prisma-application.repository";
import { PrismaEnrollmentConfirmationRepository } from "./prisma-enrollment-confirmation.repository";
import { PrismaLeadRepository } from "./prisma-lead.repository";
import { PrismaMarketingCampaignRepository } from "./prisma-marketing-campaign.repository";
import { PrismaOfferRepository } from "./prisma-offer.repository";

const repositories: Provider[] = [
  {
    provide: AD_CAMPAIGN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMarketingCampaignRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_LEAD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLeadRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_CYCLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAdmissionCycleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_APPLICATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaApplicationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_EVALUATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAdmissionEvaluationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_OFFER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaOfferRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_ENROLLMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEnrollmentConfirmationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AD_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAdmissionsFunnelProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AD_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: AD_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AD_CAMPAIGN_SERVICE,
    useFactory: (
      repository: MarketingCampaignRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new MarketingCampaignService({ repository, organizations, events }),
    inject: [AD_CAMPAIGN_REPOSITORY, AD_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AD_LEAD_SERVICE,
    useFactory: (
      repository: LeadRepository,
      campaigns: MarketingCampaignRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new LeadService({ repository, campaigns, organizations, events }),
    inject: [AD_LEAD_REPOSITORY, AD_CAMPAIGN_REPOSITORY, AD_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AD_CYCLE_SERVICE,
    useFactory: (
      repository: AdmissionCycleRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AdmissionCycleService({ repository, organizations, events }),
    inject: [AD_CYCLE_REPOSITORY, AD_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AD_APPLICATION_SERVICE,
    useFactory: (
      repository: ApplicationRepository,
      cycles: AdmissionCycleRepository,
      leads: LeadRepository,
      persons: PersonDirectory,
      events: EventBus,
    ) => new ApplicationService({ repository, cycles, leads, persons, events }),
    inject: [
      AD_APPLICATION_REPOSITORY,
      AD_CYCLE_REPOSITORY,
      AD_LEAD_REPOSITORY,
      AD_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AD_EVALUATION_SERVICE,
    useFactory: (
      repository: AdmissionEvaluationRepository,
      applications: ApplicationRepository,
      events: EventBus,
    ) => new AdmissionEvaluationService({ repository, applications, events }),
    inject: [AD_EVALUATION_REPOSITORY, AD_APPLICATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AD_OFFER_SERVICE,
    useFactory: (
      repository: OfferRepository,
      applications: ApplicationRepository,
      events: EventBus,
    ) => new OfferService({ repository, applications, events }),
    inject: [AD_OFFER_REPOSITORY, AD_APPLICATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AD_ENROLLMENT_SERVICE,
    useFactory: (
      repository: EnrollmentConfirmationRepository,
      offers: OfferRepository,
      applications: ApplicationRepository,
      events: EventBus,
    ) => new EnrollmentConfirmationService({ repository, offers, applications, events }),
    inject: [AD_ENROLLMENT_REPOSITORY, AD_OFFER_REPOSITORY, AD_APPLICATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AD_PROFILE_SERVICE,
    useFactory: (
      profiles: AdmissionsFunnelProfileRepository,
      cycles: AdmissionCycleRepository,
      leads: LeadRepository,
      applications: ApplicationRepository,
      offers: OfferRepository,
      enrollments: EnrollmentConfirmationRepository,
      events: EventBus,
    ) =>
      new AdmissionsFunnelProfileService({
        profiles,
        cycles,
        leads,
        applications,
        offers,
        enrollments,
        events,
      }),
    inject: [
      AD_PROFILE_REPOSITORY,
      AD_CYCLE_REPOSITORY,
      AD_LEAD_REPOSITORY,
      AD_APPLICATION_REPOSITORY,
      AD_OFFER_REPOSITORY,
      AD_ENROLLMENT_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Admissions, Marketing, Enrollment & Growth Platform (P2-D23) — the institution's growth-and-intake
 * system of record, and the fifth contract of Program D. Follows the domain architecture pattern (ADR-0010):
 * the pure `@knowget/admissions` package (eight aggregates plus the funnel and intake engines and the
 * funnel-profile refresh spine) behind repository ports, Prisma/RLS adapters, application services on the
 * platform event bus, and permission-gated, tenant-scoped REST controllers. It carries no money — application
 * and admission fees are Finance's (P2-D14) — and the prospect/applicant/student records are Student
 * Lifecycle's (P2-D03), referenced not re-modelled; a confirmed enrollment hands off to P2-D03 through the
 * `admissions.enrollment.confirmed` event. `marketing:*` gates the growth surface (campaigns, leads);
 * `admissions:*` gates the admissions-process surface (cycles, applications, evaluations, offers, enrollments,
 * the funnel profile). Organization (P2-D01-M01) and Person (P2-D01-M02) existence enter through injected
 * directory ports; the domain links to them and never depends on their packages directly. Exports every
 * service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    MarketingCampaignController,
    LeadController,
    AdmissionCycleController,
    ApplicationController,
    AdmissionEvaluationController,
    OfferController,
    EnrollmentConfirmationController,
    AdmissionsFunnelProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AD_CAMPAIGN_SERVICE,
    AD_LEAD_SERVICE,
    AD_CYCLE_SERVICE,
    AD_APPLICATION_SERVICE,
    AD_EVALUATION_SERVICE,
    AD_OFFER_SERVICE,
    AD_ENROLLMENT_SERVICE,
    AD_PROFILE_SERVICE,
  ],
})
export class AdmissionsModule {}
