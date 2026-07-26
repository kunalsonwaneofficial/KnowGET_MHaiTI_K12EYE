# Engineering Delivery Report — P2-D23

**Admissions, Marketing, Enrollment & Growth Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P2-D23 — Admissions, Marketing, Enrollment & Growth Platform                                                                                                                                                                                                                                                                                                                                                                         |
| **Status**     | ✅ Complete — CI green; merged to `main` (`1b28bf9`). In-sandbox: `@knowget/admissions` typecheck/lint/format/build clean, **46 tests** (18 files); `apps/api` typecheck/lint/build clean + admissions DI-graph spec (2 tests) in the **214-test** api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**257** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox).              |
| **Depends on** | P2-D01-M01 (Organization — the admissions-record owner), P2-D01-M02 (Person — the applicant), P2-D03 (Student Lifecycle, ADR-0012 — the prospect/applicant/student records a confirmed enrollment hands off to via event), P2-D14 (Finance — where application/admission **fees** live), P1-M05 (`@knowget/notifications`) + P2-D22 (Engagement — where marketing message **delivery** lives), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`) |
| **Date**       | 24 December 2026                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Next**       | P2-D24 — Alumni, Community & Relationship (last Program D contract)                                                                                                                                                                                                                                                                                                                                                                  |

---

## 1. Mission recap

Deliver the **Admissions, Marketing, Enrollment & Growth Platform** — the institution's **admissions system of
record** and the **fifth contract of Program D (Campus & Engagement)**: the marketing campaigns it runs and the
leads they draw, the admission cycles it opens with their per-grade seat plans, the applications families
submit and the entrance evaluations they gather, the offers extended and the enrollment confirmations that
close the funnel, and the descriptive per-cycle funnel profile. The defining boundary is **Student Lifecycle
(P2-D03)**: that domain owns the prospect/applicant/student **records** and the enrolled-student lifecycle;
this one runs the funnel that _ends_ where P2-D03 _begins_ — an application references its applicant as a
**Person**, and a confirmed enrollment is the **hand-off point** (`admissions.enrollment.confirmed`, which
Student Lifecycle consumes to enrol the student). Three decisions shape it: several quantities are **derived,
not stored** — the admissions funnel (leads → applications → offers → enrollments + conversion rates) and a
cycle's seat intake — so the design begins with **two pure engines**; **this domain carries no money** —
application and admission **fees are Finance's (P2-D14)**; and **two of the eight aggregates are immutable
append-only records** (admission evaluation, enrollment confirmation). Marketing message _delivery_ is the
notifications (P1-M05) / engagement (P2-D22) concern — this domain records the campaign, not the send.
Scholarship/aid modelling and prediction (yield forecasting, lead scoring, P2-D28) are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: the **funnel engine** (`computeAdmissionFunnel` — the stage counts leads → applications → offers → enrollments and the conversion rate between each adjacent pair + the overall lead → enrollment rate, **each capped at 100**, empty-safe; `summarizeApplicationStages` — the per-status application tally) and the **intake engine** (`computeIntakeCapacity` — a grade's confirmed places vs capacity into remaining / over-subscribed / fill percent, capacity 0 = untracked; `summarizeIntake` — the cycle-wide rollup) |
| **Domain**           | `@knowget/admissions` — eight aggregates (MarketingCampaign, Lead, AdmissionCycle, Application, AdmissionEvaluation, Offer, EnrollmentConfirmation, AdmissionsFunnelProfile — **two of them immutable append-only**), each an aggregate + factory + guarded transitions with an application service, plus the `AdmissionsFunnelProfileService` integration spine; value objects (campaign/lead/cycle/application/offer statuses, channels, evaluation types + recommendations). **No money; two write-once records; money-free, free-text-free, PII-free events**                                |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261224000000_add_admissions`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; an evaluation score and every funnel count/percent **INTEGER**, a cycle's seat plan **JSONB**, dates/codes/grades/contact details **TEXT**; **all uniqueness DB-backed** (campaign/lead/cycle/application code per tenant; one offer per application; one enrollment per offer; one profile per cycle)                                                                          |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `marketing/*` (campaigns, leads) under `marketing:read`/`:write` and `admissions/*` (cycles, applications, evaluations, offers, enrollments, the funnel profile) under `admissions:read`/`:write`; zod DTOs; eight Prisma/RLS adapters (the two immutable ones omit `remove`) + two directory adapters (Organization, Person); `AdmissionsModule` importing the Organization and Person modules, registered in `app.module`                                                                                                             |
| **Events**           | Money-free, free-text-free, PII-free domain events on `admissions.*` — campaign created/renamed/channel-set/period-set/activated/completed/cancelled; lead created/contact-updated/contacted/qualified/converted/lost; cycle created/renamed/seat-plan-set/window-set/opened/closed/archived; application submitted/review-started/interview-scheduled/offered/waitlisted/rejected/withdrawn; evaluation recorded; offer extended/accepted/declined/expired/withdrawn; **enrollment confirmed** (the Student-Lifecycle hand-off); funnel profile refreshed                                       |
| **Docs & decisions** | ADR-0042 (platform + the dual pure engines + the no-money decision + the two immutable records + the Student-Lifecycle P2-D03 hand-off boundary and the Finance P2-D14 fee boundary + the advisory seat capacity); this report; platform-state, technical-debt (TD-43) and CHANGELOG updates                                                                                                                                                                                                                                                                                                     |

## 3. Domain capabilities & invariants

- **The funnel & intake are derived.** The admissions funnel (stage counts + conversion rates) is computed by
  the funnel engine from org leads + cycle applications/offers/enrollments; a cycle's seat intake is computed
  by the intake engine from confirmed enrollments against the per-grade seat plan — never stored. Each
  conversion rate is **capped at 100** (a stage cannot exceed the one before it), empty-safe.
- **Campaign & lead.** A campaign `draft → active → completed | cancelled` (code unique per tenant); a lead
  `new → contacted → qualified → converted` (or `lost` from any open state, code unique per tenant), carrying
  a contact name + optional phone/email **held on the aggregate, never on an event**, an acquisition source
  and an optional attributed campaign (validated). Marketing **delivery is notifications' (P1-M05) /
  engagement's (P2-D22)**.
- **Admission cycle.** `planning → open → closed → archived` with a **per-grade seat plan (JSONB)** editable
  before it closes; applications are accepted **only while open**. The seat plan feeds the intake engine.
- **Application.** `submitted → under_review → interview → offered` (with `waitlisted`/`rejected`/`withdrawn`
  terminal branches, code unique per tenant), the applicant a validated **Person**, the org derived from the
  cycle, an optional attributed lead validated. The prospect/student record is **Student Lifecycle's (P2-D03)**.
- **Evaluation (immutable).** One entrance evaluation — type, a **0–100 score**, a recommendation — recordable
  **only while the application is `under_review` or at `interview`**. Write-once, no edit/delete.
- **Offer.** `extended → accepted | declined | expired | withdrawn`, extended only for an `offered`
  application, grade + cycle derived from it; **one offer per application** (DB-backed). Accepting bridges to
  an enrollment.
- **Enrollment confirmation (immutable) & the hand-off.** Confirmed **only from an accepted offer**, **one per
  offer** (DB-backed), deriving org/cycle/grade/applicant from the offer + application. It publishes
  `admissions.enrollment.confirmed` — the signal **Student Lifecycle (P2-D03)** consumes to enrol the student;
  `student_id` records the resulting student reference once known.
- **Funnel profile.** A descriptive read model, one per cycle, **refreshed** from the two engines (org leads +
  cycle applications/offers/enrollments through the funnel engine; the seat plan vs confirmed enrollments
  through the intake engine). Descriptive only — **never a forecast** (P2-D28); the intake picture reflects the
  declared seat plan only.
- **Money-free, free-text-free, PII-free events.** No event payload carries a fee, a campaign name, a lead's
  contact name/phone/email, or an applicant identity beyond an id — only ids, codes, channels, sources,
  statuses, grades, scores and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (funnel; intake) were built and exhaustively tested before any
  aggregate depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/admissions` — **46 tests** (the funnel incl. empty/over-cap/negative and the per-stage
  rate caps; the application-stage tally; the intake capacity incl. untracked-capacity and over-subscribed;
  the intake rollup; every aggregate lifecycle incl. terminal-state guards; the two immutable records; the
  service validations incl. open-cycle / offered-application / accepted-offer gates, the dedup pre-checks, org
  derivation, and the applicant/lead/campaign existence checks; the money-free/free-text-free/PII-free event
  content; and an end-to-end campaign → lead → cycle → application → evaluation → offer → enrollment →
  funnel-profile spine). `apps/api` — the admissions DI-graph integration spec compiles the full module and
  asserts every service token resolves.
- **Gates.** `@knowget/admissions` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck, ESLint
  and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (all **257** prisma-independent
  turbo tasks green); the full Prisma build and DB-integration tests are CI-verified (TD-12: the Prisma engine
  CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**; verified
  that tenant A and tenant B each see only their own rows, an unset tenant sees zero (fail-closed), a
  cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), FORCE RLS + the `tenant_isolation` policy
  is present on all eight tables (8/8), the **JSONB seat plan and the INTEGER score/counts round-trip
  exactly**, and the three business uniques (**one offer per application, one enrollment per offer, one profile
  per cycle**) each reject a duplicate (SQLSTATE 23505).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole milestone.
  The persistence/API audit was **clean across all categories** (schema/migration column-by-column parity incl.
  the JSONB seat plan and INTEGER columns, adapter field fidelity incl. the two append-only repositories with
  no `remove` and the DB-backed uniques, correct delegates + status-filtered queries, controller scope split +
  route ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items** and
  surfaced **one confirmed low-severity defect and two integrity/consistency refinements, all fixed before
  merge with regression tests** — the low defect: `createApplication` threw `EmptyApplicationCodeError` for an
  empty _grade_ (wrong field blamed); fixed with a new `EmptyApplicationGradeError` and a test asserting each
  error blames the right field. Refinements: `ApplicationService.submit` now validates an optional attributed
  `leadId` (matching how `LeadService` validates `campaignId`) so no application references a non-existent
  lead; and the private open-status sets are now derived from the exported `OPEN_*_STATUSES` constants,
  removing the duplicated source of truth.

## 5. Decisions

Recorded in **ADR-0042**: two pure engines (funnel; intake) as the computational core built first; **no
money** (fees → Finance P2-D14); **two immutable append-only records** (admission evaluation, enrollment
confirmation — their repositories have no `remove`); one package for all eight aggregates; the campaign/lead
growth surface (contact details on the aggregate, never on an event); the admission cycle with its per-grade
JSONB seat plan (applications open-only); the application referencing the applicant as a Person (org derived
from the cycle, optional lead validated); the one-offer-per-application offer; the **enrollment confirmation
and the `admissions.enrollment.confirmed` hand-off to Student Lifecycle (P2-D03)**; the descriptive per-cycle
funnel profile and the refresh spine; **two scope pairs — `marketing:*` and `admissions:*`**; persistence per
ADR-0010 with FORCE RLS verified live and **all uniqueness absolute and DB-backed** (no status-scoped TOCTOU
debt, like P2-D21/P2-D22 and unlike D16–D20); and the advisory seat capacity (TD-43).

## 6. Technical debt

- **TD-43 (new, low).** **Seat capacity is advisory, not enforced** — `EnrollmentConfirmationService.confirm`
  does not reject a confirmation when a grade's confirmed enrollments reach or exceed its declared `capacity`.
  The intake engine _derives_ an `overSubscribed` / `remaining` signal (surfaced on the per-grade intake view
  and the funnel profile's fill percent) for monitoring, but the write path does not block — **deliberate**,
  because admissions routinely over-offer against expected melt, and a capacity of 0 means untracked/no limit.
  A hard seat cap is offered as an **opt-in** refinement behind the service, not a default (ADR-0042). Mirrors
  TD-41 (the advisory-signal family). Note: like P2-D21 and P2-D22 and unlike D16–D20, this domain carries
  **no status-scoped uniqueness TOCTOU debt** — every uniqueness rule, including the one-offer-per-application
  and one-enrollment-per-offer dedup guards, is **absolute and DB-backed**.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the admissions events ride the
  same bus.

## 7. Outcome — merged to `main`, proceed to P2-D24

The Admissions, Marketing, Enrollment & Growth Platform is complete behind its gates: the funnel and seat
intake are derived consistently by pure engines (each conversion rate capped per stage), two of the eight
aggregates are immutable append-only records, the no-money boundary (fees → Finance P2-D14) and the
Student-Lifecycle (P2-D03) hand-off boundary are held structurally (a confirmed enrollment emits the enrol
signal, never re-modelling the student), and all eight tables are FORCE-RLS tenant-isolated (verified live,
JSONB/INTEGER round-tripping exactly, cross-tenant insert rejected 42501, the three business uniques rejecting
duplicates 23505); both independent audits were resolved clean (one low domain defect + two integrity
refinements fixed before merge). CI is green and the milestone is **merged to `main` (`1b28bf9`)**, the fifth
contract of Program D (Campus & Engagement); next is **P2-D24 — Alumni, Community & Relationship** (the last
Program D contract). **Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has
not yet been rotated across the P2-D18/D19/D20/D21/D22 boundaries.
