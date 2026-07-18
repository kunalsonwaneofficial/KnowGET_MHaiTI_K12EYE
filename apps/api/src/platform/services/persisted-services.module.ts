import { PrismaService } from "@knowget/database";
import { Global, Module, type Provider } from "@nestjs/common";
import { DATABASE } from "../tokens";
import { PrismaBlobStore } from "./backends/prisma-blob.store";
import { PrismaSearchIndex } from "./backends/prisma-search-index";
import { PERSISTED_BLOB_STORE, PERSISTED_SEARCH_INDEX } from "./services.tokens";

const providers: Provider[] = [
  {
    provide: PERSISTED_BLOB_STORE,
    useFactory: (db: PrismaService) => new PrismaBlobStore(db),
    inject: [DATABASE],
  },
  {
    provide: PERSISTED_SEARCH_INDEX,
    useFactory: (db: PrismaService) => new PrismaSearchIndex(db),
    inject: [DATABASE],
  },
];

/**
 * Opt-in Postgres-backed shared services (`SERVICES_STORE=persisted`). Imported by
 * the root module only in persisted mode, so the default (in-memory) build never
 * pulls the Prisma-backed blob store / search index in (TD-12). Provides the
 * persisted overrides the services module picks up via `@Optional` injection. Global.
 */
@Global()
@Module({
  providers,
  exports: [PERSISTED_BLOB_STORE, PERSISTED_SEARCH_INDEX],
})
export class PersistedServicesModule {}
