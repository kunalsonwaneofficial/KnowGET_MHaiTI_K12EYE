import { InMemoryCache } from "@knowget/cache";
import { InMemoryOutbox } from "@knowget/events";
import { InMemoryBlobStore } from "@knowget/files";
import { Translator } from "@knowget/i18n";
import { InMemoryJobQueue, Scheduler } from "@knowget/jobs";
import { PassthroughMediaProcessor } from "@knowget/media";
import { InAppInbox, NotificationDispatcher } from "@knowget/notifications";
import { InMemorySearchIndex } from "@knowget/search";
import { Global, Module, type Provider } from "@nestjs/common";
import { ServicesController } from "./services.controller";
import {
  BLOB_STORE,
  CACHE,
  IN_APP_INBOX,
  JOB_QUEUE,
  MEDIA_PROCESSOR,
  NOTIFICATION_DISPATCHER,
  OUTBOX,
  SCHEDULER,
  SEARCH_INDEX,
  TRANSLATOR,
} from "./services.tokens";

/** Build the notification dispatcher pre-wired with the in-app inbox transport. */
function createDispatcher(inbox: InAppInbox): NotificationDispatcher {
  const dispatcher = new NotificationDispatcher();
  dispatcher.registerChannel(inbox);
  return dispatcher;
}

const inAppInboxProvider: Provider = { provide: IN_APP_INBOX, useFactory: () => new InAppInbox() };

const providers: Provider[] = [
  { provide: CACHE, useFactory: () => new InMemoryCache() },
  { provide: JOB_QUEUE, useFactory: () => new InMemoryJobQueue() },
  { provide: SCHEDULER, useFactory: () => new Scheduler() },
  { provide: SEARCH_INDEX, useFactory: () => new InMemorySearchIndex() },
  { provide: BLOB_STORE, useFactory: () => new InMemoryBlobStore() },
  { provide: TRANSLATOR, useFactory: () => new Translator({ defaultLocale: "en" }) },
  { provide: OUTBOX, useFactory: () => new InMemoryOutbox() },
  { provide: MEDIA_PROCESSOR, useFactory: () => new PassthroughMediaProcessor() },
  inAppInboxProvider,
  {
    provide: NOTIFICATION_DISPATCHER,
    useFactory: (inbox: InAppInbox) => createDispatcher(inbox),
    inject: [IN_APP_INBOX],
  },
];

/**
 * The Enterprise Shared Services (ESSP) layer (P1-M05). Provides the shared
 * service singletons — cache, jobs/scheduler, search, files, i18n, notifications,
 * media, and the event outbox — to the whole application via DI, so Phase-2
 * domains consume them without constructing their own. In-memory defaults;
 * production/distributed backends slot in behind the same contracts.
 */
@Global()
@Module({
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
    MEDIA_PROCESSOR,
    IN_APP_INBOX,
    NOTIFICATION_DISPATCHER,
  ],
})
export class ServicesModule {}
