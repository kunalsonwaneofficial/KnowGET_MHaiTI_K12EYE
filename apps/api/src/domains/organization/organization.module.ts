import type { EventBus } from "@knowget/events";
import { OrganizationService } from "@knowget/organization";
import type { PrismaService } from "@knowget/database";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationController } from "./organization.controller";
import { PrismaOrganizationRepository } from "./prisma-organization.repository";
import { ORGANIZATION_REPOSITORY, ORGANIZATION_SERVICE } from "./organization.tokens";

const providers: Provider[] = [
  {
    provide: ORGANIZATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaOrganizationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: ORGANIZATION_SERVICE,
    useFactory: (repository: PrismaOrganizationRepository, events: EventBus) =>
      new OrganizationService(repository, events),
    inject: [ORGANIZATION_REPOSITORY, EVENT_BUS],
  },
];

/**
 * The organization domain (P2-D01-M01) — the first Phase-2 domain module and the
 * template the other domains follow: a pure domain package (`@knowget/organization`)
 * behind a repository port, a Prisma adapter enforcing RLS at the composition
 * root, the application service wired to the platform event bus, and a
 * permission-gated REST controller. Security guards and tenant context apply
 * globally from the platform layers.
 */
@Module({
  controllers: [OrganizationController],
  providers,
  exports: [ORGANIZATION_SERVICE],
})
export class OrganizationModule {}
