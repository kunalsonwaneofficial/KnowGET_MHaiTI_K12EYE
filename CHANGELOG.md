# Changelog

All notable changes to KnowGET MHaiTI are documented here. The project follows
[Semantic Versioning](https://semver.org/); phase baselines are tagged.

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
