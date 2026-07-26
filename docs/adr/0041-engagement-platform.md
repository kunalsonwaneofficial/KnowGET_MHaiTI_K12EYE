# 41. Unified Communication, Engagement & Collaboration: one package, eight aggregates, two pure engines, three immutable logs, and no money

- **Status:** Accepted
- **Date:** 2026-12-23
- **Contract:** P2-D22 (Unified Communication, Engagement & Collaboration Platform)

## Context

P2-D22 is **the fourth contract of Program D — Campus & Engagement** (D19–D24), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D01-M02 person base. It is the
authoritative domain for **how the institution communicates with its community and measures their
engagement**: the audiences it addresses, the announcements it broadcasts and the acknowledgement receipts
they draw, the message threads between stakeholders and the messages within them, the surveys it runs and the
responses they collect, and the descriptive per-audience engagement profile. It is a peer of the operational
domains delivered before it (health-centre P2-D19, facilities P2-D20, campus-security P2-D21): those manage
care, the built environment and physical safety; this one manages **the conversation between the institution
and its people**.

The name is deliberate. This domain is `@knowget/engagement`, **not** `@knowget/notifications` — the latter is
the platform's low-level channel-delivery service (P1-M05: email / SMS / push / in-app, templates, a
dispatcher, an in-app inbox). This is the institution-facing domain of communication and engagement
(audiences, announcements, threads, surveys); when an announcement is published, _delivering_ it over channels
is the notifications service's job, while _recording_ the announcement, its audience and its reach is this
domain's. The two are complementary layers, and this domain's events ride a distinct `engagement.*` namespace.

Three decisions shape the design. First, several quantities are **derived, not stored** — an announcement's
**reach** (its audience size against the acknowledgements it has drawn, rolled across announcements), and a
survey's **response distribution** and **response rate** — so, as with every operational domain, the design
begins with the pure engines that compute them, not with an aggregate. Second, **this domain carries no
money** — there is nothing to bill or buy in communicating with a community. Third, and distinctively, **three
of the eight aggregates are immutable append-only logs**: an acknowledgement receipt, a message and a survey
response are each written once and never edited — a communication domain is unusually write-once, and these
logs are exactly what the two engines summarize.

Two boundaries bound it. First, **channel delivery is not here** — the mechanics of sending an email, an SMS,
a push or an in-app message belong to the **notifications service (P1-M05)**; this domain composes the
institutional message and records it, and a real deployment hands the published announcement to notifications
for fan-out. Second, **contact and communication preferences are not here** — a guardian's preferred channel,
language and opt-outs live in **Family & Guardian (P2-D04, the communication profile)**; this domain reads and
respects them (a delivery-time concern), never re-models them. Identity is referenced, not re-modelled: an
audience's and an announcement's organization is an **Organization (P2-D01-M01)**, and an announcement author,
a thread participant and a survey respondent are a **Person (P2-D01-M02)**.

## Decision

1. **Two pure engines are the computational core, built and tested first.** The **engagement engine**
   (`computeAnnouncementReach`, `summarizeEngagement`): the first values an announcement's reach — its
   audience size against the number who have acknowledged it, the still-pending count and an acknowledgement
   percent (capped at 100, empty-safe, clamped); the second rolls a set of announcement reaches into a
   campaign picture (announcement count, total audience, total acknowledged, overall acknowledgement percent),
   **capping each item's acknowledged count at its own audience size** so a stale over-count cannot push the
   rollup above 100%. The **survey-tally engine** (`tallySurveyResponses`, `computeResponseRate`): the first
   reduces a survey's questions and its responses into a per-question distribution (per-declared-option counts
   for the closed-form choice types, an answered count for all; unknown values ignored, a value seeded at 0),
   the second values the survey's response rate (audience size against responses). All are pure, deterministic
   and **clock-free** — reach is a **percent**, a tally is a **count**, never money.

2. **Three aggregates are immutable append-only logs.** An `AcknowledgementReceipt` (a person acknowledged a
   published announcement), a `Message` (an author posted to a thread) and a `SurveyResponse` (a respondent
   submitted to a survey) each have no lifecycle and no edit or delete path (their repositories deliberately
   omit `remove`). A correction is a new record, never an edit. The receipt count is exactly the engagement
   engine's acknowledged count; the response set is exactly the tally engine's input. These are the
   high-volume, write-once tables of the domain.

3. **This domain has no money — communication is not billed.** `@knowget/engagement` imports no money core and
   defines no monetary field: audience sizes, member/participant/response counts, reach and response percents
   are all **integers**; nothing is a currency amount.

4. **One domain package, `@knowget/engagement`, for all eight aggregates** — the same single-bounded-context
   choice as the twenty prior domains (ADR-0021…0040). A shared spine (`errors.ts`, `ports.ts`,
   `engagement-events.ts`, `engagement-value.ts`, `engagement-view.ts`, `index.ts`), the two engines
   (`engagement.ts`, `survey-tally.ts`), and a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`),
   plus the `engagement-profile-service.ts` integration spine.

5. **The audience is the reusable recipient master.** An audience is a named group with a code (unique per
   tenant), a name, an optional description and criteria label, and a **de-duplicated set of member Person
   ids** held opaquely; it runs `active → archived` (terminal), and an archived audience cannot be targeted by
   a new announcement or survey. Its **size** (the member count) is what the reach and response-rate engines
   read. The member ids are **not per-item existence-validated** on write — the audience can be large, so the
   organization is the validated anchor (TD-42); thread participants (a small set) _are_ validated.

6. **An announcement is a one-to-many broadcast with a publish lifecycle.** An announcement targets an
   audience with a title, a body, a category and a priority; it runs `draft → scheduled → published →
archived`, with `cancelled` from a pre-published state. Content and category/priority are **editable only
   before publication** (a published announcement is frozen), it is **pinned only while published**, and its
   organization is derived from the audience. Publishing records the institutional fact; **channel delivery is
   the notifications service's (P1-M05)**, not performed here.

7. **A message thread is a conversation; a message is an immutable entry.** A thread carries a subject and a
   set of **at least two distinct participant Persons** (each validated); it runs `open ↔ closed → archived`,
   and only an open thread accepts a message. A message is posted to an open thread **only by a participant**,
   its organization derived from the thread. The thread stores no message list or count — the messages are the
   separate append-only log — so the two aggregates stay independent.

8. **A survey is a feedback instrument; a response is an immutable submission.** A survey targets an audience
   with a validated, normalized **question set held as JSONB** (unique non-blank keys and prompts; the choice
   types carry at least two unique options; a text question carries none); it runs `draft → open → closed →
archived`, with questions and title **frozen once open**. A response is submitted **only to an open
   survey**, every answer must reference a question the survey defines, a single-choice/rating answer carries
   at most one value, and answers are de-duplicated. The respondent is optional — a **null respondent is an
   anonymous response** — and **one identified response per (survey, respondent)** is enforced (anonymous
   responses are unbounded).

9. **The engagement profile is a descriptive read model, never a transaction.** One per audience, it carries
   the audience's size, its published-announcement reach (count, total acknowledged, overall acknowledgement
   percent) and its issued-survey response picture (count, total responses, overall response percent),
   **refreshed** (overwritten) whenever the picture changes; every field is derived and re-derivable, so it
   holds no truth of its own. Draft surveys are excluded (they cannot collect responses), mirroring the
   published-only announcement roll-up. It is always derived, never posted to directly, and **never a
   forecast** (P2-D28).

10. **The engagement-profile refresh is the integration spine.** `EngagementProfileService.refresh` resolves
    an audience, rolls its published announcements against their acknowledgement receipts through the
    engagement engine and its issued surveys against their responses through the response-rate engine, and
    composes or refreshes the one profile per audience, publishing the refreshed event. A pure aggregation of
    primary data.

11. **Two permission scope pairs split the platform along its surface.** `communication:read`/
    `communication:write` gate the **messaging surface** (audiences, announcements and their acknowledgement
    receipts, threads and their messages); `engagement:read`/`engagement:write` gate the **feedback surface**
    (surveys, their responses and the per-audience engagement profile). The two are separately administered,
    so they do not share a scope. Nothing is billed here; nothing is gated on money.

12. **Persistence per ADR-0010, no money.** Eight tables (`audience`, `announcement`,
    `acknowledgement_receipt`, `message_thread`, `message`, `survey`, `survey_response`, `engagement_profile`)
    with Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE
ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) —
    verified on live PostgreSQL. Counts and percents are **INTEGER**; the audience member set, thread
    participant set, survey questions and response answers are **JSONB**; an announcement's pinned flag is
    **BOOLEAN**; every date/ISO stamp and every code, name, title, body, subject and label is **TEXT**.

13. **All of the domain's uniqueness invariants are absolute and DB-backed.** Audience code per tenant, **one
    acknowledgement per (announcement, person)**, **one identified response per (survey, respondent)** and one
    profile per audience each have a DB unique index. Because Postgres treats NULLs as distinct, the response
    unique lets a **null (anonymous) respondent repeat**, so anonymous responses are unbounded while identified
    ones are unique — exactly the intent, enforced by the database. There is **no status-scoped "one active X
    per Y" check-then-act guard here** (the three logs are append-only; an audience is referenced by many
    announcements and surveys), so this domain does **not** carry the TOCTOU debt of D16–D20 (TD-36…TD-40); the
    services' dedup pre-checks are backed by the DB uniques.

14. **Domain events on the platform bus carry no money, no free text and no PII** — audience created / renamed
    / description-set / criteria-set / members-added / members-removed / archived; announcement drafted /
    content-edited / category-set / priority-set / scheduled / published / pinned / unpinned / archived /
    cancelled; acknowledgement recorded; thread opened / participant-added / closed / reopened / archived;
    message posted; survey created / questions-edited / title-set / opened / closed / archived; survey response
    submitted; engagement profile refreshed. Payloads carry ids, codes, categories, priorities, types,
    statuses and counts only — **never an audience name, an announcement title or body, a message body, a
    survey title or question, or a response's answer content**.

15. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Person
    (P2-D01-M02, the announcement authors, thread participants and survey respondents) existence are validated
    on write; an announcement and a survey derive their org from the target audience. The engagement domain
    links to those domains and never depends on their packages directly.

16. **Audience membership is stored without per-item validation (TD-42).** An audience's member Person ids are
    held as an opaque JSONB set and are not each existence-validated on write — an audience may hold thousands
    of members, so validating each would add a directory call per element per write; the organization is the
    validated anchor. Thread participants (a small, explicit set) _are_ validated. Tightening audience
    membership to validate each id is a later refinement behind the service. Recorded as **TD-42** (mirrors
    TD-29 / TD-30 / TD-31, the array-cross-reference family).

17. **Explicit non-goals.** No channel delivery — sending over email / SMS / push / in-app is the
    notifications service (P1-M05), which a deployment invokes when an announcement publishes; no contact or
    communication preferences (Family & Guardian, P2-D04, owns the communication profile); no document
    generation or rendering (the documents service, P1-M05); no real-time chat transport / websockets /
    typing indicators (threads and messages are a system of record, not a live transport); no content
    moderation; and no prediction — sentiment analysis, send-time optimization and engagement forecasting are
    the intelligence core (P2-D28). This domain is the operational engagement system of record those build on.

## Consequences

- **A unified engagement system of record.** An institution runs its audiences, announcements, acknowledgement
  receipts, message threads, messages, surveys, responses and per-audience engagement profile in one place, on
  top of the organization and person bases, with reach and response metrics derived from primary data.
- **Reach and response rates are exact and consistent by construction.** An announcement's reach, a survey's
  distribution and its response rate are computed by pure engines from the acknowledgement and response logs,
  so every reader gets the same figure and nothing drifts from a stored copy.
- **The money boundary is held structurally.** With no monetary field anywhere, nothing financial can leak in.
- **The delivery and preferences boundaries are held structurally.** This domain composes and records the
  institutional message; it does not send it (notifications, P1-M05) or hold the recipient's preferences
  (Family & Guardian, P2-D04), so it cannot duplicate or drift from either.
- **The logs are write-once.** Acknowledgements, messages and responses are immutable and append-only, so the
  two engines always summarize recorded facts and a record can never be silently rewritten.
- **Anonymity and uniqueness coexist at the database.** One acknowledgement per person per announcement, and
  one identified response per person per survey, are DB-backed uniques; a null respondent repeats freely, so
  anonymous surveying is unbounded — enforced by the schema, not just the service.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise
  announcement reach (including empty / over-cap / negative and the per-item-capped rollup), the survey tally
  (per-declared-option counts, unknown-value handling, multi-choice, empty-safe), the response rate, every
  aggregate lifecycle (including the terminal-state and frozen-content guards), the immutable records, the
  service validations (published/open gates, participant-author, dedup, org derivation, single-value
  cardinality), the money-free / free-text-free / PII-free content of every event, and an end-to-end audience
  → announcements → acknowledgements → surveys → responses → profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live PostgreSQL
  with the INTEGER, JSONB, BOOLEAN and TEXT columns round-tripping exactly, a cross-tenant INSERT rejected
  (SQLSTATE 42501), and the anonymous-response unbounded / identified-response unique behaviour confirmed. Two
  independent adversarial audits (domain; persistence/API) were run — the persistence/API audit clean across
  all categories, the domain audit with one medium finding (the survey-tally value-cardinality over-count) and
  several low findings all fixed before merge (the capped rollup, the draft-survey exclusion, the no-op
  participant event, three dead error classes).
- **Deferred, interface-protected.** Audience membership is stored without per-item validation (**TD-42**);
  domain Prisma adapters remain at the composition root (TD-21). One cohesive package, acceptable for a single
  bounded context (as with the twenty prior domains). Like campus-security (P2-D21) and unlike D16–D20, this
  domain carries **no status-scoped uniqueness TOCTOU debt** — every uniqueness rule, including the two dedup
  guards, is absolute and DB-backed. This is the fourth contract of **Program D** and the operational
  engagement base the remaining campus and intelligence-core domains build on.
