import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import { RoleService, type RoleRepository } from "@knowget/roles";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { PrismaRoleRepository } from "./prisma-role.repository";
import { RolesController } from "./roles.controller";
import { ROLE_REPOSITORY, ROLE_SERVICE } from "./roles.tokens";

const providers: Provider[] = [
  {
    provide: ROLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRoleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: ROLE_SERVICE,
    useFactory: (repository: RoleRepository, events: EventBus) =>
      new RoleService({ repository, events }),
    inject: [ROLE_REPOSITORY, EVENT_BUS],
  },
];

/**
 * The role catalogue domain (P2-D01-M05) — tenant-scoped RBAC roles. Follows the
 * domain architecture pattern (ADR-0010): the pure `@knowget/roles` package
 * behind a repository port, a Prisma/RLS adapter, the service on the platform
 * event bus, and a permission-gated REST controller. Exports the service so the
 * membership module can validate role names and the principal resolver can expand
 * role names into permissions.
 */
@Module({
  controllers: [RolesController],
  providers,
  exports: [ROLE_SERVICE, ROLE_REPOSITORY],
})
export class RolesModule {}
