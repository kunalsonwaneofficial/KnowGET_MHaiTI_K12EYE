# Engineering Delivery Report — P1-M05

**Enterprise Shared Services Platform (ESSP)** · Phase 1 (Platform Core Engineering)

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P1-M05 — Enterprise Shared Services Platform                                                                       |
| **Status**     | 🟡 Engineered; in-sandbox gates green. On `feat/p1-m05-shared-services` pending green CI (Prisma-gated API build). |
| **Depends on** | P1-M02 (Runtime Kernel), P1-M03 (Data Platform), P1-M04 (Security Foundation)                                      |
| **Date**       | 17 July 2026                                                                                                       |
| **Next**       | P1-M06 — Observability & DevOps Platform                                                                           |

---

## 1. Mission recap

Engineer the reusable shared-services layer every Phase-2 domain consumes rather
than rebuilds: caching, background jobs and scheduling, files/blob storage,
full-text search, localization, notifications and communication, document
generation, media, workflow, and reliable event delivery. Each service is a
stable interface with a working default implementation; production/distributed
backends slot in behind the same contract with no caller changes. No domain
(Student/Finance/HR) logic is introduced.

## 2. Contract-scope coverage (all twelve capabilities)

| ESSP capability       | Delivered as                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Logging               | `@knowget/logging` (delivered P1-M01) — retained, no rework                                 |
| Events                | `@knowget/events` **expanded**: transactional **outbox** + relay (at-least-once)            |
| Notifications & comms | `@knowget/notifications`: channels (email/SMS/push/in-app), templates, dispatcher, inbox    |
| Files / storage       | `@knowget/files`: `BlobStore` (in-memory + node-fs), checksums, traversal-safe keys         |
| Cache                 | `@knowget/cache`: TTL + LRU in-memory cache, single-flight `getOrSet`, namespacing          |
| Scheduling / jobs     | `@knowget/jobs`: retrying/backing-off job queue + recurring/one-shot scheduler              |
| Search                | `@knowget/search`: inverted-index full-text search, TF-IDF ranking, filters, paging         |
| Localization          | `@knowget/i18n`: catalogs, locale fallback, interpolation, `Intl` pluralization             |
| Document generation   | `@knowget/documents`: structured model + HTML/Markdown/text renderers                       |
| Media                 | `@knowget/media`: asset descriptors + rendition specs behind a `MediaProcessor` port        |
| Workflow              | `@knowget/workflow`: guarded state-machine definitions + a deterministic engine             |
| Integration           | `apps/api` `ServicesModule`: all services provided via DI + `/services` catalog & self-test |

## 3. Design principles (consistent across every service)

- **Port + default implementation.** Each package exposes a stable interface and
  a working in-memory (or node-stdlib) default. Redis, object stores, PostgreSQL
  FTS/OpenSearch, real notification providers, and a distributed job/scheduler
  backend replace the defaults behind the same contracts (tracked as debt).
- **Determinism where time matters.** The cache, job queue, and scheduler take an
  injectable clock; the job queue and scheduler are pull-based (driven by an
  explicit `process`/`tick`) so retry, backoff and recurrence are fully
  reproducible in tests.
- **Reliability for events.** The outbox records an event to be published in the
  same transaction as the business change; the relay drains it at-least-once, so
  a crash between commit and publish simply republishes (consumers key on
  `metadata.eventId`).
- **Safety.** The node-fs blob store confines keys to its root (path-traversal
  rejected); the HTML document renderer escapes output.
- **No leakage.** Services are pure and Prisma-free, so they are fully verifiable
  in-sandbox; only the API wiring is CI-gated.

## 4. Verification — in-sandbox gates (green)

- **Type-check + build:** all ten packages — clean. The new API `ServicesModule`
  layer type-checked in isolation (no Prisma path) — clean.
- **Lint:** ten packages + `apps/api` — **0 warnings**. **Format:** clean.
- **Tests:** `cache` 9 · `jobs` 8 · `files` 7 · `search` 7 · `i18n` 6 ·
  `notifications` 4 · `documents` 5 · `media` 3 · `workflow` 6 · `events` 8
  (incl. outbox) · `apps/api` **27** — all passing.
- **Integration (in-sandbox):** a NestJS testing-module spec **compiles the full
  `ServicesModule` DI graph** and runs a **live self-test** that round-trips the
  wired singletons (cache set/get + search index/query + document render) —
  proving the platform is assembled, not just that units pass.

## 5. Decisions (ADR)

- **ADR-0007** — Shared-services architecture: one package per capability behind
  a stable port with an in-memory default; injectable clocks and pull-based
  processing for deterministic time; the transactional-outbox reliability model;
  and the API `ServicesModule` integration seam.

## 6. Build-environment constraint (unchanged)

`apps/api` transitively depends on Prisma (TD-12), so the full `nest build` and
API type-check are **CI-verified**. Because every shared-service package is
Prisma-free, the substance of this milestone is fully verified in-sandbox
(unit + isolated type-check + the in-process `ServicesModule` integration spec);
CI confirms only the API assembly. CI runs on this `feat/**` branch before merge.

## 7. Technical debt (tracked, interface-protected)

The transactional-outbox pattern lands (partially addressing **TD-01**), but the
distributed streaming backbone remains **P3-D02**. New, each behind a stable
interface: in-memory implementations of every shared service (→ production
backends: Redis cache, object-store files, PostgreSQL-FTS/OpenSearch search,
distributed jobs/scheduler, PostgreSQL outbox store), and media processing is a
passthrough (→ real transcoding). See the technical-debt register.

## 8. Recommendation — proceed to P1-M06

On green CI, merge to `main` and begin **P1-M06 — Observability & DevOps
Platform** (metrics, tracing spans, alerting, dashboards, diagnostics, CI/CD and
reliability), instrumenting the kernel, data, security and shared-services layers
engineered so far.
