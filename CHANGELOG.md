# Changelog

All notable changes to KnowGET MHaiTI are documented here. The project follows
[Semantic Versioning](https://semver.org/); phase baselines are tagged.

## [Unreleased] — P2-D13 · Program: Workforce & Operations · Faculty Excellence, Coaching & Professional Growth Platform

The second contract of **Program C** — on the certified `v0.2.0` baseline, the frozen Phase-1 core,
and the P2-D12 workforce base. The **professional-growth system of record for staff**, delivered as
one `@knowget/faculty-excellence` package (ADR-0032): the coaching and professional development the
workforce domain explicitly deferred. Development, not prediction — the faculty-growth band is the
transparent mapping of observed-practice ratings onto an ascending scale, with prediction deferred to
the intelligence core (P2-D28); a staff member is a validated Employee (P2-D12), never duplicated.

### Added

- **Faculty Excellence, Coaching & Professional Growth Platform (ADR-0032):** eight aggregates in one
  `@knowget/faculty-excellence` package — **CompetencyFramework** (the institution's practice rubric,
  a named set of competency standards; draft → active → archived, competencies frozen once active),
  **Observation** (a classroom/practice observation scored against the framework — per-competency 1–4
  ratings with evidence, an overall mean rating and strengths/growth notes; scheduled → conducted →
  shared → acknowledged, only **acknowledged** counting toward growth standing), **CoachingEngagement**
  (a coach↔coachee cycle; proposed → active → completed | cancelled, at most one active per coachee),
  **CoachingSession** (a logged session within an active engagement), **DevelopmentRequirement** (the
  CPD mandate — required hours per category per period), **ProfessionalLearningActivity** (a piece of
  CPD with hours; planned → enrolled → completed | cancelled, only **completed** earning hours),
  **DevelopmentGoal** (a growth objective; draft → active → achieved | abandoned, recording a reasoned
  outcome) and **FacultyProfile** (the descriptive, AI-ready indicator snapshot per employee, one per
  employee, **refreshed** by the growth engine). Each is a pure aggregate behind a repository port, a
  Prisma/RLS adapter at the composition root, an application service on the event bus, and a
  permission-gated, tenant-scoped REST controller.
- **Two pure engines, built and tested first:** `computeDevelopmentLedger` (reconciles CPD
  requirements against completed activities into a per-category compliance ledger — required/
  completed/remaining and a rate that credits completion only **up to each requirement**, so a surplus
  never masks a deficit; division-safe, clamped 0–100) and `computeFacultyGrowth` / `summarizeFaculty`
  (acknowledged-observation practice standing, goal progress and PD compliance → a transparent growth
  band `emerging < developing < proficient < distinguished`, and the leadership rollup).
- **Persistence:** eight tables (`competency_framework`, `observation`, `coaching_engagement`,
  `coaching_session`, `development_requirement`, `professional_learning_activity`, `development_goal`,
  `faculty_profile`) under **FORCE ROW LEVEL SECURITY** with the standard `tenant_isolation` policy
  (USING + WITH CHECK, fail-closed), verified on live PostgreSQL; tenant-scoped DB unique indexes
  (framework code, one requirement per (employee, category, period), one profile per employee); a
  framework's competencies and an observation's ratings as non-null JSONB.
- **API surface:** seven permission-gated (`faculty:read` / `faculty:write`), tenant-scoped REST
  controllers over the full lifecycle of each aggregate, the reconciled CPD ledger and the
  organization rollup; zod request DTOs; Organization (P2-D01-M01) and Employee (P2-D12) directory
  ports (the employee directory resolves both existence and the employee's organization);
  `FacultyExcellenceModule` importing the Organization + Workforce modules, registered in `app.module`.
- **Faculty domain events** on the platform bus — framework created/activated/archived; observation
  conducted/shared/acknowledged; coaching proposed/accepted/completed and session logged; PD planned/
  completed; goal activated/achieved; faculty profile refreshed.

### Notes

- **Boundaries held:** the faculty-growth band is descriptive/explainable, never a prediction (P2-D28);
  a staff member is an Employee (P2-D12), referenced not duplicated; no compensation, LMS or
  recruitment scope. Cross-domain references enter through directory ports; soft framework/engagement/
  competency references are stored against the validated Employee/Organization anchor (**TD-33**).
  Domain Prisma adapters remain at the composition root (**TD-21**).

## [Unreleased] — P2-D12 · Program: Workforce & Operations · Workforce & Human Capital Platform

The first contract of **Program C** — the operational institution beyond the learner and academic
core — on the certified `v0.2.0` baseline, the frozen Phase-1 core, and the P2-D02…D11 identity,
learner and academic domains. The **staff system of record**, the HR analog of Student Lifecycle
(P2-D03), delivered as one `@knowget/workforce` package (ADR-0031). Two boundaries define it:
**compensation is out of scope** — a contract/position carries only the pay grade/band label, never
an amount (money lives in the Financial platform, P2-D14) — and it is **descriptive, not predictive**
— the workforce profile's attrition-risk band names its factors, with prediction deferred to the
intelligence core (P2-D28). Coaching and professional development are the next contract (Faculty
Excellence, P2-D13).

### Added

- **Workforce & Human Capital Platform (ADR-0031):** eight aggregates in one `@knowget/workforce`
  package — **Department** (the HR org unit — hierarchical with a head and cost centre; active →
  archived, with cycle-safe reparenting), **Position** (a defined, budgeted post under a department —
  title, employment type, headcount and the pay **grade/band label only**; draft → open → on_hold →
  closed), **Employee** (the **Person-linked** staff record — identity is never duplicated — with the
  lifecycle onboarding → active, reversible on_leave / suspended / notice_period, then a terminal
  separation resigned / terminated / retired → alumni; at most one active employment per institution,
  unique employee number), **EmploymentContract** (a **version-controlled** contract — one immutable
  version per relationship, a new version expiring and superseding the prior active one so at most one
  is active; carries the pay grade/band label only; draft → active → expired | terminated),
  **LeaveEntitlement** (the policy grant of days per leave type per period), **LeaveRequest** (a leave
  application — requested → approved | rejected | cancelled, only approved drawing down the balance),
  **PerformanceReview** (an appraisal with a validated 1–5 rating; draft → submitted → acknowledged →
  finalized, only finalized counting toward standing) and **WorkforceProfile** (the descriptive,
  AI-ready indicator snapshot per employee, one per employee, **refreshed** by the intelligence
  engine). Each is a pure aggregate behind a repository port, a Prisma/RLS adapter at the composition
  root, an application service on the event bus, and a permission-gated, tenant-scoped REST controller.
- **Two pure engines, built and tested first:** `computeLeaveLedger` (reconciles entitlements against
  requests into a per-type ledger — entitled/taken/pending/remaining, totals and a division-safe
  utilization rate clamped 0–100; only **approved** leave draws down, `requested` is pending,
  rejected/cancelled ignored) and `computeWorkforceIndicators` / `summarizeWorkforce` (tenure months,
  leave utilization and finalized-review standing → a transparent, **worst-of-named-factors**
  attrition-risk band, and the leadership rollup — headcount, status and risk distribution).
- **Persistence:** eight tables (`department`, `position`, `employee`, `employment_contract`,
  `leave_entitlement`, `leave_request`, `performance_review`, `workforce_profile`) under **FORCE ROW
  LEVEL SECURITY** with the standard `tenant_isolation` policy (USING + WITH CHECK, fail-closed),
  verified on live PostgreSQL; tenant-scoped DB unique indexes (department/position code, employee
  number, one contract per (employee, version), one entitlement per (employee, leave type, period),
  one profile per employee); DOUBLE PRECISION for day counts/rates/ratings, INTEGER for
  tenure/headcount/version, date-only values as TEXT. **No compensation/salary column exists.**
- **API surface:** seven permission-gated (`workforce:read` / `workforce:write`), tenant-scoped REST
  controllers over the full lifecycle of each aggregate, the reconciled leave ledger and the
  organization rollup; zod request DTOs; Organization (P2-D01-M01) and Person (P2-D01-M02) directory
  ports; `WorkforceModule` wiring the eight repositories, two directories and seven services,
  registered in `app.module`, exporting every service token for in-process cross-domain use.
- **Workforce domain events** on the platform bus — department created/archived; position
  created/opened/closed; employee onboarded/activated/separated/became_alumni; contract
  issued/activated/ended; leave requested/approved/rejected/cancelled; review submitted/finalized;
  workforce profile refreshed.

### Notes

- **Boundaries held:** no compensation amount is stored anywhere (grade/band label only — Finance,
  P2-D14), and the workforce profile is descriptive/explainable, never a prediction (P2-D28).
  Cross-domain references enter through directory ports; soft head/reviewer references are stored
  against the validated Person/Organization anchor (**TD-32**). Domain Prisma adapters remain at the
  composition root (**TD-21**).

## [Unreleased] — P2-D11 · Program: Academic Excellence Platform · Learning Intelligence & Educational Insights Platform

The sixth and final contract of Program: Academic Excellence Platform — and the capstone of
Program B, the learner & academic core (P2-D02…D11) — on the certified `v0.2.0` baseline, the frozen
Phase-1 core, and the P2-D03…D10 learner and academic domains. The domain that brings the learner
and academic domains together, delivered as one `@knowget/learning-intelligence` package (ADR-0030):
it **synthesizes** the descriptive indicators those domains already expose into unified learner
intelligence and explainable educational insights. Synthesis, not prediction — ML forecasting is an
explicit non-goal deferred to the intelligence core (P2-D28); every conclusion carries an evidence
chain, recommendations are human-in-the-loop, and it consumes the upstream domains rather than
recomputing them.

### Added

- **Learning Intelligence & Educational Insights Platform (ADR-0030):** seven aggregates in one
  `@knowget/learning-intelligence` package — **Learning Signal** (an immutable, evidence-bearing
  descriptive signal about a learner distilled from an upstream domain's indicator — dimension,
  0–100 health reading, trend, evidence reference — captured into the learner's append-only feed),
  **Learner Insight Profile** (the unified per-learner learning-health picture, one per student,
  **refreshed** by running the synthesis engine over the learner's signals, versioned each refresh),
  **Early Warning** (a rule-based, explainable risk flag naming the fired rule and the score that
  tripped it; raised → acknowledged → resolved | dismissed with an append-only history; duplicate
  open warnings suppressed), **Educational Insight** (a generated explainable finding —
  strength/gap/trend/risk/opportunity — with a narrative, priority and evidence; proposed →
  published → archived), **Recommendation** (an evidence-grounded, **human-in-the-loop** suggestion —
  the platform proposes, a human accepts or rejects it recorded with the decider, then it is
  actioned; proposed → accepted → actioned | rejected), **Growth Plan** (accepted recommendations
  turned into measurable goals with recorded, audited outcomes and a derived progress percentage;
  draft → active → achieved | abandoned) and **Cohort Insight** (a leadership-facing rollup over an
  organization, grade or section, one per scope; draft → published). Each is a pure aggregate behind
  a repository port, a Prisma/RLS adapter at the composition root, an application service on the
  event bus, and a permission-gated, tenant-scoped REST controller.
- **Three pure engines, built and tested first:** `synthesizeLearnerInsight` (per-dimension mean of
  the 0–100 health readings → bands → equal-weight overall learning-health; `dimensionsCovered` is
  the data-sufficiency signal), `evaluateEarlyWarnings` (transparent threshold rules; each fired
  warning names the rule and score that tripped it; absence of data never fires) and
  `summarizeCohort` (average learning-health, band distribution and learners-needing-attention over
  the members' profiles, excluding un-synthesized learners) — all pure, division-safe, two-decimal,
  clamped 0–100, over narrow views the aggregates structurally satisfy. **Descriptive and
  explainable only — ML prediction/forecasting is a non-goal deferred to the intelligence core
  (P2-D28).**
- **A single `insight:*` scope:** the whole REST surface (seven controllers — signals, profiles,
  early warnings, insights, recommendations, growth plans, cohort insights) is gated by one
  `insight:read` / `insight:write` pair. Organization (P2-D01-M01) and student (Student-Lifecycle)
  existence enter through injected directory ports; upstream evidence is referenced, not recomputed.
- **Persistence:** seven `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`learner_insight_profile`,
  `learning_signal`, `early_warning`, `educational_insight`, `recommendation`, `growth_plan`,
  `cohort_insight`) with the standard `tenant_isolation` policy (fail-closed), soft-delete + audit
  columns, tenant-scoped DB unique indexes (one profile per student, one cohort insight per scope),
  non-null JSONB for evidence chains, status histories, dimension scores, goals, id lists and the
  band distribution, and DOUBLE PRECISION for scores and percentages — isolation, fail-closed reads
  and WITH CHECK cross-tenant rejection verified on live PostgreSQL for all seven tables.
- **Events:** nine `insight.*` domain events — `insight.signal.captured`, `insight.profile.refreshed`,
  `insight.early_warning.raised`, `insight.early_warning.resolved`, `insight.published`,
  `insight.recommendation.proposed`, `insight.recommendation.accepted`, `insight.growth_plan.activated`,
  `insight.growth_plan.achieved`.
- **Docs:** ADR-0030, the P2-D11 delivery report, and platform-state / technical-debt (TD-31) /
  register updates. **Completes Program B — the learner & academic core.**

### Notes

- Independent audit confirmed the non-goal discipline (descriptive/explainable only, no prediction;
  human-in-the-loop recommendations; no recomputation of upstream metrics) and found the engines,
  RLS, adapters and lifecycle clean against the P2-D10 reference. One major finding (the
  cohort-insight service did not pre-check its one-per-scope invariant, so a duplicate surfaced as a
  500 rather than a 409) was fixed in-milestone with a `DuplicateCohortInsightError` + `findByScope`
  pre-check and a regression test; four minor findings (a dead error class, an incomplete default
  early-warning rule set, un-audited goal outcomes, an unclamped manual score) were also fixed with
  tests. All seven service tokens are exported. New technical debt: TD-31 (upstream evidence
  references stored without per-item validation; the learner anchor validated). Gates green (full
  monorepo typecheck 101/101 and build 54/54, 31 package + 190 API tests); the Prisma
  build/migration/tests run in CI (TD-12).

## [Unreleased] — P2-D10 · Program: Academic Excellence Platform · Assessment & Evaluation Platform

The fifth contract of Program: Academic Excellence Platform, on the certified `v0.2.0` baseline,
the frozen Phase-1 core, and the P2-D06…D09 academic structure, scheduling, attendance and
teaching-learning. The authoritative domain for how learning is assessed, marked, mastered and
recorded — delivered as one `@knowget/assessment-evaluation` package (ADR-0029), with grading
consistent from a single computational core, competency mastery tracked independently of raw
marks, and academic records immutable except through a reasoned amendment workflow. Assessment, not
instruction: instruction delivery, attendance, timetabling, AI tutoring and predictive analytics
are explicit non-goals that consume this platform rather than living in it.

### Added

- **Assessment & Evaluation Platform (ADR-0029):** seven aggregates in one
  `@knowget/assessment-evaluation` package — **Assessment Framework** (an institution's assessment
  philosophy: model, weightage rules, grade bands, competency model and promotion criteria;
  version-controlled, one per organization + code, draft → active → archived), **Assessment Plan**
  (an annual/term/unit/classroom assessment calendar; draft → published → archived), **Assessment**
  (an individual assessment of a subject across twelve types with outcomes, competencies, maximum
  marks, rubric, evaluation strategy and delivery mode; draft → published → in_progress →
  completed | cancelled, content finalised at publication), **Question Bank** (a reusable,
  **version-controlled** repository of questions mapped to Bloom's taxonomy, competencies and
  outcomes; one per organization + code), **Evaluation** (the auditable marking of one student's
  assessment — marks or rubric scores recorded while a draft, then draft → submitted → moderated →
  approved with an immutable transition history, **reopenable** for re-evaluation; one per
  assessment + student), **Competency Profile** (a learner's ordinal mastery per competency —
  not_assessed → emerging → developing → proficient → advanced → mastered — with an append-only
  growth trajectory, **tracked independently of raw marks**; one per student) and **Academic
  Record** (a learner's per-term grade entries, GPA, credits and promotion decision; **immutable
  after publication** — changed only through a reasoned, attributed, versioned, append-only
  amendment workflow; one per student + year + term). Each is a pure aggregate behind a repository
  port, a Prisma/RLS adapter at the composition root, an application service on the event bus, and a
  permission-gated, tenant-scoped REST controller.
- **Two pure engines, built and tested first:** a **grading engine** (`computePercentage`,
  `gradeFor` — the highest-minimum band satisfied, `gradeMarks`, `computeGpa` — credit-weighted
  else simple average) that every grade and GPA in the system flows through, so a report card's
  GPA, a transcript's cumulative GPA and the analytics' average performance agree by construction;
  and an **assessment-intelligence engine** (`computeAssessmentIndicators`) deriving assessment and
  evaluation throughput, approval rate, average performance, variance-based consistency, competency
  mastery (read from mastery levels, **never marks**), learning gaps and curriculum coverage over
  narrow views the aggregates structurally satisfy — division-safe, two-decimal, clamped 0–100,
  descriptive only. Reporting and analytics services orchestrate them; an end-to-end integration
  test proves grading consistency across the report card, transcript and analytics while mastery
  stays independent of marks.
- **A single `assessment:*` scope:** the whole REST surface (nine controllers — frameworks, plans,
  assessments, question banks, evaluations, competency profiles, academic records, reporting,
  analytics) is gated by one `assessment:read` / `assessment:write` pair. Organization
  (P2-D01-M01), subject (Academic-Structure) and student (Student-Lifecycle) existence enter
  through injected directory ports.
- **Persistence:** seven `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`assessment_framework`,
  `assessment_plan`, `assessment`, `question_bank`, `evaluation`, `competency_profile`,
  `academic_record`) with the standard `tenant_isolation` policy (fail-closed), soft-delete + audit
  columns, tenant-scoped DB unique indexes (framework/bank per org + code, evaluation per assessment
  + student, competency profile per student, academic record per student + year + term), non-null
  JSONB for all structured data (grade bands, rules, planned assessments, rubric, questions, rubric
  scores, evaluation history, masteries, trajectory, grade entries, amendments) and DOUBLE
  PRECISION for marks, percentage and GPA — isolation, fail-closed reads and WITH CHECK cross-tenant
  rejection verified on live PostgreSQL for all seven tables.
- **Events:** nine `assessment.*` domain events — `assessment.published`, `assessment.started`,
  `assessment.completed`, `assessment.evaluation.submitted`, `assessment.evaluation.approved`,
  `assessment.competency.updated`, `assessment.academic_record.updated`,
  `assessment.promotion.recommended` (non-pending only), `assessment.report_card.generated` —
  published from the owning service transitions.
- **Docs:** ADR-0029, the P2-D10 delivery report, and platform-state / technical-debt (TD-30) /
  register updates.

### Notes

- Independent audit found the domain internally consistent against the P2-D09 reference across
  correctness (both engines, all state machines), multi-tenancy/RLS, adapter fidelity, service
  invariants, DTO/controller correctness and consistency, with no Critical/Major or security/tenancy
  issues; one minor finding (`revise` on the framework and question bank lacked a state guard, so a
  draft could be silently forced `active`) was fixed in-milestone by guarding both to require an
  active aggregate, with regression tests, and a dead never-thrown error class was removed. All nine
  service tokens are exported for downstream domains. New technical debt: TD-30 (array
  cross-references stored without per-item validation; single references validated). Gates green
  (full monorepo typecheck 99/99 and build 53/53, 38 package + 188 API tests); the Prisma
  build/migration/tests run in CI (TD-12).

## [Unreleased] — P2-D09 · Program: Academic Excellence Platform · Teaching, Learning & Instruction Intelligence Platform

The fourth contract of Program: Academic Excellence Platform, on the certified `v0.2.0`
baseline, the frozen Phase-1 core, and the P2-D06/D07/D08 academic structure, scheduling and
attendance. The operational heart of classroom excellence — how instruction is planned,
delivered, monitored and improved — delivered as one `@knowget/teaching-learning` package
(ADR-0028), with every instructional activity traceable to curriculum outcomes. Instruction, not
assessment or attendance: student grading, examination scheduling, mark calculation, report
cards, attendance recording, AI tutoring and predictive analytics are explicit non-goals that
consume this platform rather than living in it.

### Added

- **Teaching, Learning & Instruction Intelligence Platform (ADR-0028):** seven aggregates in one
  `@knowget/teaching-learning` package — **Academic Plan** (institutional planning at a level:
  annual/term/department/subject, one per organization + code, draft → published → archived),
  **Unit Plan** (a subject-scoped sequence of learning experiences with curriculum alignment,
  outcomes, competencies, estimated hours and assessment strategy; draft → active → archived),
  **Lesson Plan** (objectives, targeted outcomes, teaching strategies, activities, assessment
  checkpoints, required resources, differentiation and reflection; **version-controlled** with a
  draft → in_review → approved review workflow, an approved plan revised to a new version, content
  editable only while a draft or in review), **Learning Resource** (a typed, tagged,
  curriculum-mapped, **version-controlled** library item — document/presentation/video/interactive/
  external reference/AI-generated — reusable across lessons), **Classroom Session** (the delivery
  of a scheduled session capturing planned vs actual topics/activities/resources, a descriptive
  participation summary and reflections; scheduled → delivered → completed | cancelled — **not
  attendance**), **Assignment** (homework/project/practice/reading/collaborative work with a
  submission window and per-learner completion tracking, upserted per student; draft → published →
  closed — **completion only, never a grade**) and **Learning Evidence** (a captured record that
  learning happened — submission/observation/activity completion/portfolio/practical — about a
  Student and **linked to the instructional activity** that produced it). Each is a pure aggregate
  behind a repository port, a Prisma/RLS adapter at the composition root, an application service on
  the event bus, and a permission-gated, tenant-scoped REST controller.
- **A pure instructional-intelligence engine:** `computeInstructionalIndicators` derives
  curriculum coverage (unit-targeted outcomes covered by approved lessons), lesson completion,
  teaching consistency (planned vs actual), student engagement, learning pace, resource
  utilisation, submission rate and instructional workload over narrow view interfaces the
  aggregates structurally satisfy — division-safe, two-decimal, clamped to 0–100, descriptive
  only. An analytics service orchestrates it by subject, section or organization.
- **A single `teaching:*` scope:** the whole REST surface is gated by one `teaching:read` /
  `teaching:write` pair — instruction is operational structure, not sensitive personal data.
  Organization, subject, section and curriculum-framework (Academic-Structure), schedule-slot
  (Academic-Scheduling) and student (Student-Lifecycle) existence enter through injected directory
  ports.
- **Persistence:** seven `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`academic_plan`,
  `unit_plan`, `lesson_plan`, `learning_resource`, `classroom_session`, `assignment`,
  `learning_evidence`) with the standard `tenant_isolation` policy (fail-closed), soft-delete +
  audit columns, a DB unique index for the academic-plan (org, code) rule, non-null JSONB for all
  structured data (objectives, id lists, strategies, activities, revisions, submissions;
  participation nullable) and DOUBLE PRECISION for estimated hours — isolation, fail-closed reads
  and WITH CHECK cross-tenant rejection verified on live PostgreSQL for all seven tables.
- **Events:** nine `teaching.*` domain events — `teaching.academic_plan.published`,
  `teaching.unit_plan.created`, `teaching.lesson.planned`, `teaching.learning_resource.added`,
  `teaching.lesson.delivered`, `teaching.classroom_session.completed`,
  `teaching.assignment.published`, `teaching.assignment.submitted`,
  `teaching.learning_evidence.captured` — published from the owning service transitions.
- **Docs:** ADR-0028, the P2-D09 delivery report, and platform-state / technical-debt (TD-29) /
  register updates.

### Notes

- Independent audit found the domain internally consistent against the P2-D08 reference across
  eight areas (controller↔service signatures, DTO↔domain enums, adapter/schema/migration
  alignment, module DI wiring, permission gating, route shape, domain-logic correctness, and
  non-goal/grading leakage) with no High/Medium issues; one minor finding (two instructional
  indicators could exceed the documented 0–100 range) was fixed in-milestone by clamping, with a
  regression test. All eight service tokens are exported for downstream academic domains. New
  technical debt: TD-29 (array cross-references stored without per-item validation; single
  references validated). Gates green (full monorepo typecheck 97/97 and build 52/52, 32 package +
  186 API tests); the Prisma build/migration/tests run in CI (TD-12).

## [Unreleased] — P2-D08 · Program: Academic Excellence Platform · Attendance & Presence Intelligence Platform

The third contract of Program: Academic Excellence Platform, on the certified `v0.2.0`
baseline, the frozen Phase-1 core, and the P2-D06/D07 academic structure and scheduling. The
authoritative record of who was present, when, and how engaged — attendance sessions, records,
leave, policies, presence profiles and participation, delivered as one
`@knowget/attendance-presence` package (ADR-0027). Presence system of record, not activity or
judgement: grading, behaviour evaluation, timetable generation, financial penalties, predictive
AI and parent communication are explicit non-goals that consume this platform rather than
living in it.

### Added

- **Attendance & Presence Intelligence Platform (ADR-0027):** six aggregates in one
  `@knowget/attendance-presence` package — **Attendance Session** (a marking context —
  academic period, examination, event, activity, meeting, club — for an organization on a date,
  optionally linked to a P2-D07 schedule slot and P2-D06 section/subject; scheduled → open →
  closed | cancelled, recording only while open), **Attendance Record** (a participant's status
  — present, absent, late, excused, medical leave, official duty, remote, partial — and capture
  method; **never mutated**, corrected only by a versioned, reasoned, append-only
  `AttendanceCorrection`), **Leave** (a dated request with supporting documents, requested →
  approved | rejected | cancelled; approved leave **excuses** absences), **Attendance Policy**
  (a configurable, version-controlled institutional constraint with open JSON parameters;
  draft → active → archived), **Presence Profile** (the AI-ready read model) and
  **Participation** (co-curricular involvement — club, sport, cultural, competition,
  institutional event, community service — with an engagement level). Each is a pure aggregate
  behind a repository port, a Prisma/RLS adapter at the composition root, an application service
  on the event bus, and a permission-gated, tenant-scoped REST controller.
- **Two pure engines over shared view interfaces:** a **policy-evaluation engine**
  (`summarizeAttendance` excuses approved-leave absences and computes a weighted attendance
  percentage — present/late/remote = 1, partial = 0.5, 2-dp, division-safe; `evaluatePolicies`
  checks the three percentage rules — `minimum_attendance_percentage`, `examination_eligibility`,
  `promotion_eligibility` — against each policy's `minimumPercentage`) and a
  **presence-intelligence engine** (`computePresenceIndicators` derives attendance %,
  punctuality, a **leave-aware** longest-absence streak, chronic-absenteeism, participation
  count/diversity, an engagement score and a low/medium/high risk band with anomalies). Both
  engines excuse the same days through one internal `leave-ranges` helper, so the eligibility
  percentage and the chronic-absence streak can never diverge.
- **A single `attendance:*` scope:** the whole REST surface is gated by one `attendance:read` /
  `attendance:write` pair — attendance is operational record, not sensitive personal data.
  Organization, participant (Person), schedule-slot, section and subject existence enter through
  injected directory ports (backed by the Organization, Person, Academic-Scheduling and
  Academic-Structure modules).
- **Persistence:** six `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`attendance_session`,
  `attendance_record`, `leave`, `attendance_policy`, `presence_profile`, `participation`) with
  the standard `tenant_isolation` policy (fail-closed), soft-delete + audit columns, a DB unique
  index for every uniqueness rule, non-null JSONB for structured data (corrections, documents,
  parameters, revisions, anomalies) and DOUBLE PRECISION for presence rates (no scalar-list
  columns) — isolation, fail-closed reads and WITH CHECK cross-tenant rejection verified on live
  PostgreSQL for all six tables.
- **Events:** nine `attendance.*` domain events — `attendance.session.created`,
  `attendance.recorded`, `attendance.corrected`, `attendance.leave.requested`,
  `attendance.leave.approved`, `attendance.leave.rejected`, `attendance.policy.evaluated`,
  `attendance.threshold.reached`, `attendance.participation.recorded` — published from the
  owning service transitions (the presence profile, a read model, emits none).
- **Docs:** ADR-0027, the P2-D08 delivery report, and platform-state / technical-debt (TD-28) /
  register updates.

### Notes

- Independent audit found the domain internally consistent against the P2-D07 reference across
  seven areas (controller↔service signatures, DTO↔domain enums, module DI wiring, permission
  gating & tenancy, exactOptionalPropertyTypes, route shape, and domain-logic correctness) with
  no High/security issues; one minor consistency finding — the presence chronic-absence streak
  counting raw `absent` records while the attendance percentage already excused approved leave —
  was fixed in-milestone by sharing one leave-excusal helper between both engines, with a
  regression test. All seven service tokens are exported for downstream academic domains. New
  technical debt: TD-28 (three attendance-policy rule types — `late_arrival`, `early_departure`,
  `grace_period` — stored and version-controlled but not yet evaluated, behind a stable
  dispatch). Gates green (full monorepo typecheck 95/95 and build 51/51, 39 package + 184 API
  tests); the Prisma build/migration/tests run in CI (TD-12).

## [Unreleased] — P2-D07 · Program: Academic Excellence Platform · Enterprise Academic Scheduling & Resource Orchestration Platform

The second contract of Program: Academic Excellence Platform, on the certified `v0.2.0`
baseline, the frozen Phase-1 core, and the P2-D06 academic structure. The authoritative
scheduling engine — timetables, resources, allocations, policies and substitutions — with a
pure conflict engine that prevents invalid schedules, delivered as one
`@knowget/academic-scheduling` package (ADR-0026). Schedule structure and orchestration, not
activity: attendance, lesson delivery, homework, examinations, grading and learning analytics
are explicit non-goals that consume this platform rather than living in it.

### Added

- **Enterprise Academic Scheduling & Resource Orchestration Platform (ADR-0026):** six
  aggregates in one `@knowget/academic-scheduling` package — **Timetable** (an official
  institutional timetable for a grade/class/section in an academic year and term;
  version-controlled via a counter and an append-only revision log; draft → published →
  archived, revising a published timetable returning it to draft at the next version),
  **Schedule Slot** (a scheduled instructional period: day, HH:MM range, subject, teacher,
  section, optional class/venue; one per timetable+day+start+section; editable only while
  the timetable is a draft), **Resource** (classrooms, laboratories, libraries, sports
  grounds, auditoriums, conference rooms and equipment; capacity, location, validated
  recurring availability windows; available → maintenance → retired), **Allocation**
  (teacher/classroom/laboratory/equipment assignment to a recurring window, validated by
  kind with capacity enforcement; allocated → released), **Scheduling Policy** (a
  configurable, version-controlled institutional constraint with open JSON parameters;
  draft → active → archived) and **Substitution** (a tracked, auditable teacher/venue
  override, replacement ≠ original; assigned → cancelled | completed). Each is a pure
  aggregate behind a repository port, a Prisma/RLS adapter at the composition root, an
  application service on the event bus, and a permission-gated, tenant-scoped REST
  controller.
- **A pure conflict engine that gates publication:** `detectConflicts` finds teacher /
  section / venue double-bookings (same-day overlapping half-open intervals), resource
  double-allocations, and policy violations (`max_teaching_periods`,
  `consecutive_period_limit`, `break_rule`) over narrow view interfaces the aggregates
  structurally satisfy. `TimetableService.publish` refuses to publish any schedule the
  engine rejects — considering the timetable's own slots plus every other published
  timetable in the same academic year/term, plus active allocations and active policies —
  emitting `scheduling.conflict.detected` and throwing on any conflict. Two further pure
  engines compute **teacher workload** and read-only **scheduling intelligence**
  (utilisation, density, workload distribution, conflict counts, optimisation hints).
- **A single `scheduling:*` scope:** the whole REST surface is gated by one
  `scheduling:read` / `scheduling:write` pair — scheduling is operational structure, not
  personal or sensitive data. Organization, grade, class, section, subject and teacher
  existence enter through injected directory ports (backed by the Organization,
  Academic-Structure and Person modules).
- **Persistence:** six `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`timetable`,
  `schedule_slot`, `resource`, `allocation`, `scheduling_policy`, `substitution`) with the
  standard `tenant_isolation` policy (fail-closed), soft-delete + audit columns, a DB unique
  index for every uniqueness rule, and non-null JSONB for all structured data (no scalar-list
  columns) — isolation, fail-closed reads and WITH CHECK cross-tenant rejection verified on
  live PostgreSQL for all six tables.
- **Events:** eight `scheduling.*` domain events — `scheduling.timetable.created`,
  `scheduling.timetable.published`, `scheduling.timetable.revised`,
  `scheduling.slot.assigned`, `scheduling.resource.allocated`, `scheduling.resource.released`,
  `scheduling.conflict.detected`, `scheduling.substitution.assigned` — published from the
  owning service transitions (resources and scheduling policies intentionally emit none).
- **Docs:** ADR-0026, the P2-D07 delivery report, and platform-state / register updates.

### Notes

- Independent audit found the domain internally consistent against the P2-D06 reference
  across ten areas (adapter/schema/migration mapping, conflict engine, publish gating,
  events, permission scopes, DTOs, cross-reference validation, multi-tenancy) with no
  High/security issues; one medium finding (`remove` omitting the draft-timetable guard) and
  two low findings (publish state-check ordering; reschedule placement collision surfacing a
  raw DB error) were fixed in-milestone with regression tests. All six service tokens are
  exported for downstream academic domains. New technical debt: TD-27 (three scheduling-policy
  rule types stored and version-controlled but not yet evaluated, behind a stable dispatch).

## [Unreleased] — P2-D06 · Program: Academic Excellence Platform · Academic Structure & Curriculum Platform

The first contract of a new program — **Academic Excellence Platform** — on the certified
`v0.2.0` baseline and the frozen Phase-1 core, alongside the completed Student Lifecycle
program. The authoritative source for an institution's academic organization — what is
taught, when, to whom, and under which framework — delivered as one
`@knowget/academic-structure` package (ADR-0025). Structure, not activity: timetables,
attendance, teaching, homework, examinations, assessment scoring and report cards are
explicit non-goals that consume this platform rather than living in it.

### Added

- **Academic Structure & Curriculum Platform (ADR-0025):** eight aggregates in one
  `@knowget/academic-structure` package — **Academic Calendar** (one per organization and
  academic year: terms/semesters/trimesters, holidays, examination periods, special events
  and working days across a draft → published → archived lifecycle), **Academic Program**
  (Pre-Primary…Diploma/vocational/custom stage groupings of grades), **Curriculum
  Framework** (board-affiliated, version-controlled via a counter plus an append-only
  revision log, multiple coexisting per institution — CBSE, ICSE, IB, Cambridge, state
  boards, vocational, custom — an archived framework immutable), **Grade** (hierarchy
  level, validated promotion target and rule, age guidelines), **Class** (the running of a
  grade for one academic year with an optional validated curriculum assignment),
  **Section** (a teachable division of a class with a capacity and a planned → active →
  closed lifecycle), **Subject** (mandatory/elective catalog entry with credits, elective
  group, cross-disciplinary flag and validated prerequisite subjects, self-reference
  rejected, version-counted) and **Learning Outcome** (a Bloom's-aligned statement attached
  to a subject, mapped to competencies and aligned to a curriculum framework and assessment
  methods, versioned). Each is a pure aggregate behind a repository port, a Prisma/RLS
  adapter at the composition root, an application service on the event bus, and a
  permission-gated, tenant-scoped REST controller; the academic hierarchy derives its
  organization from the validated parent (grade → program, class → grade, section → class,
  outcome → subject) through injected directory ports, so the two can never disagree.
- **A single `academic:*` scope:** the whole REST surface is gated by one `academic:read` /
  `academic:write` pair — academic structure is organizational, not personal or sensitive,
  so per-area scopes (as in Learner Wellbeing) would add cost without benefit.
- **Persistence:** eight `FORCE ROW LEVEL SECURITY` tenant-isolated tables
  (`academic_calendar`, `academic_program`, `curriculum_framework`, `grade`,
  `academic_class`, `section`, `subject`, `learning_outcome`) with the standard
  `tenant_isolation` policy (fail-closed), soft-delete + audit columns, a DB unique index
  for every uniqueness rule, and scalar-list columns non-null with an empty-array default
  (the P2-D05 audit lesson carried forward from the outset) — isolation, fail-closed reads
  and WITH CHECK cross-tenant rejection verified on live PostgreSQL for all eight tables.
- **Events:** ten `academic.*` domain events — `academic.year.created`,
  `academic.calendar.published`, `academic.curriculum.created`,
  `academic.curriculum.revised`, `academic.grade.created`, `academic.class.created`,
  `academic.section.created`, `academic.subject.registered`, `academic.subject.updated`,
  `academic.learning_outcome.defined` — published from the owning service transitions
  (academic programs intentionally emit none, per the contract).
- **Docs:** ADR-0025, the P2-D06 delivery report, and platform-state / register updates.

### Notes

- Independent audit found the domain internally consistent against the P2-D05 reference; one
  low finding (a spurious `academic.subject.updated` event on an idempotent prerequisite
  no-op) was fixed in-milestone — the service now skips the save and event when a transition
  is a genuine no-op — with a regression test added. All eight service tokens are exported
  for downstream academic domains. No new technical debt.

## [Unreleased] — P2-D05 · Program: Student Lifecycle · Learner Wellbeing, Safety & Success Platform

The third contract of Program: Student Lifecycle, on the certified `v0.2.0` baseline and
the frozen Phase-1 core. The authoritative model for protecting, supporting and developing
every learner's physical, emotional, behavioural, psychological and social wellbeing,
delivered as one `@knowget/learner-wellbeing` package (ADR-0024).

### Added

- **Learner Wellbeing, Safety & Success Platform (ADR-0024):** seven aggregates in one
  `@knowget/learner-wellbeing` package — **Wellbeing Profile** (the aggregating model of
  the physical/emotional/social/behavioural dimensions, learning-support indicators,
  success metrics and AI-ready indicators), **Health Record** (medical history, allergies,
  chronic conditions, immunizations, medications, standing medical alerts, emergency plan),
  **Behaviour Record** (positive recognition, observations, incidents with restorative
  actions, developmental goals and an improvement plan — development over punishment),
  **Counselling Case** (registration, append-only confidential session history, referrals,
  goals, terminal closure — many per learner), **Safeguarding Case** (child-protection
  concern, risk classification, an investigation-and-escalation workflow with a traceable
  escalation trail, external-agency coordination, terminal resolution — many per learner),
  **Learner Support Plan** (accommodations, inclusion strategies, personalized goals, review
  schedule) and **Intervention Plan** (early-warning triggers, assigned interventions with
  progress monitoring and outcome evaluation). Each is a pure aggregate behind a repository
  port, a Prisma/RLS adapter at the composition root, an application service on the event
  bus, and a permission-gated, tenant-scoped REST controller; Student (P2-D03) and Person
  (P2-D01-M02) existence enter through injected directory ports — the Student directory both
  validates the learner and supplies the organization.
- **Fine-grained per-area authorization:** each sensitive area carries its own read/write
  scope — `wellbeing:*`, `health:*`, `behaviour:*`, `counselling:*`, `safeguarding:*`,
  `support:*`, `intervention:*` — so health, counselling and safeguarding are authorized
  independently of one another and of general wellbeing. Counselling is isolated with
  enhanced privacy; safeguarding is the most restricted.
- **Persistence:** seven `FORCE ROW LEVEL SECURITY` tenant-isolated tables
  (`wellbeing_profile`, `health_record`, `behaviour_record`, `counselling_case`,
  `safeguarding_case`, `learner_support_plan`, `intervention_plan`) with the standard
  `tenant_isolation` policy (fail-closed), soft-delete + audit columns, and a
  `(tenant, student)` unique index on the five one-per-student aggregates — isolation,
  fail-closed reads and WITH CHECK cross-tenant rejection verified on live PostgreSQL.
- **Events:** eleven `wellbeing.*` domain events —
  `wellbeing.health_record.created`, `wellbeing.medical_alert.updated`,
  `wellbeing.behaviour_observation.recorded`, `wellbeing.behaviour_incident.reported`,
  `wellbeing.counselling_case.opened`, `wellbeing.counselling_case.closed`,
  `wellbeing.safeguarding_case.opened`, `wellbeing.safeguarding_case.escalated`,
  `wellbeing.intervention.assigned`, `wellbeing.intervention.completed`,
  `wellbeing.support_plan.updated` — carrying only routing/metadata, never confidential
  content.
- **Docs:** ADR-0024, the P2-D05 delivery report, and platform-state / register updates.

### Notes

- Independent audit found the domain internally consistent; one medium schema-drift finding
  (array columns) was fixed in-milestone and re-verified on live PostgreSQL. All seven
  service tokens are exported for downstream domains. No new technical debt.

## [Unreleased] — P2-D04 · Program: Student Lifecycle · Family & Guardian Intelligence Platform

The second contract of Program: Student Lifecycle, on the certified `v0.2.0` baseline
and the frozen Phase-1 core. The authoritative model of families and guardianship,
delivered as one `@knowget/family-guardian` package (ADR-0023).

### Added

- **Family & Guardian Intelligence Platform (ADR-0023):** seven aggregates in one
  `@knowget/family-guardian` package — **Family** (a household unit, deliberately
  independent of Student, with members, addresses, a primary contact and a
  merge/split/archive lifecycle), **Guardian** (Person-linked, with a basis of legal
  authority, an independent identity-verification track and a pending → active →
  suspended → archived lifecycle), **Student–Guardian Relationship** (the many-to-many
  join to a P2-D03 Student, with independently-managed legal / educational / financial
  responsibilities and pickup / medical authorizations, and custody validation — legal
  responsibility requires the guardian to hold legal authority), **Consent** (an
  immutable, versioned, append-only ledger across six consent types, policy-linked to
  P2-D02), **Emergency Contact** (a prioritized calling hierarchy per student), and
  per-family **Communication** and **Intelligence** profiles (AI-ready, model +
  integration points only). Each is a pure aggregate behind a repository port, a
  Prisma/RLS adapter at the composition root, an application service on the event bus,
  and a permission-gated (`family:read`/`:write`), tenant-scoped REST controller; Person,
  Organization, Student (P2-D03) and Policy (P2-D02) existence enter through injected
  directory ports.
- **Persistence:** seven `FORCE ROW LEVEL SECURITY` tenant-isolated tables (`family`,
  `guardian`, `student_guardian_relationship`, `family_consent`, `emergency_contact`,
  `communication_profile`, `family_intelligence_profile`) with the standard
  `tenant_isolation` policy, soft-delete + audit columns (the consent ledger excepted —
  append-only), and unique constraints on family number, guardian (person+org), consent
  version, and one profile per family — verified on live PostgreSQL.
- **Events:** eight `family.*` domain events — `family.registered`,
  `family.guardian.registered`, `family.guardian.assigned`, `family.guardian.removed`,
  `family.consent.granted`, `family.consent.withdrawn`, `family.emergency_contact.updated`,
  `family.pickup_authorization.changed`.
- **Docs:** ADR-0023, the P2-D04 delivery report, and platform-state / technical-debt
  (TD-25, TD-26) / register updates.

### Notes

- Independent audit found no High/Medium correctness bugs; the domain was certified
  internally consistent. All seven service tokens are exported for downstream domains.

## [Unreleased] — P2-D03 · Program: Student Lifecycle Intelligence Platform

The highest business domain of Phase 2, on the certified `v0.2.0` baseline and the
frozen Phase-1 core. The authoritative model of a learner's institutional journey,
delivered as one `@knowget/student-lifecycle` package (ADR-0022).

### Added

- **Student Lifecycle Intelligence Platform (ADR-0022):** six aggregates in one
  `@knowget/student-lifecycle` package — **Prospect** (the enquiry funnel), **Applicant**
  (admissions lifecycle with document checklist, interview and decision), **Student**
  (the enrolled learner, linked through Person + Membership and never duplicating
  identity, driving `enrolled → active → on_leave → transferred | withdrawn | graduated
  → alumni` with a unique student number and a single active enrollment per institution),
  **Educational Journey** (append-only progression), **Intelligence Profile** (AI-ready
  indicators + intervention history, model + integration points only), and an immutable,
  append-only **Timeline**. Each is a pure aggregate behind a repository port, a
  Prisma/RLS adapter at the composition root, an application service on the event bus, and
  a permission-gated (`student:read`/`:write`), tenant-scoped REST controller; Person,
  Organization and Membership existence enter through injected directory ports.
- **Student events:** nine `student.*` domain events on the platform bus —
  `prospect.created`, `application.submitted`, `applicant.approved`, and `enrolled`,
  `promoted`, `transferred`, `withdrawn`, `graduated`, `became_alumni` — the foundation
  for the downstream academic domains.
- **Persistence:** six tables (`student_prospect`, `student_applicant`, `student`,
  `student_educational_journey`, `student_intelligence_profile`, `student_timeline_entry`)
  with **FORCE ROW LEVEL SECURITY** + tenant-isolation, verified on live PostgreSQL; the
  student number is DB-unique per tenant; the timeline is an immutable append-only ledger.
- **API:** `StudentLifecycleModule` wires six repositories, three directories and six
  services, registered in the root module; all six service tokens are exported for
  in-process cross-domain consumption.

### Notes

- No frozen-code change. Domain Prisma adapters remain at the composition root (TD-21).
  New low-priority TD-24: single-active-enrollment is service-enforced, DB backstop
  deferred. The consistency pass had the journey/intelligence/timeline services derive
  organization from the student (closing a cross-domain-integrity gap). Gates green
  (build, lint, typecheck, 26 package + 174 API tests); the Prisma build/migration/tests
  run in CI (TD-12).

## [Unreleased] — P2-D02 · Program B: Institutional Governance Platform

The first contract of Phase 2 Program B, on the certified `v0.2.0` Identity &
Organization baseline and the frozen Phase-1 core. The authoritative model for
institutional authority, accountability and governance, delivered as one
`@knowget/governance` package (ADR-0021).

### Added

- **Institutional Governance Platform (ADR-0021):** six aggregates in one
  `@knowget/governance` package — **governance body** (rooted on an organization node,
  nesting into a hierarchy), **committee** (single chair/secretary, Person members),
  **policy registry** (versioned author→approve→publish→retire, acknowledgment, "which
  policies apply"), **delegation of authority** (scope + monetary limit, effective
  window, approval matrix, `authorizes` check), **resolution** (draft→voting→tally→
  implement), and **governance calendar** (meetings/deadlines/reviews with validated
  attendees). Each is a pure aggregate behind a repository port, a Prisma/RLS adapter at
  the composition root, an application service on the event bus, and a permission-gated
  (`governance:read`/`:write`), tenant-scoped REST controller; organization/person
  existence enters through injected directory ports.
- **Reusable approval workflow:** one `WorkflowDefinition` over the frozen
  `@knowget/workflow` engine — `draft → in_review → approved | rejected` with a
  `request_changes` loop — instantiated for policy/committee/resolution/delegation
  approval, guarded for **segregation of duties**, and persisted as a
  `GovernanceApproval` whose append-only history is the audit trail. Exposed at
  `governance/approvals`.
- **Governance events:** eight `governance.*` domain events on the platform bus —
  `GovernanceBodyCreated`, `CommitteeCreated`, `PolicyPublished`, `PolicyRetired`,
  `DelegationGranted`, `DelegationRevoked`, `ResolutionApproved`, `ResolutionImplemented`.
- **Persistence:** eight tables (`governance_body`, `_committee`, `_policy`,
  `_policy_acknowledgment`, `_delegation`, `_resolution`, `_calendar_entry`, `_approval`)
  with **FORCE ROW LEVEL SECURITY** + tenant-isolation, verified on live PostgreSQL; the
  policy-acknowledgment table is an intentional immutable append-only ledger.
- **API:** `GovernanceModule` wires eight repositories, two directories and seven
  services, registered in the root module; all six aggregate service tokens are exported
  for in-process cross-domain consumption.

### Notes

- No frozen-code change; the workflow engine is reused, not modified. Domain Prisma
  adapters remain at the composition root (TD-21). New low-priority TD-23: the approval
  subject is referenced opaquely (`kind` + `subjectId`), decoupling the reusable workflow
  from the aggregates. Gates green (build, lint, typecheck, 73 governance + 166 API
  tests); the Prisma build/migration/tests run in CI (TD-12).

## [Unreleased] — Security hardening (post-0.2.0)

Post-certification hardening of the live security path, on the frozen Phase-1 core
and the certified `v0.2.0` Identity & Organization program. All env-gated behind
`SECURITY_STORE=persisted` (memory remains the default); the memory request path is
unchanged.

### Added

- **Live security wiring (ADR-0014):** with `SECURITY_STORE=persisted` the running
  app authenticates and authorizes against the certified persisted, tenant-scoped
  identity / principal→role / role→permission stores. Tenant travels as a JWT claim
  (no frozen-code change); an opt-in `@Global` module with an `@Optional` fallback
  keeps memory mode Prisma-free; an idempotent seeder provisions the bootstrap admin.
- **Session & token-revocation persistence (ADR-0015):** `security_session` and
  `security_revocation` tables (FORCE RLS, tenant-isolated); sessions and token
  revocation persisted behind ports and **enforced per request** via an `@Optional`
  `SessionEnforcer` on the JWT guard (fail-closed). A `jti` claim on the persisted
  access token and a `POST /secure/logout` route make revocation effective and
  durable.
- **Refresh-token rotation & replay detection (ADR-0016):** `security_refresh_token`
  table (FORCE RLS); refresh tokens are persisted (SHA-256 hash only), single-use,
  and rotate within a **session-bound family**. `POST /secure/refresh` rotates the
  token and re-issues an access token for the same session; replaying a consumed
  token revokes the family and its session, and the access token's `fid` claim makes
  the guard reject every token in that family. Logout ends the whole lineage.
- **Distributed cache, rate limiter & session read-through (ADR-0017):** one
  backend-agnostic `KeyValueStore` — Redis when `REDIS_URL` is set, in-memory
  otherwise — backs an async rate limiter whose fixed-window counter is shared across
  replicas, a Redis-backed `Cache` behind the existing port, and a session
  read-through cache that skips the per-request session-store validate. Env-gated;
  a `redis` service was added to CI for the gated integration test.
- **Distributed shared services (ADR-0018):** the four remaining shared services are
  distributed behind their existing ports, env-gated with in-memory defaults —
  **Redis** (`REDIS_URL`) backs a shared job queue (atomic Lua claim, retry +
  dead-letter) and a shared in-app inbox; **Postgres** (`SERVICES_STORE=persisted`)
  backs full-text search (`tsvector`/GIN, `plainto_tsquery`/`ts_rank`) and a `bytea`
  blob store. The frozen sync ports are bridged by async seams; the Prisma adapters
  sit behind an opt-in module so the default build stays Prisma-free.
- **KMS signing-key custody & token-signer seam (ADR-0019):** under
  `SECURITY_KEY_CUSTODY=envelope` a `KmsClient` (`wrap`/`unwrap`) unwraps a
  KMS-wrapped signing key at boot to seed the `KeyRing`, so the key is never held in
  plaintext at rest; the `plaintext` default is unchanged. Token issuance runs through
  an async `TokenSigner` seam — the active `HmacTokenSigner` verifies across retained
  key versions (rotation overlap), and an RS256 `AsymmetricTokenSigner` over a
  `KmsSigner` port (private key never leaves the device) is ready behind the seam. No
  frozen change; a cloud-KMS/HSM adapter is the production drop-in.
- **Job-queue visibility timeout & sliding-window rate limiter (ADR-0020):** the Redis
  job queue claims into an in-flight set scored by a visibility deadline and reaps
  expired claims, so a **worker that crashes mid-run no longer loses the job**
  (at-least-once). The `KeyValueStore` gains a clock-aligned sliding-window primitive
  behind a `SlidingWindowRateLimiter`, selected by `RATE_LIMIT_STRATEGY=sliding` with
  the fixed-window default unchanged. Composition-root only; no frozen change.

### Notes

- **TD-16 and TD-18 are resolved:** identity, principal→role, role→permission,
  sessions, token revocation, and refresh-token rotation/replay are all persisted,
  tenant-scoped and enforced under `SECURITY_STORE=persisted`. Promoting `persisted`
  to the default is an operational toggle.
- **TD-17, TD-19 and TD-22 are resolved:** the rate limiter, cache, jobs,
  notifications, search, files and the session read-through all have distributed
  backends (Redis / Postgres) behind their ports, env-gated with the in-memory
  default unchanged.
- **TD-11 is resolved:** signing-key custody moves behind the frozen `KeyRing` — a
  KMS-wrapped key unwrapped at boot (`SECURITY_KEY_CUSTODY=envelope`), an async
  token-signer seam with multi-version verify, and an asymmetric RS256 signer ready
  behind a `KmsSigner` port; env-gated with the plaintext default unchanged.

## [0.2.0] — 2026-07-18 — Phase 2 · Program A: Identity & Organization (certified baseline)

The first Phase-2 domain program, built on the frozen Phase-1 core. Six domains
on the domain architecture pattern (ADR-0010), each tenant-isolated by FORCE
Row-Level Security and composing into a proven, data-driven authorization flow.
Certified and baselined — see
`docs/certification/P2-D01-IdentityOrganization-Certification-Report.md`.

### Added

- **Organization (P2-D01-M01):** the institution hierarchy (trust→school→…→
  section) — aggregate, hierarchy operations, lifecycle, events, RLS table, REST.
- **Person (P2-D01-M02):** the persona-agnostic human record — names,
  demographics, embedded contacts, deterministic dedup match key, merge, RLS
  table, REST.
- **Enterprise Identity (P2-D01-M03):** tenant-scoped login accounts linking a
  Person to identifiers/credential/lockout; GIN identifier lookup; the bridge that
  runs the frozen `AuthenticationEngine` against persisted accounts (ADR-0011).
- **Membership (P2-D01-M04):** a person's roles within an organization node;
  lifecycle; the persisted, tenant-scoped `PrincipalResolver`.
- **Authorization / Roles (P2-D01-M05):** the tenant-scoped role catalogue
  (name→permissions); authorization made data-driven via a permission-resolution
  decorator over the resolver (ADR-0012); membership role-name validation.
- **Relationship (P2-D01-M06):** typed person↔person associations (guardian/
  parent/sibling/spouse/emergency contact) with directionality and `counterpart`.
- **Certification (P2-D01-M07):** a cross-domain suite proving login → principal
  resolution → authorization end to end; certification report; ADR-0013.

### Notes

- The RBAC substance of TD-16 is resolved and certified (persisted, tenant-scoped
  identity / principal→role / role→permission). The live security-bootstrap swap
  (tenant propagation + DB-seeded admin) and session/revocation persistence are
  deliberately scoped to the operations/hardening phase (ADR-0013).

## [0.1.0] — 2026-07-17 — Phase 1: Platform Core (certified baseline)

The complete platform core on which every Phase-2 domain is built. Certified and
frozen (see `docs/certification/P1-Phase1-Certification-Report.md`).

### Added

- **Foundation (P1-M01):** Turborepo + pnpm monorepo, TypeScript strict, ESLint/
  Prettier/Husky/commitlint, CI (verify · security-audit · E2E), containers.
- **Runtime kernel (P1-M02):** kernel (clock/id/lifecycle/health/runtime events),
  AsyncLocalStorage runtime context, schema-validated configuration, global error
  boundary, NestJS platform module.
- **Data platform (P1-M03):** PostgreSQL + Prisma (infrastructure only),
  ORM-agnostic `@knowget/persistence`, transactions/unit-of-work, **RLS
  multi-tenancy** (FORCE, fail-closed), auditing, soft delete, migrations.
- **Security (P1-M04):** `node:crypto` crypto services, versioned key ring,
  HS256 tokens + refresh + revocation, digital identity with lockout, deny-first
  RBAC/ABAC engine, session management, tamper-evident hash-chained audit, and the
  NestJS guard stack (rate-limit → JWT auth → permissions).
- **Shared services (P1-M05):** cache, jobs & scheduling, files/blob storage,
  full-text search, i18n, notifications, document generation, media, workflow, and
  a transactional event outbox — each a port with an in-memory default — plus the
  API `ServicesModule`.
- **Observability & DevOps (P1-M06):** metrics (+ Prometheus `/metrics`), tracing
  spans (correlation→trace bridge), reliability primitives (retry/timeout/circuit
  breaker), threshold alerting, diagnostics (`/diagnostics`), a request
  instrumentation interceptor, and the Prisma musl target for Alpine images.
- **Certification (P1-M07):** Phase-1 certification report, performance baseline
  harness (`pnpm bench`), one-command `pnpm certify`, and this baseline.

### Resolved technical debt

- TD-02 persistence · TD-03 authentication · TD-04 security foundation ·
  TD-10 distributed-tracing spans · TD-15 Prisma Alpine (musl) target.

### Notes

- 30+ workspace packages; 195 package tests + 32 API tests; CI green on `main`.
- Deferred items are interface-protected and tracked in
  `docs/technical-debt-register.md`; no `TODO`/`FIXME` markers exist in the code.
