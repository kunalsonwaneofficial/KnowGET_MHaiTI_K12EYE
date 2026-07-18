import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  MembershipService,
  type MembershipRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type RoleDirectory,
} from "@knowget/membership";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { RolesModule } from "../roles/roles.module";
import { ROLE_SERVICE } from "../roles/roles.tokens";
import {
  OrganizationServiceDirectory,
  PersonServiceDirectory,
  RoleServiceDirectory,
} from "./directories.adapter";
import { MembershipController } from "./membership.controller";
import {
  MEMBERSHIP_ORGANIZATION_DIRECTORY,
  MEMBERSHIP_PERSON_DIRECTORY,
  MEMBERSHIP_REPOSITORY,
  MEMBERSHIP_ROLE_DIRECTORY,
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
    provide: MEMBERSHIP_ROLE_DIRECTORY,
    useFactory: (roles: RoleService) => new RoleServiceDirectory(roles),
    inject: [ROLE_SERVICE],
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
      roles: RoleDirectory,
      events: EventBus,
    ) => new MembershipService({ repository, persons, organizations, roles, events }),
    inject: [
      MEMBERSHIP_REPOSITORY,
      MEMBERSHIP_PERSON_DIRECTORY,
      MEMBERSHIP_ORGANIZATION_DIRECTORY,
      MEMBERSHIP_ROLE_DIRECTORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The membership domain (P2-D01-M04) — a person's roles within an organization.
 * Follows the domain architecture pattern (ADR-0010): the pure
 * `@knowget/membership` package behind a repository port, a Prisma/RLS adapter,
 * the service on the platform event bus, and a permission-gated REST controller.
 * Person and organization existence and (P2-D01-M05) role-name validation enter
 * through injected directory ports; imports `PersonModule`, `OrganizationModule`
 * and `RolesModule` for them.
 */
@Module({
  imports: [PersonModule, OrganizationModule, RolesModule],
  controllers: [MembershipController],
  providers,
  exports: [MEMBERSHIP_SERVICE, MEMBERSHIP_REPOSITORY],
})
export class MembershipModule {}
