import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { PersonController } from "./person.controller";
import { PrismaPersonRepository } from "./prisma-person.repository";
import { PERSON_REPOSITORY, PERSON_SERVICE } from "./person.tokens";

const providers: Provider[] = [
  {
    provide: PERSON_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPersonRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PERSON_SERVICE,
    useFactory: (repository: PrismaPersonRepository, events: EventBus) =>
      new PersonService(repository, events),
    inject: [PERSON_REPOSITORY, EVENT_BUS],
  },
];

/**
 * The person domain (P2-D01-M02) — the persona-agnostic human record. Follows
 * the domain architecture pattern (ADR-0010): the pure `@knowget/person` package
 * behind a repository port, a Prisma/RLS adapter, the service on the platform
 * event bus, and a permission-gated REST controller.
 */
@Module({
  controllers: [PersonController],
  providers,
  exports: [PERSON_SERVICE],
})
export class PersonModule {}
