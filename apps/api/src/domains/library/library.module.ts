import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  type CirculationPolicyRepository,
  CirculationPolicyService,
  type CollectionProfileRepository,
  CollectionProfileService,
  type CopyRepository,
  CopyService,
  type DigitalAssetRepository,
  DigitalAssetService,
  type LibraryMemberRepository,
  LibraryMemberService,
  type LoanRepository,
  LoanService,
  type OrganizationDirectory,
  type PersonDirectory,
  type ReservationRepository,
  ReservationService,
  type TitleRepository,
  TitleService,
} from "@knowget/library";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { CirculationPolicyController } from "./circulation-policy.controller";
import { CollectionProfileController } from "./collection-profile.controller";
import { CopyController } from "./copy.controller";
import { DigitalAssetController } from "./digital-asset.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { LibraryMemberController } from "./library-member.controller";
import {
  LB_COPY_REPOSITORY,
  LB_COPY_SERVICE,
  LB_DIGITAL_ASSET_REPOSITORY,
  LB_DIGITAL_ASSET_SERVICE,
  LB_LOAN_REPOSITORY,
  LB_LOAN_SERVICE,
  LB_MEMBER_REPOSITORY,
  LB_MEMBER_SERVICE,
  LB_ORGANIZATION_DIRECTORY,
  LB_PERSON_DIRECTORY,
  LB_POLICY_REPOSITORY,
  LB_POLICY_SERVICE,
  LB_PROFILE_REPOSITORY,
  LB_PROFILE_SERVICE,
  LB_RESERVATION_REPOSITORY,
  LB_RESERVATION_SERVICE,
  LB_TITLE_REPOSITORY,
  LB_TITLE_SERVICE,
} from "./library.tokens";
import { LoanController } from "./loan.controller";
import { PrismaCirculationPolicyRepository } from "./prisma-circulation-policy.repository";
import { PrismaCollectionProfileRepository } from "./prisma-collection-profile.repository";
import { PrismaCopyRepository } from "./prisma-copy.repository";
import { PrismaDigitalAssetRepository } from "./prisma-digital-asset.repository";
import { PrismaLibraryMemberRepository } from "./prisma-library-member.repository";
import { PrismaLoanRepository } from "./prisma-loan.repository";
import { PrismaReservationRepository } from "./prisma-reservation.repository";
import { PrismaTitleRepository } from "./prisma-title.repository";
import { ReservationController } from "./reservation.controller";
import { TitleController } from "./title.controller";

const repositories: Provider[] = [
  {
    provide: LB_TITLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaTitleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_COPY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCopyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_DIGITAL_ASSET_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDigitalAssetRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_MEMBER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLibraryMemberRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_LOAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLoanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_RESERVATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaReservationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCirculationPolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: LB_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCollectionProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: LB_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: LB_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: LB_TITLE_SERVICE,
    useFactory: (
      repository: TitleRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new TitleService({ repository, organizations, events }),
    inject: [LB_TITLE_REPOSITORY, LB_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LB_COPY_SERVICE,
    useFactory: (repository: CopyRepository, titles: TitleRepository, events: EventBus) =>
      new CopyService({ repository, titles, events }),
    inject: [LB_COPY_REPOSITORY, LB_TITLE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: LB_DIGITAL_ASSET_SERVICE,
    useFactory: (
      repository: DigitalAssetRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new DigitalAssetService({ repository, organizations, events }),
    inject: [LB_DIGITAL_ASSET_REPOSITORY, LB_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LB_MEMBER_SERVICE,
    useFactory: (
      repository: LibraryMemberRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new LibraryMemberService({ repository, organizations, persons, events }),
    inject: [LB_MEMBER_REPOSITORY, LB_ORGANIZATION_DIRECTORY, LB_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LB_LOAN_SERVICE,
    useFactory: (
      repository: LoanRepository,
      copies: CopyRepository,
      members: LibraryMemberRepository,
      events: EventBus,
    ) => new LoanService({ repository, copies, members, events }),
    inject: [LB_LOAN_REPOSITORY, LB_COPY_REPOSITORY, LB_MEMBER_REPOSITORY, EVENT_BUS],
  },
  {
    provide: LB_RESERVATION_SERVICE,
    useFactory: (
      repository: ReservationRepository,
      titles: TitleRepository,
      members: LibraryMemberRepository,
      events: EventBus,
    ) => new ReservationService({ repository, titles, members, events }),
    inject: [LB_RESERVATION_REPOSITORY, LB_TITLE_REPOSITORY, LB_MEMBER_REPOSITORY, EVENT_BUS],
  },
  {
    provide: LB_POLICY_SERVICE,
    useFactory: (
      repository: CirculationPolicyRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new CirculationPolicyService({ repository, organizations, events }),
    inject: [LB_POLICY_REPOSITORY, LB_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: LB_PROFILE_SERVICE,
    useFactory: (
      repository: CollectionProfileRepository,
      organizations: OrganizationDirectory,
      titles: TitleRepository,
      copies: CopyRepository,
      digitalAssets: DigitalAssetRepository,
      loans: LoanRepository,
      reservations: ReservationRepository,
      events: EventBus,
    ) =>
      new CollectionProfileService({
        repository,
        organizations,
        titles,
        copies,
        digitalAssets,
        loans,
        reservations,
        events,
      }),
    inject: [
      LB_PROFILE_REPOSITORY,
      LB_ORGANIZATION_DIRECTORY,
      LB_TITLE_REPOSITORY,
      LB_COPY_REPOSITORY,
      LB_DIGITAL_ASSET_REPOSITORY,
      LB_LOAN_REPOSITORY,
      LB_RESERVATION_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Knowledge Resource, Library & Digital Learning Asset Platform (P2-D18) — the institution's library
 * system of record. Follows the domain architecture pattern (ADR-0010): the pure `@knowget/library`
 * package (eight aggregates plus the title-availability/collection-rollup and loan-status engines) behind
 * repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers. Money is deliberately absent (overdue/lost fines →
 * Finance P2-D14; acquisition spend and asset valuation → Procurement/Assets P2-D15). `library:*` gates the
 * knowledge collection itself (titles, copies, digital assets, the collection profile); `circulation:*`
 * gates the lending relationship (members, loans, reservations, the circulation policy). Organization
 * (P2-D01-M01) and Person (P2-D01-M02) existence enter through injected directory ports; the library domain
 * links to them and never depends on their packages directly. The seventh contract of Program C; exports
 * every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    TitleController,
    CopyController,
    DigitalAssetController,
    CollectionProfileController,
    LibraryMemberController,
    LoanController,
    ReservationController,
    CirculationPolicyController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    LB_TITLE_SERVICE,
    LB_COPY_SERVICE,
    LB_DIGITAL_ASSET_SERVICE,
    LB_MEMBER_SERVICE,
    LB_LOAN_SERVICE,
    LB_RESERVATION_SERVICE,
    LB_POLICY_SERVICE,
    LB_PROFILE_SERVICE,
  ],
})
export class LibraryModule {}
