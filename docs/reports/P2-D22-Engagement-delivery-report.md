# Engineering Delivery Report — P2-D22

**Unified Communication, Engagement & Collaboration Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D22 — Unified Communication, Engagement & Collaboration Platform                                                                                                                                                                                                                                                                                                                                           |
| **Status**     | ✅ Complete — CI green; merged to `main` (`51af994`). In-sandbox: `@knowget/engagement` typecheck/lint/format/build clean, **54 tests** (17 files); `apps/api` typecheck/lint/build clean + engagement DI-graph spec in the **212-test** api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**253** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M01 (Organization — the audience/announcement owner), P2-D01-M02 (Person — the authors, participants and respondents), P1-M05 (`@knowget/notifications`, the channel-delivery service the published announcement is handed to; `@knowget/documents`), P2-D04 (Family & Guardian, ADR-0023 — where the communication profile / contact preferences live), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)         |
| **Date**       | 23 December 2026                                                                                                                                                                                                                                                                                                                                                                                              |
| **Next**       | P2-D23 — next Program D (Campus & Engagement) contract                                                                                                                                                                                                                                                                                                                                                        |

---

## 1. Mission recap

Deliver the **Unified Communication, Engagement & Collaboration Platform** — the institution's **engagement
system of record** and the **fourth contract of Program D (Campus & Engagement)**: the audiences it addresses,
the announcements it broadcasts and the acknowledgement receipts they draw, the message threads and their
messages, the surveys it runs and the responses they collect, and the descriptive per-audience engagement
profile. It is named `@knowget/engagement` — **not** the platform `@knowget/notifications` delivery service
(P1-M05) — an institution-facing domain on a distinct `engagement.*` event namespace; notifications performs
channel delivery, this domain composes and records the message. Three decisions shape it: several quantities
are **derived, not stored** — an announcement's reach and a survey's distribution + response rate — so the
design begins with two pure engines; **this domain carries no money**; and, distinctively, **three of the
eight aggregates are immutable append-only logs** (acknowledgement receipt, message, survey response). Two
boundaries define it: **channel delivery is not here** (email/SMS/push/in-app is the notifications service,
P1-M05, invoked when an announcement publishes) and **contact/communication preferences are not here** (the
communication profile is Family & Guardian's, P2-D04). Identity is referenced not duplicated — an
audience/announcement's org is an Organization; an author, participant and respondent is a Person. Real-time
chat transport, content moderation, document rendering and prediction (sentiment, send-time optimization,
P2-D28) are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: the **engagement engine** (`computeAnnouncementReach` — an announcement's audience size vs acknowledgements into acknowledged/pending + an acknowledgement percent, capped/empty-safe/clamped; `summarizeEngagement` — the campaign rollup, **capping each item at its own audience size** so no >100% rollup); and the **survey-tally engine** (`tallySurveyResponses` — the per-question distribution, per-declared-option counts for choice types, unknown values ignored; `computeResponseRate` — audience size vs responses) |
| **Domain**           | `@knowget/engagement` — eight aggregates (Audience, Announcement, AcknowledgementReceipt, MessageThread, Message, Survey, SurveyResponse, EngagementProfile — three of them **immutable append-only**), each an immutable aggregate + factory + guarded transitions with an application service, plus the `EngagementProfileService` integration spine; value objects (audience/announcement/thread/survey statuses, categories, priorities, question types). **No money; three write-once logs; money-free, free-text-free, PII-free events**                                                        |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261223000000_add_engagement`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; counts/percents **INTEGER**, member/participant/question/answer sets **JSONB**, the pinned flag **BOOLEAN**, dates/codes/titles/bodies **TEXT**; **all uniqueness DB-backed** (audience code; one ack per (announcement, person); one identified response per (survey, respondent), NULL-distinct so anonymous is unbounded; one profile per audience)                               |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `communication/*` (audiences, announcements, acknowledgements, threads, messages) under `communication:read`/`:write` and `engagement/*` (surveys, responses, the engagement profile) under `engagement:read`/`:write`; zod DTOs; eight Prisma/RLS adapters (the three immutable ones omit `remove`) + two directory adapters (Organization, Person); `EngagementModule` importing the Organization and Person modules, registered in `app.module`                                                                                           |
| **Events**           | Money-free, free-text-free, PII-free domain events on `engagement.*` — audience created/renamed/description-set/criteria-set/members-added/members-removed/archived; announcement drafted/content-edited/category-set/priority-set/scheduled/published/pinned/unpinned/archived/cancelled; acknowledgement recorded; thread opened/participant-added/closed/reopened/archived; message posted; survey created/questions-edited/title-set/opened/closed/archived; survey response submitted; engagement profile refreshed                                                                              |
| **Docs & decisions** | ADR-0041 (platform + the dual pure engines + the no-money decision + the three immutable logs + the notifications P1-M05 delivery boundary and Family & Guardian P2-D04 preferences boundary + the `@knowget/notifications` naming distinction); this report; platform-state, technical-debt (TD-42) and CHANGELOG updates                                                                                                                                                                                                                                                                            |

## 3. Domain capabilities & invariants

- **Reach & response are derived.** An announcement's reach (and the campaign rollup) is computed by the
  engagement engine from the acknowledgement receipts; a survey's distribution and response rate are computed
  by the tally engine from the responses — never stored. The rollup **caps each announcement at its own
  audience size**, so a stale over-count cannot exceed 100%.
- **Audience master.** An audience `active → archived` (code unique per tenant, a de-duplicated opaque set of
  member Person ids, its size feeding the engines); an archived audience cannot be targeted. Member ids are
  **not per-item validated** (the organization is the anchor, TD-42).
- **Announcement.** `draft → scheduled → published → archived` (or `cancelled` pre-publication), content and
  category/priority frozen once published, pinned only while published, org derived from the audience.
  **Channel delivery is the notifications service's (P1-M05).**
- **Threads & messages.** A thread `open ↔ closed → archived` with ≥2 validated participants; a message is
  posted (immutable) **only to an open thread and only by a participant**. The thread stores no message
  list/count — messages are the separate append-only log.
- **Surveys & responses.** A survey `draft → open → closed → archived` with a validated JSONB question set,
  frozen once open; a response (immutable) is submitted **only to an open survey**, answers reference defined
  questions, single-choice/rating answers carry one value, answers are de-duplicated. An **anonymous (null)
  respondent** is allowed and unbounded; **one identified response per (survey, respondent)** is DB-backed.
- **Immutable logs.** Acknowledgement receipts, messages and survey responses are write-once — no edit, no
  delete — feeding the two engines. The ack/response dedup guards are **backed by DB unique indexes**.
- **Engagement profile.** A descriptive read model, one per audience, **refreshed** from the engines
  (published announcements + issued surveys; **draft surveys excluded**). Descriptive only — **never a
  forecast** (P2-D28).
- **Money-free, free-text-free, PII-free events.** No event payload carries a cost, an audience name, an
  announcement title/body, a message body, a survey title/question, or a response's answers — only ids,
  codes, categories, types, statuses and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (engagement; survey-tally) were built and exhaustively tested before
  any aggregate depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/engagement` — **54 tests** (announcement reach incl. empty/over-cap/negative and the
  per-item-capped rollup; the survey tally incl. per-option counts, unknown-value handling, multi-choice and
  empty-safe; the response rate; every aggregate lifecycle incl. the terminal-state and frozen-content guards;
  the immutable records; the service validations incl. published/open gates, participant-author, dedup, org
  derivation, and the single-value cardinality guard; the money-free/free-text-free/PII-free event content;
  and an end-to-end audience → announcements → acknowledgements → surveys → responses → profile spine).
  `apps/api` — the engagement DI-graph integration spec compiles the full module and asserts every service
  token resolves.
- **Gates.** `@knowget/engagement` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck, ESLint
  and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (engagement 54, api 212; all
  **253** prisma-independent turbo tasks green); the full Prisma build and DB-integration tests are
  CI-verified (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**; verified
  that tenant A and tenant B each see only their own rows, an unset tenant sees zero (fail-closed), a
  cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), FORCE RLS + the `tenant_isolation` policy
  is present on all eight tables (8/8), the **JSONB member/answer sets, the BOOLEAN pinned flag and the
  INTEGER counts round-trip exactly**, and **two anonymous (NULL-respondent) responses both persist** (the
  NULL-distinct unique index leaves anonymous responses unbounded while identified ones are unique).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole milestone.
  The persistence/API audit was **clean across all categories** (schema/migration column-by-column parity incl.
  the JSONB/BOOLEAN/INTEGER columns, adapter field fidelity incl. the three append-only repositories with no
  `remove` and the DB-backed uniques, correct delegates + status-filtered queries, controller scope split +
  route ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items** and
  surfaced **one medium and several low findings, all fixed before merge** — the survey-tally value-cardinality
  over-count (a single-choice/rating answer with multiple/duplicate values could over-count; now de-duplicated
  and rejected with `SingleValueQuestionError`), the uncapped engagement rollup (now caps each item at its
  audience size), the draft surveys deflating the response rate (now excluded), the spurious no-op
  participant-added event (now skipped), and three never-thrown error classes (removed).

## 5. Decisions

Recorded in **ADR-0041**: two pure engines (engagement; survey-tally) as the computational core built first;
**no money**; **three immutable append-only logs** (acknowledgement, message, survey response — their
repositories have no `remove`); one package for all eight aggregates; the audience recipient master (members
opaque, not per-item validated — TD-42); the announcement publish lifecycle (delivery → notifications P1-M05);
the thread/message conversation (participant-author, open-only); the survey/response feedback instrument
(one-identified-response-per-respondent, anonymous unbounded); the descriptive engagement profile and the
refresh spine; **two scope pairs — `communication:*` and `engagement:*`**; persistence per ADR-0010 with FORCE
RLS verified live and **all uniqueness absolute and DB-backed** (no status-scoped TOCTOU debt, like P2-D21 and
unlike D16–D20; the ack/response dedup guards are DB-backed, NULL-distinct for anonymity); the
`@knowget/engagement` naming distinct from the platform `@knowget/notifications`; and the Family & Guardian
(P2-D04) preferences boundary.

## 6. Technical debt

- **TD-42 (new, low).** An audience's **member Person ids are stored as an opaque JSONB set and are not
  per-item existence-validated** on write — an audience may hold thousands of members, so validating each
  would add a directory call per element per write; the organization is the validated anchor, and thread
  participants (a small explicit set) _are_ validated. Tightening audience membership to validate each id is a
  later refinement behind the service (ADR-0041). Mirrors TD-29 / TD-30 / TD-31 (the array-cross-reference
  family). Note: like P2-D21 and unlike D16–D20, this domain carries **no status-scoped uniqueness TOCTOU
  debt** — every uniqueness rule, including the acknowledgement and survey-response dedup guards, is
  **absolute and DB-backed** (the response unique is NULL-distinct, so anonymous responses stay unbounded).
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the engagement events ride the
  same bus.

## 7. Outcome — merged to `main`, proceed to P2-D23

The Unified Communication, Engagement & Collaboration Platform is complete behind its gates: announcement
reach and survey response rates are derived consistently by pure engines (the rollup capped per item, draft
surveys excluded), three of the eight aggregates are immutable append-only logs, the no-money boundary and the
delivery (notifications, P1-M05) and preferences (Family & Guardian, P2-D04) boundaries are held structurally,
and all eight tables are FORCE-RLS tenant-isolated (verified live, JSONB/BOOLEAN/INTEGER round-tripping
exactly, cross-tenant insert rejected 42501, anonymous responses unbounded); both independent audits were
resolved clean (one medium + several low domain findings fixed before merge). CI is green and the milestone is
**merged to `main` (`51af994`)**, the fourth contract of Program D (Campus & Engagement); next is **P2-D23**.
**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated
across the P2-D18/D19/D20/D21/D22 boundaries.
