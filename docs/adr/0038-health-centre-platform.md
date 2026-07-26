# 38. Integrated Health Centre & Clinical Services: one package, eight aggregates, two pure engines, content-free events, and no money

- **Status:** Accepted
- **Date:** 2026-12-20
- **Contract:** P2-D19 (Integrated Health Centre & Clinical Services Platform)

## Context

P2-D19 **opens Program D — Campus & Engagement** (D19–D24), on the certified `v0.2.0` baseline, the frozen
Phase-1 core, the P2-D01-M01 organization base, the P2-D01-M02 person base and the P2-D12 workforce base.
It is the authoritative domain for **the institution's operational clinical services**: the health centres
it runs and the clinicians who staff them, the patient appointments booked at them, the clinical encounters
in which patients are seen, the medication prescriptions ordered, the sick-bay admissions for observation,
and the onward referrals to external providers. It is a peer of the operational domains delivered before it
(transport P2-D16, residential P2-D17, library P2-D18): those manage how students travel, where they live
and what they read; this one manages the care they receive at the health centre.

Three decisions shape the design. First, two quantities are **derived, not stored** — a health centre's
**sick-bay occupancy** (active admissions against bed capacity, rolled centre → institution) and a
prescription's **due/overdue doses** (from the start date, the regimen and the doses administered) — so, as
with every operational domain, the design begins with the pure engines that compute them, not with an
aggregate. Second, **this domain carries no money** — clinical services are not billed here (Finance,
P2-D14) and medical supplies are not stocked or costed here (Procurement & Assets, P2-D15). Third, and
distinctively, **clinical information is confidential and never leaves the domain on an event**: every
domain event is content-free — it carries ids, a status, coarse coded fields (a role, an urgency, a
scheduled time) and counts, never a chief complaint, a clinical assessment, a medication name, a dosage, or
a referral/admission reason. This is the same discipline Learner Wellbeing (P2-D05) applies to counselling
and safeguarding.

Two boundaries bound it. First, **the standing health record is not here** — a learner's medical history,
allergies, chronic conditions, immunization history, standing medications and medical alerts belong to
**Learner Wellbeing (P2-D05, `health:*`)**. This domain holds the _operational_ clinical services (the
running of the health centre); where an encounter would update a learner's standing record, that remains
P2-D05's write. Second, **prediction is not here** — triage/diagnosis inference and demand forecasting are
reserved for the **intelligence core (P2-D28)**; the centre profile is descriptive and derived, never a
forecast. Identity is referenced, not re-modelled: a centre's organization is an **Organization
(P2-D01-M01)**, a patient is a **Person (P2-D01-M02)**, and a clinician is an **Employee (P2-D12)**.

## Decision

1. **Two pure engines are the computational core, built and tested first.** `computeBayOccupancy` values a
   centre's sick-bay bed capacity against its active admissions (beds available, occupancy percent,
   over-capacity), and `summarizeClinicalOccupancy` rolls a tenant's centres into the institution picture.
   `computeMedicationSchedule` derives, as of a date, a prescription's total doses, the doses administered
   and remaining, the doses due by now and how many of those are overdue, and whether the course is
   complete or still active (dosing runs on calendar days: day one is the start date, so a course beginning
   today already owes today's doses; before the start nothing is due; after the end every dose is due). All
   are pure, deterministic and **clock-free** — overdue is measured in **days**, never money.

2. **This domain has no money — a deliberate operational boundary.** Clinical services are not billed here
   (Finance, P2-D14), and the cost of medicines and consumables is Procurement & Assets' (P2-D15).
   `@knowget/health-centre` imports no money core and defines no monetary field: capacities, dose regimens,
   dose counts, occupancy figures, workload counts, percents and versions are all **integers**.

3. **Domain events are content-free — the confidentiality boundary.** No event payload carries free-text
   clinical content (a chief complaint, a clinical assessment, a medication or dosage, a referral or
   admission reason) or a clinical outcome (an encounter disposition, a triage acuity). Events carry ids, a
   status, non-sensitive coded metadata (a clinician's role, a referral urgency, an appointment's scheduled
   time) and counts. Downstream reactors query for detail under permission; the sensitive record never
   rides the bus.

4. **One domain package, `@knowget/health-centre`, for all eight aggregates** — the same
   single-bounded-context choice as the seventeen prior domains (ADR-0021…0037). A shared spine
   (`errors.ts`, `ports.ts`, `health-centre-events.ts`, `health-centre-value.ts`, `health-centre-view.ts`,
   `index.ts`), the two engines, and a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`).

5. **The health centre and clinician are the clinical masters.** A health centre carries a code (unique per
   tenant), a type (infirmary/clinic/dental/counselling/wellness), a sick-bay bed capacity and an optionally
   assigned lead clinician; it runs `active ↔ under_maintenance → decommissioned`, and only an active centre
   takes appointments, encounters, prescriptions, admissions and referrals. A clinician is a staff member
   (**Employee, P2-D12**) with a clinical role and an optional registration number; it runs `active ↔
suspended → relieved`, its organization is derived from the employee, and one clinician is allowed per
   employee. Identity lives in the workforce domain and is never duplicated.

6. **An appointment is pure scheduling.** A scheduled visit for a patient at a centre, optionally with a
   named clinician; it runs `requested → scheduled → checked_in → completed`, and may end `cancelled` (from
   any open state) or `no_show` (a scheduled patient who did not arrive). Rescheduling changes only the
   time (and publishes a distinct `rescheduled` event, never misdescribing the status). The clinical detail
   of the visit lives on the encounter, not here.

7. **A clinical encounter is the consultation record.** It carries a triage acuity, an optional chief
   complaint and clinical assessment (**free-text clinical content held on the aggregate but never on an
   event**), the attending clinician, and, at completion, a disposition (discharged/referred/admitted/
   follow-up); it runs `draft → in_progress → completed`, or `→ cancelled` from either open state. A
   clinician must be assigned before it can start; content edits are allowed only while open, the assessment
   only while in progress. The organization is derived from the centre.

8. **A prescription is a medication course, feeding the schedule engine.** A clinician orders a medication
   (with a dosage — both **clinical content, never on an event**) with a regimen (doses per day, duration in
   days, a start date); it runs `active → completed | discontinued`. Doses are tallied one at a time and can
   never exceed the prescribed total; the due/overdue picture is **derived** by the engine, never stored. No
   money — the drug's cost is Procurement & Assets'.

9. **A sick-bay admission is a patient under observation, feeding the occupancy engine.** A patient placed
   in a sick-bay bed; it runs `active → discharged`. The service enforces that the sick bay is **not at
   capacity**, the **bed is free**, and the **patient is not already admitted**; active admissions are what
   the occupancy engine counts against capacity. The organization is derived from the centre.

10. **A referral is onward care coordination.** A health centre's referral of a patient to an external
    provider (a target, an urgency and an optional reason held **off events**); it runs `raised → accepted →
completed | cancelled`. Onward clinical care at the external provider is out of scope.

11. **The centre profile is a descriptive read model, never a transaction.** One per centre, it carries the
    sick-bay occupancy (from the occupancy engine over active admissions against capacity) and the live
    clinical workload — open appointments and encounters, active prescriptions and those with overdue doses
    (via the medication-schedule engine), and open referrals — **refreshed** (version-bumped) whenever the
    activity changes. The institution rollup runs `summarizeClinicalOccupancy`. It is always derived, never
    posted to directly, and **never a forecast** (P2-D28).

12. **Two permission scope pairs split the platform along its operational boundary.** `clinic:read`/
    `clinic:write` gate the clinical estate and its people and oversight (health centres, clinicians, the
    centre profile), held by health-centre administration; `clinical:read`/`clinical:write` gate the
    patient-facing care operations (appointments, encounters, prescriptions, sick-bay admissions,
    referrals), delivered by clinical staff. The two are separately administered, so they do not share a
    scope. The standing health record is Learner Wellbeing's (`health:*`) — a distinct scope in a distinct
    domain.

13. **Persistence per ADR-0010, no money.** Eight tables (`health_centre`, `clinician`, `appointment`,
    `clinical_encounter`, `prescription`, `sick_bay_admission`, `referral`, `centre_profile`) with Prisma/RLS
    adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) — verified
    on live PostgreSQL. Capacities, dose regimens/counts, occupancy/workload counts, percents and versions
    are **INTEGER**; over-capacity is **BOOLEAN**; date-only and ISO-stamp values (scheduled/admitted/
    discharged/start/raised/refreshed stamps) are **TEXT**. There is **no JSONB** — this domain has no
    list-valued fields. Uniqueness is tenant-scoped at the DB: centre code, one clinician per employee, one
    profile per centre.

14. **Domain events on the platform bus, all content-free** — centre registered/renamed/capacity-set/
    lead-assigned/lead-unassigned/maintenance/returned/decommissioned; clinician registered/role-set/
    registration-set/suspended/reinstated/relieved; appointment requested/scheduled/rescheduled/checked-in/
    completed/cancelled/no-show; encounter opened/clinician-assigned/started/completed/cancelled;
    prescription issued/dose-recorded/completed/discontinued; admission opened/discharged; referral raised/
    accepted/completed/cancelled; centre profile refreshed.

15. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), Person
    (P2-D01-M02, the patients) and Employee (P2-D12, the clinicians) existence are validated on write; a
    clinician derives its org from the employee, and an appointment/encounter/prescription/admission/
    referral derives its org from an active centre. The health-centre domain links to those domains and
    never depends on their packages directly. Loan-style term resolution is not needed here; where an
    operation needs a centre's organization, the service resolves it from the active centre.

16. **Two status-scoped uniqueness invariants are service-enforced (TD-39).** "One active admission per
    bed" and "one active admission per patient" are enforced by a check-then-act in the admission service
    (there is no DB backstop, so a TOCTOU window exists under concurrency), alongside a sick-bay capacity
    guard; the domain's _absolute_ uniques (centre code, clinician employee, profile per centre) all have DB
    unique indexes. Partial unique indexes would close the window; recorded as **TD-39**.

17. **Explicit non-goals.** No standing health record (history, allergies, chronic conditions, immunization
    history, standing medications, medical alerts — Learner Wellbeing, P2-D05, owns it), no service billing
    or insurance (Finance, P2-D14), no medical-supply stock or cost (Procurement & Assets, P2-D15), no
    inter-facility transfer or external EHR integration, no diagnostic-device or lab-result ingestion, and
    no prediction — triage/diagnosis inference and demand forecasting are the intelligence core (P2-D28).
    This domain is the operational clinical system of record those build on.

## Consequences

- **A unified operational clinical system of record.** An institution runs its health centres, clinical
  staff, appointments, encounters, prescriptions, sick-bay admissions and referrals in one place, on top of
  the organization, person and workforce bases, with a descriptive centre profile and institution rollup.
- **Occupancy and medication schedules are exact and consistent by construction.** A centre's sick-bay
  occupancy and a prescription's due/overdue doses are computed by pure engines from primary data, so every
  reader gets the same figure and nothing drifts from a stored copy.
- **Confidentiality is held at the event boundary.** No clinical free-text or outcome ever rides the bus —
  the sensitive record stays in the domain and is queried under permission — so integrations can react to
  clinical activity without receiving clinical content.
- **The money boundary is held structurally.** With no monetary field anywhere, service billing and
  medical-supply cost cannot leak in — they stay in Finance and Procurement & Assets.
- **The wellbeing boundary is held structurally.** The domain models no standing health record, so it
  cannot duplicate or drift from the learner's health record in P2-D05.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise
  sick-bay occupancy and the institution rollup, the medication due/overdue/complete math, every aggregate
  lifecycle, the encounter-clinician and dose-limit guards, the admission capacity + one-per-bed +
  one-per-patient invariants, the content-free event boundary, and an end-to-end clinician → centre →
  appointment → encounter → prescription → admission → referral → profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the INTEGER, BOOLEAN and TEXT columns round-tripping exactly; the uniqueness rules are
  tenant-scoped at the DB. Two independent adversarial audits (domain; persistence/API) were clean — the
  persistence/API audit across all categories, the domain audit on all critical/major items and the
  content-free event invariant, with its one minor finding fixed before merge.
- **Deferred, interface-protected.** Two status-scoped uniqueness invariants are service-enforced
  (**TD-39**); domain Prisma adapters remain at the composition root (TD-21). One cohesive package,
  acceptable for a single bounded context (as with the seventeen prior domains). This is the first contract
  of **Program D** and the operational clinical base the campus and intelligence-core domains build on.
