import type { PrismaService } from "@knowget/database";
import {
  type CredentialHasher,
  IdentityAccountService,
  type IdentityAccountRepository,
  type PersonDirectory,
} from "@knowget/enterprise-identity";
import type { EventBus } from "@knowget/events";
import type { PersonService } from "@knowget/person";
import { hashPassword } from "@knowget/security";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { IdentityController } from "./identity.controller";
import {
  CREDENTIAL_HASHER,
  IDENTITY_ACCOUNT_REPOSITORY,
  IDENTITY_ACCOUNT_SERVICE,
  PERSON_DIRECTORY,
} from "./identity.tokens";
import { PersonServiceDirectory } from "./person-directory.adapter";
import { PrismaIdentityAccountRepository } from "./prisma-identity-account.repository";

const providers: Provider[] = [
  {
    provide: CREDENTIAL_HASHER,
    useValue: { hash: (plaintext: string) => hashPassword(plaintext) } satisfies CredentialHasher,
  },
  {
    provide: PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: IDENTITY_ACCOUNT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaIdentityAccountRepository(db),
    inject: [DATABASE],
  },
  {
    provide: IDENTITY_ACCOUNT_SERVICE,
    useFactory: (
      repository: IdentityAccountRepository,
      persons: PersonDirectory,
      hasher: CredentialHasher,
      events: EventBus,
    ) => new IdentityAccountService({ repository, persons, hasher, events }),
    inject: [IDENTITY_ACCOUNT_REPOSITORY, PERSON_DIRECTORY, CREDENTIAL_HASHER, EVENT_BUS],
  },
];

/**
 * The enterprise identity domain (P2-D01-M03) — tenant-scoped login accounts
 * linking a person to identifiers, credentials and lifecycle. Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/enterprise-identity`
 * package behind a repository port, a Prisma/RLS adapter, the service on the
 * platform event bus, and a permission-gated REST controller. Credential hashing
 * (`@knowget/security`) and person existence (`@knowget/person`) enter through
 * injected ports. Imports `PersonModule` for the person directory.
 */
@Module({
  imports: [PersonModule],
  controllers: [IdentityController],
  providers,
  exports: [IDENTITY_ACCOUNT_SERVICE, IDENTITY_ACCOUNT_REPOSITORY],
})
export class IdentityModule {}
