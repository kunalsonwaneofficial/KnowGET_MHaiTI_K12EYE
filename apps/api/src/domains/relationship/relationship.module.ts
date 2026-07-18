import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { PersonService } from "@knowget/person";
import {
  RelationshipService,
  type PersonDirectory,
  type RelationshipRepository,
} from "@knowget/relationship";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { PersonServiceDirectory } from "./person-directory.adapter";
import { PrismaRelationshipRepository } from "./prisma-relationship.repository";
import { RelationshipController } from "./relationship.controller";
import {
  RELATIONSHIP_PERSON_DIRECTORY,
  RELATIONSHIP_REPOSITORY,
  RELATIONSHIP_SERVICE,
} from "./relationship.tokens";

const providers: Provider[] = [
  {
    provide: RELATIONSHIP_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: RELATIONSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRelationshipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RELATIONSHIP_SERVICE,
    useFactory: (repository: RelationshipRepository, persons: PersonDirectory, events: EventBus) =>
      new RelationshipService({ repository, persons, events }),
    inject: [RELATIONSHIP_REPOSITORY, RELATIONSHIP_PERSON_DIRECTORY, EVENT_BUS],
  },
];

/**
 * The relationship domain (P2-D01-M06) — typed associations between people.
 * Follows the domain architecture pattern (ADR-0010): the pure
 * `@knowget/relationship` package behind a repository port, a Prisma/RLS adapter,
 * the service on the platform event bus, and a permission-gated REST controller.
 * Person existence enters through an injected directory port; imports
 * `PersonModule` for it.
 */
@Module({
  imports: [PersonModule],
  controllers: [RelationshipController],
  providers,
  exports: [RELATIONSHIP_SERVICE, RELATIONSHIP_REPOSITORY],
})
export class RelationshipModule {}
