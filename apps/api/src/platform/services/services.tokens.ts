/** Dependency-injection tokens for the shared-services (ESSP) layer. */
export const CACHE = Symbol("CACHE");
export const JOB_QUEUE = Symbol("JOB_QUEUE");
export const SCHEDULER = Symbol("SCHEDULER");
export const SEARCH_INDEX = Symbol("SEARCH_INDEX");
export const NOTIFICATION_DISPATCHER = Symbol("NOTIFICATION_DISPATCHER");
export const IN_APP_INBOX = Symbol("IN_APP_INBOX");
export const BLOB_STORE = Symbol("BLOB_STORE");
export const TRANSLATOR = Symbol("TRANSLATOR");
export const OUTBOX = Symbol("OUTBOX");
export const MEDIA_PROCESSOR = Symbol("MEDIA_PROCESSOR");
export const EVENT_BUS = Symbol("EVENT_BUS");

/** Postgres-backed overrides provided by `PersistedServicesModule` (SERVICES_STORE=persisted);
 * absent (⇒ in-memory fallback) otherwise. Injected `@Optional` by the services module. */
export const PERSISTED_BLOB_STORE = Symbol("PERSISTED_BLOB_STORE");
export const PERSISTED_SEARCH_INDEX = Symbol("PERSISTED_SEARCH_INDEX");
