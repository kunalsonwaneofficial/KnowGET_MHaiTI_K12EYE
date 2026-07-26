# 42. Admissions, Marketing, Enrollment & Growth: one package, eight aggregates, two pure engines, two immutable records, no money, and the Student-Lifecycle hand-off

- **Status:** Accepted
- **Date:** 2026-12-24
- **Contract:** P2-D23 (Admissions, Marketing, Enrollment & Growth Platform)

## Context

P2-D23 is **the fifth contract of Program D — Campus & Engagement** (D19–D24), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D01-M02 person base. It is the
authoritative domain for **how the institution attracts, admits and enrolls its next cohort**: the marketing
campaigns it runs and the leads they draw, the admission cycles it opens with their per-grade seat plans, the
applications families submit and the entrance evaluations they gather, the offers extended and the enrollment
confirmations that close the funnel, and the descriptive per-cycle funnel profile. It is a peer of the domains
delivered before it in Program D (health-centre P2-D19, facilities P2-D20, campus-security P2-D21, engagement
P2-D22): those manage care, the built environment, physical safety and the community conversation; this one
manages **the pipeline that grows the institution**.

The boundary with **Student Lifecycle (P2-D03)** is the defining decision. P2-D03 owns the
prospect/applicant/student **records** and the enrolled-student lifecycle. This domain does **not** re-model
them: an application references its applicant as a **Person (P2-D01-M02)**, and a confirmed enrollment is the
**hand-off point** — `EnrollmentConfirmation` emits `admissions.enrollment.confirmed`, carrying the applicant
person, grade and cycle, which Student Lifecycle consumes to enrol the student; `student_id` records the
resulting student reference once known. Admissions runs the funnel that _ends_ where Student Lifecycle
_begins_.

Three further decisions shape the design. First, several quantities are **derived, not stored** — the
admissions **funnel** (leads → applications → offers → enrollments and the conversion rate between each stage)
and a cycle's **seat intake** (confirmed enrollments against the per-grade capacity) — so, as with every
operational domain, the design begins with the pure engines that compute them, not with an aggregate. Second,
**this domain carries no money** — application and admission **fees are Finance's (P2-D14)**; nothing here is
billed. Third, **two of the eight aggregates are immutable append-only records**: an admission evaluation and
an enrollment confirmation are each written once and never edited — a screening result and a confirmed seat
are facts, and the confirmation is exactly the funnel-closing signal Student Lifecycle consumes.

## Decision

1. **Two pure engines are the computational core, built and tested first.** The **funnel engine**
   (`computeAdmissionFunnel`, `summarizeApplicationStages`): the first values the admissions funnel — the
   stage counts (leads → applications → offers → enrollments) and the conversion rate between each adjacent
   pair plus the overall lead → enrollment rate, **each rate capped at 100** (a stage cannot convert more than
   the one before it) and empty-safe; the second tallies a set of applications into a per-status distribution.
   The **intake engine** (`computeIntakeCapacity`, `summarizeIntake`): the first values a grade's seat intake
   — confirmed places against capacity, seats remaining, whether it is over-subscribed and a fill percent (a
   capacity of **0 means untracked/no limit**); the second rolls a cycle's per-grade intakes into a cycle-wide
   picture (grade count, total capacity, total confirmed, overall fill). All are pure, deterministic and
   **clock-free** — a rate and a fill are **percents**, a stage is a **count**, never money.

2. **Two aggregates are immutable append-only records.** An `AdmissionEvaluation` (one entrance evaluation —
   type, a 0–100 score, a recommendation — recordable only while its application is `under_review` or at
   `interview`) and an `EnrollmentConfirmation` (an accepted offer turned into a confirmed seat) each have no
   lifecycle and no edit or delete path (their repositories omit `remove`). A re-evaluation is a new record;
   a reversal is a separate withdrawal concern, not an edit. The confirmation is the funnel-closing fact and
   the Student-Lifecycle hand-off signal.

3. **This domain has no money — admissions is not billed here.** `@knowget/admissions` imports no money core
   and defines no monetary field: an evaluation score, every funnel count and every conversion/fill percent
   are **integers**; **application and admission fees are Finance's (P2-D14)**.

4. **One domain package, `@knowget/admissions`, for all eight aggregates** — the same single-bounded-context
   choice as the twenty-one prior domains (ADR-0021…0041). A shared spine (`errors.ts`, `ports.ts`,
   `admissions-events.ts`, `admissions-value.ts`, `admissions-view.ts`, `index.ts`), the two engines
   (`funnel.ts`, `intake.ts`), and a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), plus the
   `admissions-funnel-profile-service.ts` integration spine.

5. **A marketing campaign is a growth drive; a lead is the top of the funnel.** A `MarketingCampaign` runs a
   channel over an optional period (`draft → active → completed | cancelled`, code unique per tenant);
   marketing message _delivery_ is the notifications (P1-M05) / engagement (P2-D22) concern — this aggregate
   records the campaign, not the send. A `Lead` is an inbound inquiry (`new → contacted → qualified →
converted`, with `lost` from any open state, code unique per tenant), carrying a contact name and optional
   phone/email **held on the aggregate, never on an event**, an acquisition source and an optional attributed
   campaign (validated). Leads are **organization-level** (the top of the funnel is not yet cycle-specific).

6. **An admission cycle is an intake season with a per-grade seat plan.** An `AdmissionCycle` carries an
   academic year and a **per-grade seat plan held as JSONB** (`planning → open → closed → archived`, code
   unique per tenant); the seat plan is editable only before the cycle closes, and it feeds the intake engine
   against confirmed enrollments. Applications are accepted **only while the cycle is open**.

7. **An application is the admissions-process record; the applicant is a Person, not a duplicate.** An
   `Application` references its applicant as a **Person (P2-D01-M02)** and, optionally, the originating lead
   (validated), for a grade in a cycle (`submitted → under_review → interview → offered`, with `waitlisted`,
   `rejected` and `withdrawn` terminal branches, code unique per tenant); the organization is derived from the
   cycle, and an application is submittable only to an **open** cycle. The prospect/applicant/student record is
   **Student Lifecycle's (P2-D03)**, referenced by id.

8. **An offer is one per application; accepting it bridges to an enrollment.** An `Offer` is extended only for
   an application that has reached `offered`, for a grade and cycle derived from the application, with an
   optional response deadline (`extended → accepted | declined | expired | withdrawn`); **one offer per
   application** is DB-backed. Accepting an offer is the sole precondition for confirming an enrollment.

9. **An enrollment confirmation closes the funnel and hands off to Student Lifecycle.** An
   `EnrollmentConfirmation` (immutable) is confirmed **only from an accepted offer**, **one per offer**
   (DB-backed), deriving the organization, cycle, grade and applicant from the offer and its application. It
   publishes `admissions.enrollment.confirmed` — the signal **Student Lifecycle (P2-D03)** consumes to enrol
   the student; `student_id` records the resulting student reference once known. This domain confirms the
   seat; P2-D03 owns the enrolled student.

10. **The funnel profile is a descriptive read model, never a transaction.** One per cycle, an
    `AdmissionsFunnelProfile` snapshots the two engines' outputs (the funnel stage counts + conversion rates
    and the cycle-wide intake fill), **refreshed** (overwritten) whenever the picture changes; every field is
    derived and re-derivable, so it holds no truth of its own. It is always derived, never posted to directly,
    and **never a forecast** (P2-D28).

11. **The funnel-profile refresh is the integration spine.** `AdmissionsFunnelProfileService.refreshForCycle`
    reads the organization's lead volume and the cycle's application, offer and enrollment counts, values the
    funnel with `computeAdmissionFunnel`, values the cycle's per-grade seat plan against confirmed enrollments
    with `computeIntakeCapacity` / `summarizeIntake`, and upserts the one profile per cycle, publishing the
    refreshed event. Live read helpers (`funnelForCycle`, `intakeByGrade`) derive the same numbers on demand
    without persisting. A pure aggregation of primary data. The **intake picture reflects the declared seat
    plan only**: an enrollment for a grade absent from the plan is counted in the funnel's enrollment total but
    not attributed to any seat capacity.

12. **Two permission scope pairs split the platform along its surface.** `marketing:read`/`marketing:write`
    gate the **growth surface** (campaigns, leads); `admissions:read`/`admissions:write` gate the
    **admissions-process surface** (cycles, applications, evaluations, offers, enrollments, the funnel
    profile). The two are separately administered, so they do not share a scope. Nothing is billed here;
    nothing is gated on money.

13. **Persistence per ADR-0010, no money.** Eight tables (`marketing_campaign`, `lead`, `admission_cycle`,
    `application`, `admission_evaluation`, `offer`, `enrollment_confirmation`, `admissions_funnel_profile`)
    with Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE
ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) —
    verified on live PostgreSQL. An evaluation score and every funnel count/percent are **INTEGER**; a cycle's
    seat plan is **JSONB**; every date/ISO stamp and every code, name, channel, source, status, grade and
    contact detail is **TEXT**.

14. **All of the domain's uniqueness invariants are absolute and DB-backed.** Campaign / lead / cycle /
    application code per tenant, **one offer per application**, **one enrollment per offer** and one funnel
    profile per cycle each have a DB unique index. There is **no status-scoped "one active X per Y"
    check-then-act guard here** (the two immutable records are append-only; a cycle is referenced by many
    applications), so this domain does **not** carry the TOCTOU debt of D16–D20 (TD-36…TD-40); like P2-D21 and
    P2-D22, the services' dedup pre-checks are backed by the DB uniques.

15. **Domain events on the platform bus carry no money, no free text and no PII** — campaign created / renamed
    / channel-set / period-set / activated / completed / cancelled; lead created / contact-updated / contacted
    / qualified / converted / lost; cycle created / renamed / seat-plan-set / window-set / opened / closed /
    archived; application submitted / review-started / interview-scheduled / offered / waitlisted / rejected /
    withdrawn; evaluation recorded; offer extended / accepted / declined / expired / withdrawn; enrollment
    confirmed; funnel profile refreshed. Payloads carry ids, codes, channels, sources, statuses, grades,
    scores and counts only — **never a campaign name, a lead's contact name / phone / email, or an applicant
    identity beyond an id**.

16. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Person
    (P2-D01-M02, the applicant) existence are validated on write; an application derives its org from the
    target cycle and validates an optional attributed lead; a lead validates an optional attributed campaign.
    The admissions domain links to those domains and never depends on their packages directly.

17. **Seat capacity is advisory, not enforced (TD-43).** `EnrollmentConfirmationService.confirm` does **not**
    reject a confirmation when a grade's confirmed enrollments reach or exceed its declared `capacity`. The
    intake engine _derives_ an `overSubscribed` / `remaining` signal (surfaced on the per-grade intake view and
    the funnel profile's fill percent) for monitoring, but the write path does not block — **deliberate**,
    because admissions routinely over-offer against expected melt, and a capacity of 0 means untracked/no
    limit. A hard seat cap is therefore offered as an **opt-in** refinement behind the service, not a default.
    Recorded as **TD-43** (mirrors TD-41, the advisory-signal family).

18. **Explicit non-goals.** No money — application and admission fees are Finance's (P2-D14); no
    prospect/applicant/student records or the enrolled-student lifecycle (Student Lifecycle, P2-D03, which a
    confirmed enrollment hands off to via event); no marketing message delivery (notifications P1-M05 /
    engagement P2-D22 — this domain records the campaign, not the send); no scholarship / financial-aid
    modelling (Finance, P2-D14); and no prediction — yield forecasting, lead scoring and enrollment
    simulation are the intelligence core (P2-D28). This domain is the operational admissions system of record
    those build on.

## Consequences

- **A unified admissions-and-growth system of record.** An institution runs its campaigns, leads, admission
  cycles, applications, evaluations, offers, enrollment confirmations and per-cycle funnel profile in one
  place, on top of the organization and person bases, with the funnel and intake derived from primary data.
- **The funnel and intake are exact and consistent by construction.** Conversion rates and seat fill are
  computed by pure engines from the underlying records, so every reader gets the same figure and nothing
  drifts from a stored copy; each rate is capped so no stage exceeds the one before it.
- **The Student-Lifecycle boundary is held by event.** A confirmed enrollment is the single hand-off point;
  this domain never re-models the student, and P2-D03 enrolls off the `admissions.enrollment.confirmed`
  signal.
- **The money boundary is held structurally.** With no monetary field anywhere, nothing financial can leak in;
  fees stay in Finance (P2-D14).
- **The records are write-once.** An evaluation and an enrollment confirmation are immutable and append-only,
  so the engines always summarize recorded facts and a record can never be silently rewritten.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise the
  funnel (including empty / over-cap / negative and the per-stage rate caps), the application-stage tally, the
  intake capacity (including the untracked-capacity and over-subscribed cases) and its rollup, every aggregate
  lifecycle (including the terminal-state guards), the two immutable records, the service validations (open-
  cycle / offered-application / accepted-offer gates, the dedup pre-checks, org derivation, the applicant /
  lead / campaign existence checks), the money-free / free-text-free / PII-free content of every event
  (notably the lead payload omitting the contact name/phone/email), and an end-to-end campaign → lead → cycle →
  application → evaluation → offer → enrollment → funnel-profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live PostgreSQL
  with the INTEGER, JSONB and TEXT columns round-tripping exactly, a cross-tenant INSERT rejected (SQLSTATE
  42501), and the one-offer-per-application / one-enrollment-per-offer / one-profile-per-cycle uniques
  rejecting duplicates (SQLSTATE 23505). Two independent adversarial audits (domain; persistence/API) were
  run — the persistence/API audit clean across all categories, the domain audit surfacing one confirmed
  low-severity defect (an empty application grade threw the code error) and two integrity/consistency
  refinements (validating an application's optional attributed lead; de-duplicating the open-status source of
  truth), all fixed before merge with regression tests.
- **Deferred, interface-protected.** Seat capacity is advisory (**TD-43**, an opt-in hard cap deferred);
  domain Prisma adapters remain at the composition root (TD-21). One cohesive package, acceptable for a single
  bounded context (as with the twenty-one prior domains). Like P2-D21 and P2-D22 and unlike D16–D20, this
  domain carries **no status-scoped uniqueness TOCTOU debt** — every uniqueness rule, including the two dedup
  guards, is absolute and DB-backed. This is the fifth contract of **Program D** and the operational
  admissions base the remaining Program-D (Alumni, P2-D24) and intelligence-core domains build on.
