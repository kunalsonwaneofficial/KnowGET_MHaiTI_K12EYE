# Engineering Delivery Report — P2-D05

**Learner Wellbeing, Safety & Success Platform (LWSSP)** · Phase 2 (Enterprise Domain Engineering) · Program: Student Lifecycle

|                |                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D05 — Learner Wellbeing, Safety & Success Platform                                                                                                |
| **Status**     | ✅ Complete — gates green (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. CI green; merged to `main`.                   |
| **Depends on** | P2-D01 (Identity & Organization, `v0.2.0`), P2-D02 (Governance), P2-D03 (Student Lifecycle), P2-D04 (Family & Guardian), Phase 1 baseline (`v0.1.0`) |
| **Date**       | 21 July 2026                                                                                                                                         |
| **Next**       | P2-D06 — Academic Structure & Curriculum Platform (ASCP)                                                                                             |

---

## 1. Mission recap

Deliver the **Learner Wellbeing, Safety & Success Platform** — the authoritative domain
for protecting, supporting and developing every learner's physical, emotional,
behavioural, psychological and social wellbeing across their institutional journey. The
platform enables **proactive intervention rather than reactive incident management** and
supports preventive, corrective and developmental approaches across health, mental
wellbeing, behaviour, discipline, child protection, safety, counselling, inclusive
education, special educational needs, support plans, risk management and interventions.
Its defining demand: **sensitive information is protected through fine-grained
authorization** — health, counselling and safeguarding are distinct trust boundaries, not
one undifferentiated "wellbeing" scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/learner-wellbeing` — seven aggregates (Wellbeing Profile, Health Record, Behaviour Record, Counselling Case, Safeguarding Case, Learner Support Plan, Intervention Plan), each an immutable aggregate + factory + guarded transitions with an application service; value objects (wellbeing level/dimensions, indicators, success metric, allergy/condition/immunization/medication/alert, behaviour observation/incident/restorative action/goal/plan, counselling session/referral/goal, safeguarding risk/incident/escalation/agency, support goal/review schedule, intervention/progress note); a shared spine (errors, ports + in-memory impls, `wellbeing.*` events, barrel) |
| **Persistence**      | Seven models in `schema.prisma` + one migration, each table **FORCE RLS** + `tenant_isolation` (both `USING` and `WITH CHECK`), tenant-indexed, soft-delete + audit columns; `(tenant, student)` unique index on the five one-per-student aggregates (records & plans); counselling and safeguarding many-per-student                                                                                                                                                                                                                                                                                                                                                                        |
| **API**              | Seven permission-gated, tenant-scoped REST controllers under `learner-wellbeing/*`, each behind its **own** area scope; zod DTOs; seven Prisma/RLS adapters + Student and Person directory adapters; `LearnerWellbeingModule` wiring all repositories, directories and services, importing the Student-Lifecycle and Person modules, registered in the root module and exporting every service token                                                                                                                                                                                                                                                                                         |
| **Events**           | Eleven domain events: `wellbeing.health_record.created`, `wellbeing.medical_alert.updated`, `wellbeing.behaviour_observation.recorded`, `wellbeing.behaviour_incident.reported`, `wellbeing.counselling_case.opened`, `wellbeing.counselling_case.closed`, `wellbeing.safeguarding_case.opened`, `wellbeing.safeguarding_case.escalated`, `wellbeing.intervention.assigned`, `wellbeing.intervention.completed`, `wellbeing.support_plan.updated` — routing/metadata only, no confidential content                                                                                                                                                                                           |
| **Docs & decisions** | ADR-0024 (platform architecture & the fine-grained privacy model); this report; platform-state, technical-debt and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 3. Domain capabilities & invariants

- **Wellbeing profile.** One holistic profile per learner: the physical / emotional /
  social / behavioural dimensions, learning-support indicators, named success metrics and
  an AI-ready indicator surface. Aggregating model only; nothing is auto-computed.
- **Health management.** One health record per learner: medical history, blood group,
  allergies (by substance), chronic conditions, immunizations, medications (active until
  discontinued), standing **medical alerts** and an emergency plan. Gated by the dedicated
  `health:*` scope. Emits `health_record.created` and, on any alert change,
  `medical_alert.updated` (with the live-alert count).
- **Behaviour management — development over punishment.** One behaviour record per learner
  leading with **positive recognition**: observations (positive / neutral / concern),
  incidents with a reported → under-review → resolved lifecycle and attached **restorative
  actions**, developmental goals, and an improvement plan. The recording staff member is a
  validated Person. Emits `behaviour_observation.recorded` and `behaviour_incident.reported`.
- **Counselling — isolated with enhanced privacy.** Many cases per learner: registration
  with a presenting concern and priority, an **append-only** confidential session history,
  referrals, goals and a terminal closure with outcome. Content mutations are refused once
  closed. Gated by the isolated `counselling:*` scope. Emits `counselling_case.opened` and
  `counselling_case.closed` — never the concern, notes or outcome.
- **Safeguarding — escalation & traceability.** Many cases per learner: a child-protection
  concern with risk classification, an investigation-and-escalation workflow
  (reported → under-investigation → escalated → resolved), **append-only** incident reports,
  a **traceable escalation trail** (who / to whom / why / when), external-agency
  coordination, and a terminal resolution. Gated by the most restricted `safeguarding:*`
  scope. Emits `safeguarding_case.opened` and `safeguarding_case.escalated`.
- **Learner support.** One support plan per learner: academic and medical accommodations,
  behaviour interventions, inclusion strategies, personalized goals and a review schedule,
  with an active/archived lifecycle. Emits `support_plan.updated` on every change so
  Student Lifecycle and Academics stay in step with a learner's accommodations.
- **Intervention tracking.** One intervention plan per learner: early-warning triggers and
  assigned interventions, each with responsible staff (a validated Person), an
  assigned → in-progress → completed | cancelled lifecycle, progress monitoring and an
  outcome evaluation. Emits `intervention.assigned` and `intervention.completed`.
- **Cross-cutting invariants.** Every record derives its organization from a validated
  Student; at most one profile / record / plan per learner (DB-enforced); staff are
  validated Persons; sensitive histories are append-only; closed/resolved cases are
  immutable; all data is FORCE-RLS tenant-isolated and fail-closed.

## 4. Verification

- **Gates (in-sandbox).** `@knowget/learner-wellbeing` typecheck, lint, build and **72
  unit tests** green (14 files across all seven aggregates and services). `apps/api`
  typecheck green; the learner-wellbeing **DI compilation spec** green (all seven
  controllers and seven services resolve through the module, including the imported
  Student-Lifecycle and Person modules). Prettier-clean.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so
  `FORCE ROW LEVEL SECURITY` applies. For all seven tables: tenant A sees only its own
  rows; tenant B sees zero (isolation); an unset tenant sees zero (fail-closed via the
  `NULLIF(...)` policy); a cross-tenant `INSERT` is rejected by the `WITH CHECK` clause.
  After the audit fix, an insert omitting the `String[]` columns yields `{}`, not `NULL`.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema,
  migration and controllers against the P2-D04 reference: adapter↔schema mapping,
  domain↔adapter completeness, port/service signatures, per-table FORCE RLS, per-area
  permission scopes, DTO/service inputs, all eleven events (no confidential content) and
  aggregate transition logic all verified. One medium finding (array columns declared as
  bare `TEXT[]` rather than `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, a schema-drift and
  latent-NULL hazard) was fixed and re-verified on live PostgreSQL.

## 5. Decisions

Recorded in **ADR-0024**. In brief: one package for all seven aggregates; every record
is about a Student and derives its organization from it via a single
`StudentDirectory.organizationOf` call; **fine-grained per-area authorization** (seven
independent scopes) is the core privacy mechanism; confidential content never leaves the
domain in an event; records are one-per-student and cases are many-per-student;
append-only histories and terminal case states for auditability; development-over-
punishment behaviour modelling; structured AI-ready surfaces with prediction deferred to
the Institutional Intelligence program; persistence per ADR-0010 with FORCE-RLS on every
table.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root
  rather than in a dedicated persistence package — unchanged from ADR-0010; revisit when a
  second consumer needs the adapters.
- **No new debt.** The one audit finding was fixed in-milestone, not deferred. Fine-grained
  scopes, append-only histories and terminal-state guards are all enforced in-domain.

## 7. Recommendation — proceed to P2-D06

P2-D05 delivers the authoritative, privacy-first wellbeing platform: an institution can
manage a learner's health, behaviour, counselling, safeguarding, support and intervention
throughout the educational journey; preventive, supportive and safeguarding processes are
available; sensitive information is protected through fine-grained authorization; and every
future domain can integrate with a single authoritative wellbeing platform through its
exported services and eleven events. The certified core and all frozen packages are
untouched. **Recommend proceeding to P2-D06 — Academic Structure & Curriculum Platform.**
