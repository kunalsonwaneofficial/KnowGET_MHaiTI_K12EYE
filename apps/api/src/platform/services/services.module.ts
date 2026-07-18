import { InMemoryCache } from "@knowget/cache";
import { InMemoryEventBus, InMemoryOutbox } from "@knowget/events";
import { InMemoryBlobStore } from "@knowget/files";
import { Translator } from "@knowget/i18n";
import { Scheduler } from "@knowget/jobs";
import { PassthroughMediaProcessor } from "@knowget/media";
import { NotificationDispatcher } from "@knowget/notifications";
import { Global, Module, type Provider } from "@nestjs/common";
import type Redis from "ioredis";
import { KeyValueCache } from "../keyvalue/key-value-cache";
import type { KeyValueStore } from "../keyvalue/key-value-store";
import { loadKeyValueEnv } from "../keyvalue/keyvalue.env";
import { KeyValueModule } from "../keyvalue/keyvalue.module";
import { KEY_VALUE_STORE, REDIS_CLIENT } from "../keyvalue/keyvalue.tokens";
import { InMemoryInbox, type Inbox } from "./backends/inbox";
import { InMemoryJobQueueAdapter } from "./backends/job-queue";
import { RedisInbox } from "./backends/redis-inbox";
import { RedisJobQueue } from "./backends/redis-job-queue";
import { InMemorySearchService, type SearchService } from "./backends/search-service";
import { ServicesController } from "./services.controller";
import {
  BLOB_STORE,
  CACHE,
  EVENT_BUS,
  IN_APP_INBOX,
  JOB_QUEUE,
  MEDIA_PROCESSOR,
  NOTIFICATION_DISPATCHER,
  OUTBOX,
  PERSISTED_BLOB_STORE,
  PERSISTED_SEARCH_INDEX,
  SCHEDULER,
  SEARCH_INDEX,
  TRANSLATOR,
} from "./services.tokens";
import type { BlobStore } from "@knowget/files";

/** Build the notification dispatcher pre-wired with the in-app inbox transport. */
function createDispatcher(inbox: Inbox): NotificationDispatcher {
  const dispatcher = new NotificationDispatcher();
  dispatcher.registerChannel(inbox);
  return dispatcher;
}

const providers: Provider[] = [
  {
    // Shared distributed cache (TD-19) when REDIS_URL is set — behind the same
    // async `Cache` port — else the in-memory LRU default.
    provide: CACHE,
    useFactory: (kv: KeyValueStore) =>
      loadKeyValueEnv().REDIS_URL ? new KeyValueCache(kv) : new InMemoryCache(),
    inject: [KEY_VALUE_STORE],
  },
  {
    // Shared job queue across replicas over Redis (TD-19); in-memory otherwise.
    provide: JOB_QUEUE,
    useFactory: (redis: Redis | null) =>
      redis ? new RedisJobQueue(redis) : new InMemoryJobQueueAdapter(),
    inject: [REDIS_CLIENT],
  },
  { provide: SCHEDULER, useFactory: () => new Scheduler() },
  {
    // Postgres full-text search (TD-19) when SERVICES_STORE=persisted, else in-memory.
    provide: SEARCH_INDEX,
    useFactory: (persisted?: SearchService) => persisted ?? new InMemorySearchService(),
    inject: [{ token: PERSISTED_SEARCH_INDEX, optional: true }],
  },
  {
    // Postgres blob store (TD-19) when SERVICES_STORE=persisted, else in-memory.
    provide: BLOB_STORE,
    useFactory: (persisted?: BlobStore) => persisted ?? new InMemoryBlobStore(),
    inject: [{ token: PERSISTED_BLOB_STORE, optional: true }],
  },
  { provide: TRANSLATOR, useFactory: () => new Translator({ defaultLocale: "en" }) },
  { provide: OUTBOX, useFactory: () => new InMemoryOutbox() },
  { provide: EVENT_BUS, useFactory: () => new InMemoryEventBus() },
  { provide: MEDIA_PROCESSOR, useFactory: () => new PassthroughMediaProcessor() },
  {
    // Shared in-app inbox across replicas over Redis (TD-19); in-memory otherwise.
    provide: IN_APP_INBOX,
    useFactory: (redis: Redis | null) => (redis ? new RedisInbox(redis) : new InMemoryInbox()),
    inject: [REDIS_CLIENT],
  },
  {
    provide: NOTIFICATION_DISPATCHER,
    useFactory: (inbox: Inbox) => createDispatcher(inbox),
    inject: [IN_APP_INBOX],
  },
];

/**
 * The Enterprise Shared Services (ESSP) layer (P1-M05). Provides the shared
 * service singletons — cache, jobs/scheduler, search, files, i18n, notifications,
 * media, and the event outbox — to the whole application via DI. In-memory
 * defaults; distributed backends slot in behind the same contracts, selected by
 * env: Redis (`REDIS_URL`) for cache/jobs/notifications and Postgres
 * (`SERVICES_STORE=persisted`, via `PersistedServicesModule`) for search/files.
 */
@Global()
@Module({
  imports: [KeyValueModule],
  controllers: [ServicesController],
  providers,
  exports: [
    CACHE,
    JOB_QUEUE,
    SCHEDULER,
    SEARCH_INDEX,
    BLOB_STORE,
    TRANSLATOR,
    OUTBOX,
    EVENT_BUS,
    MEDIA_PROCESSOR,
    IN_APP_INBOX,
    NOTIFICATION_DISPATCHER,
  ],
})
export class ServicesModule {}
