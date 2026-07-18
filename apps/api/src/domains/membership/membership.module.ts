import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  MembershipService,
  type MembershipRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/membership";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directories.adapter";
import { MembershipController } from "./membership.controller";
import {
  MEMBERSHIP_ORGANIZATION_DIRECTORY,
  MEMBERSHIP_PERSON_DIRECTORY,
  MEMBERSHIP_REPOSITORY,
  MEMBERSHIP_SERVICE,
} from "./membership.tokens";
import { PrismaMembershipRepository } from "./prisma-membership.repository";

const providers: Provider[] = [
  {
    provide: MEMBERSHIP_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: MEMBERSHIP_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: MEMBERSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMembershipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: MEMBERSHIP_SERVICE,
    useFactory: (
      repository: MembershipRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new MembershipService({ repository, persons, organizations, events }),
    inject: [
      MEMBERSHIP_REPOSITORY,
      MEMBERSHIP_PERSON_DIRECTORY,
      MEMBERSHIP_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The membership domain (P2-D01-M04) — a person's roles within an organization.
 * Follows the domain architecture pattern (ADR-0010): the pure
 * `@knowget/membership` package behind a repository port, a Prisma/RLS adapter,
 * the service on the platform event bus, and a permission-gated REST controller.
 * Person and organization existence enter through injected directory ports;
 * imports `PersonModule` and `OrganizationModule` for them.
 */
@Module({
  imports: [PersonModule, OrganizationModule],
  controllers: [MembershipController],
  providers,
  exports: [MEMBERSHIP_SERVICE, MEMBERSHIP_REPOSITORY],
})
export class MembershipModule {}
