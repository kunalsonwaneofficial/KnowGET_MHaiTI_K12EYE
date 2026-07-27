# Platform State Register

Authoritative record of what has been engineered, certified, and is reusable.
Updated at the close of every engineering contract.

> **Phase 1 — Platform Core is CERTIFIED and frozen at `v0.1.0` (2026-07-17).**
> All 7 contracts merged and CI-green on `main`; Phase-2 domains build on this
> baseline. See `docs/certification/P1-Phase1-Certification-Report.md`.

## Phase 1 — Platform Core Engineering

| Contract                                             | Status      | Notes                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-M01 Repository & Workspace Foundation             | ✅ Complete | Monorepo, 11 packages, 4 apps, CI, Docker, hooks. Live on `main`.                                                                                                                                 |
| P1-M02 Platform Runtime Kernel                       | ✅ Complete | Kernel/context/config/health/exceptions + NestJS wiring. Live on `main`.                                                                                                                          |
| P1-M03 Enterprise Data Platform                      | ✅ Complete | Prisma platform, persistence, RLS multi-tenancy. CI-verified incl. integration tests. Live on `main`.                                                                                             |
| P1-M04 Security Foundation                           | ✅ Complete | Crypto/keys, tokens, identity, RBAC/ABAC, sessions, auth engine, hash-chained audit, and the NestJS guard stack. CI green (verify incl. Prisma build, audit, E2E). Live on `main`.                |
| P1-M05 Enterprise Shared Services Platform           | ✅ Complete | Cache, jobs/scheduler, files, search, i18n, notifications, documents, media, workflow, events outbox + API ServicesModule. CI green (verify incl. Prisma build, audit, E2E). Live on `main`.      |
| P1-M06 Observability & DevOps Platform               | ✅ Complete | Metrics (+Prometheus), tracing spans, reliability, alerting, diagnostics + API ObservabilityModule (/metrics, /diagnostics, request interceptor). Resolves TD-10/TD-15. CI green. Live on `main`. |
| P1-M07 Platform Certification & Production Readiness | ✅ Complete | Phase-1 certified; performance baseline captured; baseline frozen and tagged `v0.1.0`. See `docs/certification/P1-Phase1-Certification-Report.md`.                                                |

## Phase 2 — Enterprise Domain Engineering

> **Program A — Identity & Organization is CERTIFIED and baselined at `v0.2.0`
> (2026-07-18).** All 7 contracts merged and CI-green on `main`; the six domains
> compose into a proven, data-driven authorization flow. See
> `docs/certification/P2-D01-IdentityOrganization-Certification-Report.md`.

Domains build on the certified `v0.1.0` core following the domain architecture
pattern (ADR-0010). Program A — Identity & Organization:

| Contract                           | Status      | Notes                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D01-M01 Organization Foundation | ✅ Complete | Organization domain (hierarchy, lifecycle, events) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                                        |
| P2-D01-M02 Person Platform         | ✅ Complete | Person domain (names, demographics, contacts, dedup/merge, lifecycle) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                                                                                     |
| P2-D01-M03 Enterprise Identity     | ✅ Complete | Enterprise identity domain (tenant-scoped login accounts, identifiers, credential, lifecycle, lockout) linked to Person + RLS table (GIN identifier lookup) + REST module + auth-engine bridge. CI green; RLS verified on live PostgreSQL. Live on `main`.                      |
| P2-D01-M04 Membership              | ✅ Complete | Membership domain (Person→Organization role assignment, lifecycle, effective period) + RLS table + REST module + persisted tenant-scoped PrincipalResolver. CI green; RLS verified on live PostgreSQL. Live on `main`.                                                          |
| P2-D01-M05 Authorization           | ✅ Complete | Tenant-scoped role catalogue (name→permissions, lifecycle, system-role protection) + RLS table + REST module; authorization made data-driven via a permission-resolution decorator; membership role-name validation. CI green; RLS verified on live PostgreSQL. Live on `main`. |
| P2-D01-M06 Relationship            | ✅ Complete | Relationship domain (typed person↔person associations: guardian/parent/sibling/spouse/emergency-contact, directionality + counterpart, lifecycle) + RLS table + REST module. CI green; RLS verified on live PostgreSQL. Live on `main`.                                         |
| P2-D01-M07 Domain certification    | ✅ Complete | Identity & Organization sub-domain **CERTIFIED** & baselined `v0.2.0`: cross-domain chain (login→principal→authorization) proven in-sandbox; six domains' RLS verified on live PostgreSQL; certification report + ADR-0013. CI green. Live on `main`.                           |

Program B — Institutional Governance builds on the certified `v0.2.0` Identity &
Organization baseline, following the same domain architecture pattern (ADR-0010):

| Contract                                 | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D02 Institutional Governance Platform | ✅ Complete | Governance domain — six aggregates (governance body, committee, policy registry, delegation of authority, resolution, governance calendar) + a **reusable approval workflow** on the Phase-1 engine (policy/committee/resolution/delegation) — as one `@knowget/governance` package; 8 FORCE-RLS tables; 8 domain events; 7 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0021. CI green (PR #20); **live on `main`**. |

Program: Student Lifecycle builds on the same certified `v0.2.0` baseline (and the
governance platform), following the domain architecture pattern (ADR-0010):

| Contract                                            | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-D03 Student Lifecycle Intelligence Platform      | ✅ Complete | Student lifecycle domain — six aggregates (prospect, applicant, student, educational journey, intelligence profile, immutable timeline) as one `@knowget/student-lifecycle` package; identity linked through Person + Membership (never duplicated); 6 FORCE-RLS tables; 9 domain events; 6 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0022. CI green; **live on `main`**.                                                                                                                                                                                                                                                                                                                                             |
| P2-D04 Family & Guardian Intelligence Platform      | ✅ Complete | Family & guardian domain — seven aggregates (family, guardian, student–guardian relationship, immutable consent ledger, prioritized emergency contact, communication profile, intelligence profile) as one `@knowget/family-guardian` package; families independent of Student; guardians ↔ students many-to-many with custody validation; 7 FORCE-RLS tables; 8 domain events; 7 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0023. CI green; **live on `main`**.                                                                                                                                                                                                                                                       |
| P2-D05 Learner Wellbeing, Safety & Success Platform | ✅ Complete | Wellbeing / safety domain — seven aggregates (wellbeing profile, health record, behaviour record, counselling case, safeguarding case, learner support plan, intervention plan) as one `@knowget/learner-wellbeing` package; every record derives its organization from a validated Student; **fine-grained per-area authorization** (independent `wellbeing`/`health`/`behaviour`/`counselling`/`safeguarding`/`support`/`intervention` scopes); counselling & safeguarding many-per-student with append-only histories and terminal states; traceable safeguarding escalation; 7 FORCE-RLS tables; 11 domain events (content-free); 7 permission-gated REST modules. Gates green; RLS verified on live PostgreSQL. ADR-0024. CI green; **live on `main`**. |

Program: Academic Excellence Platform opens on the same certified `v0.2.0` baseline,
following the domain architecture pattern (ADR-0010):

| Contract                                                                | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-D06 Academic Structure & Curriculum Platform                         | ✅ Complete | Academic-structure domain — eight aggregates (academic calendar, program, curriculum framework, grade, class, section, subject, learning outcome) as one `@knowget/academic-structure` package; organization-scoped with the hierarchy deriving org from its parent (grade→program, class→grade, section→class, outcome→subject); multiple curricula coexist per org; version-controlled curricula/subjects/outcomes; 8 FORCE-RLS tables; 10 domain events; 8 REST modules under one `academic:read`/`:write` scope. Gates green; RLS verified on live PostgreSQL. ADR-0025. **CI green; merged to main (`14786ec`).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P2-D07 Enterprise Academic Scheduling & Resource Orchestration Platform | ✅ Complete | Scheduling domain — six aggregates (timetable, schedule slot, resource, allocation, scheduling policy, substitution) plus three pure engines (conflict detection, teacher workload, scheduling intelligence) as one `@knowget/academic-scheduling` package; **publication hard-gated by a pure conflict engine** across own + peer published-timetable slots, active allocations and active policies (teacher/section/venue/resource double-bookings + policy violations); version-controlled timetables/policies; 6 FORCE-RLS tables; 8 domain events; 6 REST modules under one `scheduling:read`/`:write` scope; org/grade/class/section/subject/teacher validated via directory ports. Gates green; RLS verified on live PostgreSQL. ADR-0026 (TD-27). **CI green; merged to main (`29d0a3b`).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P2-D08 Attendance & Presence Intelligence Platform                      | ✅ Complete | Attendance domain — six aggregates (attendance session, attendance record, leave, attendance policy, presence profile, participation) plus two pure engines (policy evaluation, presence intelligence) as one `@knowget/attendance-presence` package; **attendance immutable with versioned, reasoned, append-only corrections**; approved leave excuses absences through one shared leave-range helper so the policy percentage and the presence chronic-absence streak always agree; version-controlled attendance policies; AI-ready presence profile (descriptive only); 6 FORCE-RLS tables; 9 domain events; 7 REST modules under one `attendance:read`/`:write` scope; org/participant/schedule-slot/section/subject validated via directory ports. Gates green (typecheck 95/95, build 51/51, 39 pkg + 184 api tests); RLS verified on live PostgreSQL. ADR-0027 (TD-28). **CI green; merged to main (`bdcbf9e`).**                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P2-D09 Teaching, Learning & Instruction Intelligence Platform           | ✅ Complete | Teaching-learning domain — seven aggregates (academic plan, unit plan, lesson plan, learning resource, classroom session, assignment, learning evidence) plus a pure instructional-intelligence engine as one `@knowget/teaching-learning` package; **every instructional activity traceable to curriculum outcomes**; version-controlled lesson plans (review/approval workflow) and learning resources; classroom sessions capture planned-vs-actual delivery (not attendance); assignments track completion (not grading); learning evidence linked to a validated instructional activity; AI-ready instructional analytics (coverage/completion/consistency/engagement/pace/utilisation/workload, 0–100 clamped, descriptive only); 7 FORCE-RLS tables; 9 domain events; 8 REST modules under one `teaching:read`/`:write` scope; org/subject/section/curriculum/schedule-slot/student validated via directory ports. Gates green (typecheck 97/97, build 52/52, 32 pkg + 186 api tests); RLS verified on live PostgreSQL. ADR-0028 (TD-29). **CI green; merged to main (`f1ef77c`).**                                                                                                                                                                                                                                                                                               |
| P2-D10 Assessment & Evaluation Platform                                 | ✅ Complete | Assessment-evaluation domain — seven aggregates (assessment framework, assessment plan, assessment, question bank, evaluation, competency profile, academic record) plus **two pure engines** (grading, assessment intelligence) as one `@knowget/assessment-evaluation` package; **grades flow through one grading engine so report card, transcript and analytics figures agree by construction**; competency mastery tracked on an ordinal scale **independently of raw marks**; academic records **immutable after publication** with a reasoned, versioned, append-only amendment workflow; evaluation an auditable draft → submitted → moderated → approved (reopenable) marking workflow; version-controlled frameworks/question banks (revise guarded to active only); AI-ready assessment analytics (throughput/approval/performance/consistency/mastery/gaps/coverage, 0–100 clamped, descriptive only); 7 FORCE-RLS tables; 9 domain events; 9 REST modules under one `assessment:read`/`:write` scope; org/subject/student validated via directory ports. Gates green (typecheck 99/99, build 53/53, 38 pkg + 188 api tests); RLS verified on live PostgreSQL. ADR-0029 (TD-30). **CI green; merged to main (`5ffb7b5`).**                                                                                                                                                   |
| P2-D11 Learning Intelligence & Educational Insights Platform            | ✅ Complete | Learning-intelligence domain — seven aggregates (learner insight profile, learning signal, early warning, educational insight, recommendation, growth plan, cohort insight) plus **three pure engines** (learner-insight synthesis, early-warning rule evaluation, cohort rollup) as one `@knowget/learning-intelligence` package; **synthesizes** the upstream academic domains' descriptive indicators into unified learner intelligence — **descriptive and explainable only, ML prediction deferred to the intelligence core (P2-D28)**; an evidence chain on every signal/warning/insight/recommendation; rule-based explainable early warnings; **human-in-the-loop** recommendations (platform proposes, humans decide); profiles refreshed from signals; growth plans close the loop to audited goal outcomes; cohort insights as the leadership rollup; 7 FORCE-RLS tables; 9 domain events; 7 REST modules under one `insight:read`/`:write` scope; org/student validated via directory ports. Gates green (typecheck 101/101, build 54/54, 31 pkg + 190 api tests); RLS verified on live PostgreSQL. ADR-0030 (TD-31). **Completes Program B (learner & academic core). CI green; merged to main (`6edc0b1`).**                                                                                                                                                               |
| P2-D12 Workforce & Human Capital Platform                               | ✅ Complete | Workforce domain — eight aggregates (department, position, employee, employment contract, leave entitlement, leave request, performance review, workforce profile) plus **two pure engines** (leave-ledger reconciliation, workforce-intelligence indicators + org rollup) as one `@knowget/workforce` package; the **staff system of record, HR analog of Student Lifecycle (P2-D03)**; **compensation out of scope — pay grade/band label only, money is Finance (P2-D14)**; **descriptive workforce profile — attrition-risk band is a worst-of-named-factors band, not a prediction (deferred to P2-D28)**; an employee is a validated **Person** (identity never duplicated); **version-controlled employment contracts** with a single-active invariant; one active employment per institution + unique employee number; leave reconciled into a per-type ledger (only approved draws down); only finalized reviews count toward standing; cycle-safe department hierarchy; 8 FORCE-RLS tables; 19 domain events; 7 REST modules under one `workforce:read`/`:write` scope; org/person validated via directory ports. Gates green (typecheck 103/103, build 55/55, 59 pkg + 192 api tests); RLS verified on live PostgreSQL. ADR-0031 (TD-32). **Opens Program C (workforce & operations). CI green; merged to main (`064538d`).**                                                 |
| P2-D13 Faculty Excellence, Coaching & Professional Growth Platform      | ✅ Complete | Faculty-excellence domain — eight aggregates (competency framework, observation, coaching engagement, coaching session, development requirement, professional-learning activity, development goal, faculty profile) plus **two pure engines** (CPD compliance-ledger, faculty-growth indicators + org rollup) as one `@knowget/faculty-excellence` package; the **professional-growth system of record for staff**, built on the workforce base (the coaching & PD workforce deferred); **descriptive faculty-growth band — transparent rating-to-band mapping, not a prediction (deferred to P2-D28)**; a staff member is a validated **Employee (P2-D12)** (identity never duplicated); competency frameworks with competencies frozen once active; observations scored against the framework (rating keys validated), only **acknowledged** counting toward standing; coaching with one active engagement per coachee; CPD reconciled into a per-category compliance ledger (only completed earns hours, credited up to each requirement); 8 FORCE-RLS tables; 15 domain events; 7 REST modules under one `faculty:read`/`:write` scope; org/employee validated via directory ports. Gates green (typecheck 105/105, build 56/56, 50 pkg + 194 api tests); RLS verified on live PostgreSQL. ADR-0032 (TD-33). **Second contract of Program C. CI green; merged to main (`9a1054a`).** |

## Reusable capabilities available now

| Package                          | Capability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@knowget/config`                | Shared ESLint / Prettier presets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@knowget/types`                 | Branded ids, `DomainEvent`, pagination, guards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@knowget/shared`                | `Result`, id/date/text utilities, assertions, boundary branding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@knowget/logging`               | Structured, level-filtered, redacting logger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@knowget/events`                | Typed error-isolating event bus + transactional outbox & relay (at-least-once)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@knowget/cache`                 | TTL/LRU in-memory cache, single-flight `getOrSet`, namespacing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@knowget/jobs`                  | Retrying/backing-off job queue + recurring/one-shot scheduler (injectable clock)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@knowget/files`                 | `BlobStore` (in-memory + node-fs), checksums, prefix listing, traversal-safe keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@knowget/search`                | Inverted-index full-text search, TF-IDF ranking, field filters, paging                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@knowget/i18n`                  | Message catalogs, locale fallback, interpolation, `Intl` pluralization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@knowget/notifications`         | Channels (email/SMS/push/in-app), templates, dispatcher, in-app inbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/documents`             | Structured document model + HTML/Markdown/text renderers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@knowget/media`                 | Media asset descriptors + rendition specs behind a `MediaProcessor` port                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@knowget/workflow`              | Guarded state-machine definitions + deterministic engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@knowget/metrics`               | Counter/gauge/histogram instruments + registry + Prometheus exposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@knowget/tracing`               | Spans, tracer, in-memory exporter; correlation-id → trace-id bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@knowget/reliability`           | Retry (backoff), timeout, circuit breaker (injectable clock)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@knowget/alerting`              | Threshold rules over metric readings + firing/resolved manager                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@knowget/diagnostics`           | Runtime snapshot + contributor sections (health/metrics/alerts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@knowget/testing`               | Deterministic clock, promise flushing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/ui`                    | Tailwind `cn`, foundational `Button`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@knowget/auth`                  | Principal / permission contracts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@knowget/security`              | scrypt/AES-256-GCM/HMAC crypto, versioned KeyRing, policy config, hash-chained audit, rate limiter, headers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@knowget/tokens`                | HS256 JWT, hashed refresh tokens, revocation registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/identity`              | Digital identity, credentials, status/lockout lifecycle, identity repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@knowget/authorization`         | Deterministic RBAC + ABAC engine, roles, policies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@knowget/authentication`        | Session management + authentication engine (verify, lockout, tokens, audit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@knowget/sdk`                   | Typed API client foundation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@knowget/exceptions`            | Standardized error model (+ `RateLimitError` 429) + safe client responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@knowget/context`               | Runtime context + AsyncLocalStorage propagation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@knowget/configuration`         | Typed schema-validated config, secrets, feature flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/health`                | Health indicator registry (liveness/readiness/startup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@knowget/kernel`                | Clock/Id services, lifecycle, runtime events, kernel assembly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@knowget/persistence`           | Repository, query/pagination, specification, unit-of-work, audit, validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@knowget/database`              | Prisma platform, generic repository, transactions, RLS multi-tenancy, auditing, DB health                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@knowget/organization`          | Organization aggregate, hierarchy ops, lifecycle state machine, events, repository port (P2-D01-M01)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@knowget/person`                | Person aggregate (name/demographics/contacts), dedup match key, merge, lifecycle, events, port (P2-D01-M02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@knowget/enterprise-identity`   | IdentityAccount aggregate — Person-linked, tenant-scoped login accounts: identifiers (normalized keys), credential, lifecycle, lockout, events, port; auth-engine bridge (P2-D01-M03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/membership`            | Membership aggregate — Person→Organization role assignment: role-name set, lifecycle, effective period, events, port; persisted PrincipalResolver (P2-D01-M04)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@knowget/roles`                 | Role catalogue aggregate — tenant-scoped RBAC roles (name→permissions), lifecycle, system-role protection, events, port; role existence + permission-union resolution (P2-D01-M05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@knowget/relationship`          | Relationship aggregate — typed person↔person associations (guardian/parent/sibling/spouse/emergency-contact), directionality + counterpart, lifecycle, events, port (P2-D01-M06)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@knowget/governance`            | Institutional Governance Platform — governance bodies, committees, policy registry (versioned), delegations of authority (approval matrix), resolutions (voting), governance calendar, and a reusable approval workflow (on `@knowget/workflow`); tenant-scoped aggregates, ports, `governance.*` events (P2-D02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@knowget/student-lifecycle`     | Student Lifecycle Intelligence Platform — prospect / applicant / student (Person- + Membership-linked), enrollment lifecycle (enquiry → alumni), append-only educational journey and permanent timeline, and an AI-ready intelligence profile; tenant-scoped aggregates, directory ports, `student.*` events (P2-D03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@knowget/family-guardian`       | Family & Guardian Intelligence Platform — family (independent of Student), guardian (Person-linked, legal authority + verification), student↔guardian relationships (many-to-many, custody-validated), immutable versioned consent ledger (policy-linked), prioritized emergency contacts, and per-family communication + AI-ready intelligence profiles; tenant-scoped aggregates, directory ports, `family.*` events (P2-D04)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@knowget/learner-wellbeing`     | Learner Wellbeing, Safety & Success Platform — per-learner wellbeing profile, health record, behaviour record (development over punishment) and one-per-learner support & intervention plans, plus many-per-learner counselling and safeguarding cases (append-only histories, terminal states, traceable escalation); Student-derived organization + Person-validated staff via directory ports; fine-grained per-area permission scopes; `wellbeing.*` events (content-free) (P2-D05)                                                                                                                                                                                                                                                                                                                                                                          |
| `@knowget/academic-structure`    | Academic Structure & Curriculum Platform — academic calendars, programs, version-controlled curriculum frameworks (multi-curriculum), grades, classes, sections, subjects (mandatory/elective, prerequisites, credits) and Bloom's-aligned learning outcomes; organization-scoped with the hierarchy deriving org from its parent; Organization-validated directory port; `academic.*` events (P2-D06)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@knowget/academic-scheduling`   | Enterprise Academic Scheduling & Resource Orchestration Platform — timetables (version-controlled, publication-gated), schedule slots, schedulable resources, allocations (capacity-validated), configurable version-controlled scheduling policies, and tracked substitutions; a **pure conflict engine** (teacher/section/venue/resource double-bookings + policy enforcement) that gates publication, plus teacher-workload and scheduling-intelligence engines; org/grade/class/section/subject/teacher directory ports; `scheduling.*` events (P2-D07)                                                                                                                                                                                                                                                                                                      |
| `@knowget/attendance-presence`   | Attendance & Presence Intelligence Platform — attendance sessions, **immutable audited** attendance records (versioned, reasoned corrections), leave (approved leave excuses absences), configurable version-controlled attendance policies, co-curricular participation, and an AI-ready presence profile; a **pure policy-evaluation engine** (percentage rules over leave-excused attendance) and a **presence-intelligence engine** (leave-aware chronic-absence streak, engagement, risk bands) sharing one leave-excusal helper; org/participant/schedule-slot/section/subject directory ports; `attendance.*` events (P2-D08)                                                                                                                                                                                                                             |
| `@knowget/teaching-learning`     | Teaching, Learning & Instruction Intelligence Platform — academic/unit/lesson planning (version-controlled lessons with a review/approval workflow), a version-controlled learning-resource library, classroom sessions (planned-vs-actual delivery, not attendance), assignments (completion tracking, not grading) and learning evidence (linked to a validated instructional activity); a **pure instructional-intelligence engine** (curriculum coverage, lesson completion, teaching consistency, engagement, pace, resource utilisation, submission rate, workload — descriptive only) over narrow views; org/subject/section/curriculum/schedule-slot/student directory ports; `teaching.*` events (P2-D09)                                                                                                                                               |
| `@knowget/assessment-evaluation` | Assessment & Evaluation Platform — assessment frameworks (grade bands, weightage, promotion criteria), assessment plans, assessments, version-controlled question banks, an auditable evaluation marking workflow (draft → submitted → moderated → approved, reopenable), competency profiles (ordinal mastery tracked independently of marks), immutable-after-publication academic records with a reasoned amendment workflow, and reporting (report cards, transcripts, competency reports); **two pure engines** — a **grading engine** (marks → percentage → grade → GPA, the seam every grade/GPA flows through) and an **assessment-intelligence engine** (throughput, approval, performance, consistency, mastery, gaps, coverage — descriptive only) over narrow views; org/subject/student directory ports; `assessment.*` events (P2-D10)             |
| `@knowget/learning-intelligence` | Learning Intelligence & Educational Insights Platform — evidence-bearing learning signals, a synthesized per-learner insight profile, rule-based explainable early warnings, educational insights (findings), human-in-the-loop recommendations, growth plans (measurable goals with audited outcomes) and leadership cohort insights; **three pure engines** — learner-insight **synthesis** (per-dimension → overall learning-health, bands), **early-warning** rule evaluation (transparent thresholds, names the rule and score), and **cohort rollup** (average, band distribution, learners needing attention) over narrow views; **descriptive and explainable only — ML prediction deferred to the intelligence core (P2-D28)**; synthesizes upstream indicators, never recomputes or predicts; org/student directory ports; `insight.*` events (P2-D11) |

## Data platform (P1-M03)

PostgreSQL + Prisma (infrastructure only). The reusable `@knowget/persistence`
abstractions are what domains depend on. Multi-tenancy is application-context +
PostgreSQL **Row-Level Security** (`FORCE` RLS on tenant-owned tables, session
scoped via `set_config('app.current_tenant', …)`). RLS isolation, transaction
rollback, soft delete and auditing are verified against a live PostgreSQL. The
API registers a database health indicator into the kernel's readiness probe.

## Security foundation (P1-M04)

Cryptography is `node:crypto` only (scrypt, AES-256-GCM, HMAC-SHA256, CSPRNG).
Authentication (the signed JWT `sub`) is separated from authorization: roles and
permissions are resolved **server-side per request** by a `PrincipalResolver`, so
role changes apply immediately. The `AuthorizationEngine` is deny-first (explicit
deny → RBAC → allow policy → default-deny). The `SecurityAuditLogger` hash-chains
events so tampering is detectable. The API installs a global, ordered guard stack
— **rate limit → JWT authentication → permissions** — with `@Public`,
`@RequirePermissions`, `@RateLimit` and `@CurrentPrincipal`; `/secure` reference
routes exercise it end to end. Session and revocation
stores are in-memory behind interfaces, to be replaced by persistence-backed
implementations in Phase 2; the **identity** store (`@knowget/enterprise-identity`,
P2-D01-M03), the **principal→role** store (`@knowget/membership`, P2-D01-M04) and
the **role→permission** catalogue (`@knowget/roles`, P2-D01-M05) now have
persisted, tenant-scoped implementations behind their ports, making authorization
**data-driven per tenant** (resolved onto the principal, then unioned by the
frozen engine — TD-16 progressively resolved). Bootstrap secrets are required in production
(fail-closed). The full API build is CI-verified (Prisma, TD-12); the security
layer is additionally verified in-sandbox by an isolated type-check and an
in-process `SecurityModule` integration spec.

**Live security hardening (post-P2-D01 certification, ADR-0014).** The persisted
stores are now wirable as the running app's security path behind an env flag,
`SECURITY_STORE=persisted` (default `memory`). Tenant is propagated as a **JWT
claim** — the app re-signs the access token after the frozen engine verifies
credentials — so P1-M04's token issuer and `Session` type stay untouched; the
guard passes the claim to a tenant-scoped `PrincipalResolver`. The persisted path
is an opt-in `@Global` module with an `@Optional` fallback, so the default
(memory) path never imports Prisma and stays in-sandbox testable; an idempotent
seeder provisions the bootstrap administrator on boot. The composition is
port-based and proven end to end in-sandbox (seed → tenant-qualified login →
verify → resolve → authorize) with only the Prisma DI wiring CI-only. See
`docs/reports/P2-D01-SecurityHardening-delivery-report.md`.

**Session & token-revocation persistence (post-P2-D01 certification, ADR-0015 —
closes TD-16).** Sessions and token revocation are now persisted, tenant-scoped
(FORCE RLS on `security_session` / `security_revocation`) **and enforced per
request** in persisted mode. The persisted access token carries a `jti`; the JWT
guard consults an `@Optional` `SessionEnforcer` that validates the session (through
the frozen `SessionManager` — idle/absolute timeout + revoked) and honours
token/family revocation, fail-closed; `POST /secure/logout` revokes the session and
records the token, so both take effect on the next request. The enforcer is absent
in memory mode, so the Phase-1 request path is unchanged. Proven end to end
in-sandbox and on live-PostgreSQL RLS; one session read-and-touch per request is the
sliding-expiry cost (TD-22). With this, **TD-16 is fully resolved**; refresh-token
rotation remains TD-18. See
`docs/reports/P2-D01-SessionRevocationPersistence-delivery-report.md`.

**Refresh-token rotation & replay detection (ADR-0016 — resolves TD-18).** Refresh
tokens are persisted, tenant-scoped (FORCE RLS on `security_refresh_token`),
single-use, and rotate within a **session-bound family**. `POST /secure/refresh`
consumes the presented token and issues a successor plus a fresh access token for
the same (re-validated) session; presenting an already-consumed token is a replay
that revokes the whole family and its session (the access token's `fid` claim then
makes the guard reject every token in the family). Logout revokes session + token +
family. The raw token is never stored (SHA-256 hash only); family revocation reuses
the `RevocationStore`. Persisted-only (memory mode throws) and port-based — the
rotate → replay → revoke loop is proven in-sandbox and on live-PostgreSQL RLS. One
login = one session = one refresh family, collapsed together by logout or replay.
See `docs/reports/P2-D01-RefreshTokenRotation-delivery-report.md`.

**Distributed cache, rate limiter & session read-through (ADR-0017 — resolves
TD-17/TD-22, TD-19 cache dimension).** One backend-agnostic `KeyValueStore` seam —
in-memory by default, Redis when `REDIS_URL` is set — backs three surfaces: an
**async rate limiter** whose atomic fixed-window counter is shared across replicas
(the guard is now async); a **Redis-backed `Cache`** behind the existing
`@knowget/cache` port (wired as the services `CACHE` when `REDIS_URL` is set); and a
**session read-through cache** that lets the enforcer skip the per-request
session-store validate (revocation still checked; logout/replay invalidate; a short
TTL bounds staleness). Env-gated, so the in-memory single-instance default is
unchanged; the ioredis adapter lives at the composition root and is verified live (a
`REDIS_URL`-gated integration test in CI's `redis` service and in sandbox, plus a
cross-instance shared-counter check). See
`docs/reports/P2-D01-DistributedCache-delivery-report.md`.

**Distributed shared services — jobs, notifications, search, files (ADR-0018 —
closes TD-19).** The four remaining shared services now have distributed backends
behind their existing ports, env-gated with in-memory defaults. **Redis** (via
`REDIS_URL`) backs a shared job queue (a sorted set scored by `availableAt`, with
atomic Lua claim so replicas never double-run, retry/backoff and dead-letter) and a
shared in-app inbox. **Postgres** (via `SERVICES_STORE=persisted`) backs full-text
search (a generated `tsvector` + GIN index, `plainto_tsquery`/`ts_rank` ranking,
JSONB `@>` filters) and a `bytea` blob store. The frozen ports' synchronous surfaces
(`SearchIndex`, and the concrete job queue / inbox) are bridged by async app-level
seams (the async-rate-limiter pattern); the Prisma adapters sit behind an opt-in
`PersistedServicesModule` so the default build stays Prisma-free (TD-12). The
Postgres tables are global (the ports are tenant-agnostic; tenant travels as a key
prefix / filterable field). Verified live on Redis (job + inbox integration, shared
across instances) and PostgreSQL (blob round-trip, ranked full-text search with the
GIN index confirmed). With this, **TD-19 is fully resolved**. See
`docs/reports/P2-D01-DistributedServices-delivery-report.md`.

**KMS signing-key custody & token-signer seam (ADR-0019 — resolves TD-11).** The
JWT signing key is no longer forced to live plaintext in the environment. Under
`SECURITY_KEY_CUSTODY=envelope`, a `KmsClient` (`wrap`/`unwrap`; `LocalKmsClient`
uses AES-256-GCM under a KEK) unwraps a wrapped signing key at boot to seed the
`KeyRing`, so every consumer — signer, guard, frozen engine — uses the custodied
material transparently; the `plaintext` default (`SECURITY_JWT_SECRET`) is unchanged.
Token issuance runs through an async `TokenSigner` seam: the active `HmacTokenSigner`
composes the frozen `signJwt`/`verifyJwt` over the `KeyRing`, signing with the current
key and **verifying across retained prior versions** (a rotation overlap window,
resolving the single-current-key limit). An RS256 `AsymmetricTokenSigner` over a
`KmsSigner` port (private key never leaves the device; verify is local via the public
key) is built and tested behind the seam via an in-process RSA software-key double —
a cloud-KMS/HSM adapter is the production drop-in that also moves the KEK root of
trust into hardware. Env-gated, fail-closed, no frozen change; verified in-sandbox
(envelope round-trip, multi-version verify, RS256 sign/verify, and `buildSecurityGraph`
booting in both modes). See `docs/reports/P2-D01-KeyCustody-delivery-report.md`.

**Job-queue visibility timeout & sliding-window rate limiter (ADR-0020).** Two
reliability refinements deferred by ADR-0017/0018, both at the composition root with
no frozen change. The `RedisJobQueue` now claims jobs into an **in-flight set** scored
by a visibility deadline instead of dropping them on claim; a reaper at the top of
`process()` re-queues any in-flight job past its deadline, so a **worker that crashes
mid-run no longer loses the job** (at-least-once recovery). The `KeyValueStore` gains a
clock-aligned `slidingWindow` primitive (two weighted buckets) backing a
`SlidingWindowRateLimiter` that smooths the fixed window's boundary burst; it is
env-selected (`RATE_LIMIT_STRATEGY=sliding`) with the fixed-window default unchanged.
Verified live on Redis (abandoned-job recovery; cross-instance sliding counter). See
`docs/reports/P2-D01-QueueRateLimitHardening-delivery-report.md`.

## Shared services (P1-M05)

Twelve horizontal capabilities every Phase-2 domain consumes rather than
rebuilds: logging (P1-M01), events (+ transactional outbox), cache, jobs &
scheduling, files, search, i18n, notifications, documents, media, and workflow.
Each is a stable port with a working in-memory (or node-stdlib) default;
production/distributed backends slot in behind the same contract. Time-sensitive
services (cache, jobs, scheduler) take an injectable clock and the job/scheduler
run pull-based, so behaviour is deterministic. Every package is Prisma-free and
fully verified in-sandbox; the API `ServicesModule` provides them via DI and
exposes `/services` catalog + self-test routes, validated by an in-process
integration spec.

## Observability & DevOps (P1-M06)

Metrics (counter/gauge/histogram with Prometheus text exposition), distributed
tracing (spans with a correlation-id → trace-id bridge, resolving the
correlation-only limitation), reliability primitives (retry, timeout, circuit
breaker), threshold alerting, and runtime diagnostics — each a backend-agnostic
port with an in-memory default (OTLP/Prometheus-remote/APM exporters slot in
behind the same seams). The API `ObservabilityModule` provides them via DI,
installs a single global interceptor that records a labelled request counter, a
latency histogram and a per-request span, and exposes `/metrics` (Prometheus
scrape) and `/diagnostics` (JSON snapshot). The Prisma client now also targets
`linux-musl-openssl-3.0.x` for Alpine images. Container slimming, backup/recovery
and dashboard visualization remain operations-phase concerns.

## Institutional Governance Platform (P2-D02, Program B · ADR-0021)

The authoritative model for institutional **authority, accountability and governance**,
delivered as one `@knowget/governance` package (a single bounded context, ADR-0021):
six aggregates — **governance body** (rooted on an organization node, nesting into a
hierarchy), **committee** (single chair/secretary, Person members), **policy registry**
(versioned author→approve→publish→retire + acknowledgment + "which policies apply"),
**delegation of authority** (scope + monetary limit, effective window, approval matrix,
`authorizes` check), **resolution** (draft→voting→tally→implement), and **governance
calendar** (meetings/deadlines/reviews with validated attendees). Each aggregate is pure
(immutable + factory + transitions) behind a repository port, with a Prisma/RLS adapter
at the composition root, an application service on the platform event bus, and a
permission-gated (`governance:read`/`:write`), tenant-scoped REST controller; organization
and person existence enter through injected directory ports (no package dependency).

The contract's **reusable workflows** capability is one `WorkflowDefinition` over the
frozen `@knowget/workflow` engine — `draft → in_review → approved | rejected` with a
`request_changes` loop — instantiated for policy, committee, resolution and delegation
approval, guarded for **segregation of duties** (a submitter cannot approve their own
subject) and persisted as a `GovernanceApproval` whose append-only history is the audit
trail. Eight `governance.*` domain events (body/committee created, policy published/retired,
delegation granted/revoked, resolution approved/implemented) publish onto the shared bus.
Eight tables carry **FORCE RLS** tenant isolation (verified on live PostgreSQL); the
policy-acknowledgment table is an intentional immutable append-only ledger. All six service
tokens are exported for **in-process cross-domain use** — future domains consume policy
applicability, the approval matrix, authority checks and the reusable approval workflow
rather than reimplementing them. Non-goals (student governance, academic execution,
financial transactions, HR, procurement) are excluded by design.

## Student Lifecycle Intelligence Platform (P2-D03, Program: Student Lifecycle · ADR-0022)

The authoritative model of a learner's institutional journey, delivered as one
`@knowget/student-lifecycle` package (a single bounded context, ADR-0022): six
aggregates — **Prospect** (the enquiry funnel), **Applicant** (admissions lifecycle with
document checklist, interview and decision), **Student** (the enrolled learner —
`enrolled → active → on_leave → transferred | withdrawn | graduated → alumni`, with a
unique student number and a single active enrollment per institution), **Educational
Journey** (append-only progression), **Intelligence Profile** (AI-ready indicators +
intervention history), and an immutable, append-only **Timeline**. Each aggregate is
pure (immutable + factory + transitions) behind a repository port, with a Prisma/RLS
adapter at the composition root, an application service on the platform event bus, and a
permission-gated (`student:read`/`:write`), tenant-scoped REST controller.

Identity is never duplicated: every learner is a **Person** and the enrolled student's
affiliation a **Membership**, both entering through injected directory ports; the
journey, intelligence and timeline derive their organization from the student. Nine
`student.*` domain events (prospect created; application submitted; applicant approved;
student enrolled / promoted / transferred / withdrawn / graduated / became alumni)
publish onto the shared bus as the foundation for the downstream academic domains. Six
tables carry **FORCE RLS** tenant isolation (verified on live PostgreSQL); the timeline
is an intentional immutable append-only ledger. All six service tokens are exported for
**in-process cross-domain use** — the point of the platform: every academic domain
(attendance, assessment, fees, …) consumes the student model rather than re-creating it.
Non-goals (attendance recording, timetable, examinations, fees, library, transport,
hostel, LMS) are excluded by design; the Intelligence Profile establishes the model and
integration points only, with prediction deferred to the Institutional Intelligence
program.

## Family & Guardian Intelligence Platform (P2-D04, Program: Student Lifecycle · ADR-0023)

The authoritative model of families and guardianship, delivered as one
`@knowget/family-guardian` package (a single bounded context, ADR-0023): seven
aggregates — **Family** (a household unit, deliberately **independent of Student**, with
members, addresses, a primary contact and a merge/split/archive lifecycle), **Guardian**
(a Person-linked legal or designated guardian with a basis of legal authority, an
independent identity-verification track and a pending → active → suspended → archived
lifecycle), **Student–Guardian Relationship** (the many-to-many join between a P2-D03
Student and a Guardian, with independently-managed legal / educational / financial
responsibilities and pickup / medical authorizations, and **custody validation**),
**Consent** (an immutable, versioned, append-only ledger across six consent types,
policy-linked to P2-D02), **Emergency Contact** (a prioritized calling hierarchy per
student), and per-family **Communication** and **Intelligence** profiles. Each aggregate
is pure behind a repository port, with a Prisma/RLS adapter at the composition root, an
application service on the platform event bus, and a permission-gated
(`family:read`/`:write`), tenant-scoped REST controller.

Identity is never duplicated: guardians and members are **Persons**, learners are P2-D03
**Students**, and consents may link to P2-D02 **Policies** — all entering through injected
directory ports. Relationships and consents derive their organization from the guardian;
communication and intelligence profiles from the family. Eight `family.*` domain events
(family registered; guardian registered / assigned / removed; consent granted /
withdrawn; emergency contact updated; pickup authorization changed) publish onto the
shared bus. Seven tables carry **FORCE RLS** tenant isolation (verified on live
PostgreSQL); the consent ledger is an intentional immutable append-only record. All seven
service tokens are exported for **in-process cross-domain use** — every future domain
consumes the family and guardian model rather than maintaining its own parent or guardian
records. Non-goals (fee collection, parent-portal UI, attendance, academic progress,
messaging campaigns, CRM) are excluded by design; the Family Intelligence Profile
establishes the model and integration points only, with prediction deferred to the
Institutional Intelligence program.

## Learner Wellbeing, Safety & Success Platform (P2-D05, Program: Student Lifecycle · ADR-0024)

The authoritative model for a learner's physical, emotional, behavioural, psychological
and social wellbeing, delivered as one `@knowget/learner-wellbeing` package (a single
bounded context, ADR-0024): seven aggregates — **Wellbeing Profile** (the aggregating
read model of the four wellbeing dimensions, learning-support indicators, success metrics
and AI-ready indicators), **Health Record** (medical history, allergies, chronic
conditions, immunizations, medications, standing medical alerts and an emergency plan),
**Behaviour Record** (positive recognition, observations, incidents with restorative
actions, developmental goals and an improvement plan — **development over punishment**),
**Counselling Case** (registration, append-only confidential session history, referrals,
goals and terminal closure — many per learner), **Safeguarding Case** (child-protection
concern, risk classification, an investigation-and-escalation workflow with a **traceable
escalation trail**, external-agency coordination and terminal resolution — many per
learner), **Learner Support Plan** (accommodations, inclusion strategies, personalized
goals and a review schedule) and **Intervention Plan** (early-warning triggers and
assigned interventions with progress monitoring and outcome evaluation). Each aggregate is
pure behind a repository port, with a Prisma/RLS adapter at the composition root, an
application service on the platform event bus, and a permission-gated, tenant-scoped REST
controller.

The defining property is **fine-grained per-area authorization**: rather than one
`wellbeing:*` scope, each sensitive area carries its own read/write pair
(`wellbeing`, `health`, `behaviour`, `counselling`, `safeguarding`, `support`,
`intervention`), so health, counselling and safeguarding are authorized independently —
a grant to one confers no access to another. Every record is about a P2-D03 **Student**
and derives its organization from it through a single `StudentDirectory.organizationOf`
call; staff are P2-D01-M02 **Persons**, validated through a directory port — the pure
package depends on neither domain. Eleven `wellbeing.*` domain events (health record
created; medical alert updated; behaviour observation recorded / incident reported;
counselling case opened / closed; safeguarding case opened / escalated; intervention
assigned / completed; support plan updated) publish onto the shared bus carrying **only
routing and metadata — never confidential content**. Seven tables carry **FORCE RLS**
tenant isolation with fail-closed policies (verified on live PostgreSQL); counselling and
safeguarding histories are append-only and their cases reach terminal, immutable states.
All seven service tokens are exported for **in-process cross-domain use**. Non-goals
(clinical diagnosis, hospital management, grading, attendance, fees, comms campaigns, AI
prediction) are excluded by design; the wellbeing indicators, success metrics and
early-warning triggers establish a structured, privacy-aware surface only, with prediction
deferred to the Institutional Intelligence program.

## Academic Structure & Curriculum Platform (P2-D06, Program: Academic Excellence Platform · ADR-0025)

The authoritative source for an institution's academic organization — what is taught, when,
to whom and under which framework — delivered as one `@knowget/academic-structure` package
(a single bounded context, ADR-0025): eight aggregates — **Academic Calendar** (an
organization's official schedule for one academic year: terms/semesters, holidays,
examination periods, special events, working days, draft → published lifecycle),
**Academic Program** (Pre-Primary…Diploma/vocational/custom), **Curriculum Framework** (a
board-affiliated, **version-controlled** curriculum with learning philosophy, competency
model, assessment philosophy and subject framework, and an append-only revision log —
multiple curricula coexist per organization), **Grade** (a grade level within a program with
hierarchy level, validated promotion target and rule, and age guidelines), **Class** (the
running of a grade for an academic year with an optional curriculum assignment), **Section**
(a teachable division of a class with capacity and a planned → active → closed lifecycle),
**Subject** (a mandatory/elective catalog entry with credits, elective group,
cross-disciplinary flag and prerequisites) and **Learning Outcome** (a Bloom's-aligned
outcome statement mapped to competencies and aligned to a curriculum framework and
assessment methods). Each aggregate is pure behind a repository port, with a Prisma/RLS
adapter at the composition root, an application service on the platform event bus, and a
permission-gated (`academic:read`/`:write`), tenant-scoped REST controller.

Every record is owned by an **Organization** (P2-D01-M01): the top-level aggregates take it
directly (validated through an injected directory port), and the hierarchical ones **derive**
it from their parent — a grade from its program, a class from its grade, a section from its
class, an outcome from its subject — so the academic ladder is validated at every level and
the pure package depends on no other domain. Ten `academic.*` domain events (academic year
created; calendar published; curriculum created/revised; grade/class/section created;
subject registered/updated; learning outcome defined) publish onto the shared bus; academic
programs intentionally emit none. Eight tables carry **FORCE RLS** tenant isolation, verified
on live PostgreSQL; every uniqueness rule is a DB unique index and curricula/subjects/outcomes
are version-controlled. All eight service tokens are exported for **in-process cross-domain
use** — every subsequent academic domain (scheduling, teaching, attendance, assessment)
consumes this platform rather than redefining academic structure. Non-goals (timetable
generation, attendance, lesson planning, teaching, homework, examinations, assessment
scoring, report cards) are excluded by design — this platform is structure, not activity.
This is the first contract of the **Academic Excellence Platform** program.

## Academic Scheduling & Resource Orchestration Platform (P2-D07, Program: Academic Excellence Platform · ADR-0026)

The **Enterprise Academic Scheduling & Resource Orchestration Platform** is the authoritative
scheduling engine — what runs when, where, taught by whom, using which resources — delivered
as one `@knowget/academic-scheduling` package on the certified `v0.2.0` baseline and the
P2-D06 academic structure. It models six aggregates: **Timetable** (version-controlled, per
organization + code, draft → published → archived), **Schedule Slot** (a period: day, HH:MM
range, subject, teacher, section, optional venue), **Resource** (classrooms, labs, libraries,
sports grounds, auditoriums, equipment; capacity, availability windows, lifecycle),
**Allocation** (teacher/room/lab/equipment assignment, capacity-validated, allocated →
released), **Scheduling Policy** (configurable, version-controlled institutional constraints)
and **Substitution** (tracked, auditable teacher/venue overrides). Its defining piece is a
**pure conflict engine**: `detectConflicts` finds teacher/section/venue double-bookings,
resource double-allocations and policy violations over narrow view interfaces the aggregates
structurally satisfy, and `TimetableService.publish` **refuses to publish** any schedule the
engine rejects — checking the timetable's own slots together with every other published
timetable in the same academic year/term, plus active allocations and active policies, so a
teacher, section or venue can never be double-booked across the published grid. Two further
pure engines compute **teacher workload** and **scheduling intelligence** (utilisation,
density, workload distribution, conflict counts, optimisation hints — descriptive analytics
only; optimisation stays with the Institutional Intelligence program). Eight `scheduling.*`
domain events (timetable created/published/revised; slot assigned; resource
allocated/released; conflict detected; substitution assigned) publish onto the shared bus;
resources and policies intentionally emit none. Six tables carry **FORCE RLS** tenant
isolation, verified on live PostgreSQL, with a DB unique index for every uniqueness rule and
JSONB for all structured data. Three policy rule types are enforced from slot timing; three
(`subject_sequencing`, `resource_priority`, `availability_window`) are stored and
version-controlled but deferred behind a stable rule-type dispatch (**TD-27**). All six
service tokens are exported for **in-process cross-domain use** — the attendance, teaching and
assessment domains that follow consume this platform rather than reimplementing scheduling.
Non-goals (attendance recording, lesson delivery, homework, examinations, student grading,
learning analytics) are excluded by design. This is the second contract of the **Academic
Excellence Platform** program.

## Attendance & Presence Intelligence Platform (P2-D08, Program: Academic Excellence Platform · ADR-0027)

The authoritative record of **who was present, when, and how engaged**, delivered as one
`@knowget/attendance-presence` package on the certified `v0.2.0` baseline and the P2-D06/D07
academic structure and scheduling. It models six aggregates: **Attendance Session** (a marking
context — academic period, examination, event, activity, meeting, club — for an organization on
a date, optionally linked to a schedule slot and section/subject, scheduled → open → closed |
cancelled; recording only while open), **Attendance Record** (a participant's status —
present, absent, late, excused, medical leave, official duty, remote, partial — and capture
method; **never mutated**, corrected only by a versioned, reasoned, append-only
`AttendanceCorrection`), **Leave** (a dated request with supporting documents, requested →
approved | rejected | cancelled; approved leave **excuses** absences), **Attendance Policy**
(configurable, version-controlled institutional constraint, draft → active → archived),
**Presence Profile** (the AI-ready read model) and **Participation** (co-curricular
involvement with an engagement level). Its defining pieces are two **pure engines**: a
**policy-evaluation engine** (`summarizeAttendance` excuses approved-leave absences and
computes a weighted attendance percentage; `evaluatePolicies` checks the three percentage
rules against each policy's `minimumPercentage`) and a **presence-intelligence engine**
(`computePresenceIndicators` derives attendance %, punctuality, a **leave-aware** chronic-
absence streak, engagement score, participation diversity and a low/medium/high risk band).
Both engines excuse the same days through one internal `leave-ranges` helper, so the
eligibility percentage and the chronic-absence signal can never diverge — legitimate leave
never manufactures a risk flag. Nine `attendance.*` domain events (session created; recorded;
corrected; leave requested/approved/rejected; policy evaluated; threshold reached;
participation recorded) publish onto the shared bus; the presence profile, a read model, emits
none. Six tables carry **FORCE RLS** tenant isolation, verified on live PostgreSQL, with a DB
unique index for every uniqueness rule, JSONB for structured data (corrections, documents,
parameters, revisions, anomalies) and DOUBLE PRECISION for presence rates. Three policy rule
types are enforced from summarised attendance; three (`late_arrival`, `early_departure`,
`grace_period`) are stored and version-controlled but deferred behind a stable rule-type
dispatch (**TD-28**). Organization, participant (Person), schedule-slot, section and subject
existence enter through injected directory ports; all seven service tokens are exported for
**in-process cross-domain use** — the teaching, examination, fees and intelligence domains that
follow consume this platform rather than reimplementing attendance. Non-goals (grading,
behaviour evaluation, timetable generation, financial penalties, predictive AI, parent
communication) are excluded by design. This is the third contract of the **Academic Excellence
Platform** program.

## Teaching, Learning & Instruction Intelligence Platform (P2-D09, Program: Academic Excellence Platform · ADR-0028)

The **operational heart of classroom excellence** — how instruction is planned, delivered,
monitored and improved — delivered as one `@knowget/teaching-learning` package on the certified
`v0.2.0` baseline and the P2-D06/D07/D08 academic structure, scheduling and attendance. It models
seven aggregates: **Academic Plan** (institutional planning at a level — annual/term/department/
subject — one per organization + code, draft → published → archived), **Unit Plan** (a
subject-scoped sequence of learning experiences with curriculum alignment, outcomes, competencies,
estimated hours and assessment strategy), **Lesson Plan** (objectives, outcomes, strategies,
activities, checkpoints, resources, differentiation and reflection; **version-controlled** with a
draft → in_review → approved review workflow, revised to a new version), **Learning Resource** (a
typed, tagged, curriculum-mapped, **version-controlled** library item reusable across lessons),
**Classroom Session** (the delivery of a scheduled session capturing planned-vs-actual topics,
activities, resources, a descriptive participation summary and reflections — **not attendance**),
**Assignment** (homework/project/practice/reading/collaborative work with a submission window and
per-learner completion tracking — **not grading**) and **Learning Evidence** (a captured record
that learning happened, about a Student and **linked to the instructional activity** that produced
it). Its defining piece is a **pure instructional-intelligence engine**: `computeInstructionalIndicators`
derives curriculum coverage (unit-targeted outcomes covered by approved lessons), lesson
completion, teaching consistency (planned vs actual), student engagement, learning pace, resource
utilisation, submission rate and instructional workload over narrow views the aggregates
structurally satisfy — division-safe, two-decimal, clamped to 0–100, descriptive only. Nine
`teaching.*` domain events (academic plan published; unit plan created; lesson planned/delivered;
learning resource added; classroom session completed; assignment published/submitted; learning
evidence captured) publish onto the shared bus. Seven tables carry **FORCE RLS** tenant isolation,
verified on live PostgreSQL, with a DB unique index for the academic-plan (org, code) rule, JSONB
for all structured data and DOUBLE PRECISION for estimated hours. Organization, subject, section,
curriculum framework (Academic-Structure), schedule slot (Academic-Scheduling) and student
(Student-Lifecycle) existence enter through injected directory ports (single references validated;
array outcome/resource references stored against the validated anchor — **TD-29**); all eight
service tokens are exported for **in-process cross-domain use** — the assessment and intelligence
domains that follow consume this platform rather than reimplementing instruction. Non-goals
(student grading, examination scheduling, mark calculation, report cards, attendance recording,
AI tutoring, predictive analytics) are excluded by design. This is the fourth contract of the
**Academic Excellence Platform** program.

## Assessment & Evaluation Platform (P2-D10, Program: Academic Excellence Platform · ADR-0029)

The **authoritative domain for how learning is assessed, marked, mastered and recorded** —
delivered as one `@knowget/assessment-evaluation` package on the certified `v0.2.0` baseline and
the P2-D06…D09 academic structure, scheduling, attendance and teaching-learning. It models seven
aggregates: **Assessment Framework** (an institution's assessment philosophy — model, weightage
rules, grade bands, competency model, promotion criteria — version-controlled, one per organization

- code, draft → active → archived, `revise` guarded to active only), **Assessment Plan** (an
  annual/term/unit/classroom assessment calendar, draft → published → archived), **Assessment** (an
  individual assessment of a subject across twelve types with outcomes, competencies, maximum marks,
  rubric, strategy and delivery mode; draft → published → in_progress → completed | cancelled),
  **Question Bank** (a reusable, version-controlled repository of questions mapped to Bloom's,
  competencies and outcomes), **Evaluation** (the auditable marking of one student's assessment —
  marks/rubric scores recorded then draft → submitted → moderated → approved with an immutable
  history, reopenable; one per assessment + student), **Competency Profile** (a learner's ordinal
  mastery per competency with an append-only growth trajectory, **tracked independently of raw
  marks**; one per student) and **Academic Record** (a learner's per-term grade entries, GPA, credits
  and promotion decision — **immutable after publication**, changed only through a reasoned,
  versioned, append-only amendment workflow; one per student + year + term). Its defining pieces are
  **two pure engines**: a **grading engine** (`computePercentage`/`gradeFor`/`gradeMarks`/`computeGpa`)
  that every grade and GPA in the system flows through — so a report card's GPA, a transcript's
  cumulative GPA and the analytics' average performance agree by construction — and an
  **assessment-intelligence engine** (`computeAssessmentIndicators`) deriving throughput, approval
  rate, average performance, variance-based consistency, competency mastery (read from mastery
  levels, never marks), learning gaps and curriculum coverage over narrow views the aggregates
  structurally satisfy, division-safe, two-decimal, clamped to 0–100, descriptive only. Nine
  `assessment.*` domain events (assessment published/started/completed; evaluation
  submitted/approved; competency updated; academic record updated; promotion recommended when
  non-pending; report card generated) publish onto the shared bus. Seven tables carry **FORCE RLS**
  tenant isolation, verified on live PostgreSQL, with tenant-scoped DB unique indexes for
  framework/bank (org, code), evaluation (assessment, student), competency profile (student) and
  academic record (student, year, term), JSONB for all structured data and DOUBLE PRECISION for
  marks, percentage and GPA. Organization (P2-D01-M01), subject (Academic-Structure) and student
  (Student-Lifecycle) existence enter through injected directory ports (single references validated;
  array outcome/competency references stored against the validated anchor — **TD-30**); all nine
  service tokens are exported for **in-process cross-domain use** — the intelligence program that
  follows consumes this platform rather than reimplementing assessment. Non-goals (instruction
  delivery, attendance, timetabling, AI tutoring, predictive analytics) are excluded by design. This
  is the fifth contract of the **Academic Excellence Platform** program.

## Learning Intelligence & Educational Insights Platform (P2-D11, Program: Academic Excellence Platform · ADR-0030)

The **capstone academic domain** — where the learner and academic domains come together — delivered
as one `@knowget/learning-intelligence` package on the certified `v0.2.0` baseline and the P2-D03…D10
learner and academic domains. It **synthesizes** the descriptive indicators those domains already
expose (student-lifecycle, wellbeing, attendance/presence, teaching-learning, assessment) into
unified learner intelligence and explainable educational insights. It models seven aggregates:
**Learning Signal** (an immutable, evidence-bearing descriptive signal about a learner distilled from
an upstream indicator; the learner's append-only feed), **Learner Insight Profile** (the unified
per-learner learning-health picture, one per student, **refreshed** by the synthesis engine over the
learner's signals), **Early Warning** (a rule-based, explainable risk flag naming the fired rule and
tripping score; raised → acknowledged → resolved | dismissed, duplicate open warnings suppressed),
**Educational Insight** (a generated explainable finding — strength/gap/trend/risk/opportunity — with
a narrative and evidence; proposed → published → archived), **Recommendation** (an evidence-grounded,
**human-in-the-loop** suggestion — the platform proposes, a human accepts/rejects, then it is
actioned), **Growth Plan** (accepted recommendations turned into measurable goals with audited
outcomes and derived progress; draft → active → achieved | abandoned) and **Cohort Insight** (a
leadership rollup over an organization/grade/section, one per scope). Its defining pieces are **three
pure engines**: `synthesizeLearnerInsight` (per-dimension mean of 0–100 health readings → bands →
equal-weight overall), `evaluateEarlyWarnings` (transparent threshold rules; absence of data never
fires) and `summarizeCohort` (average, band distribution and learners-needing-attention over the
members' profiles) — division-safe, two-decimal, clamped 0–100. It is **descriptive and explainable
only**: every conclusion carries an evidence chain, and **ML prediction/forecasting is an explicit
non-goal deferred to the intelligence core (P2-D28)**; it consumes the upstream domains rather than
recomputing them. Nine `insight.*` domain events (signal captured; profile refreshed; early warning
raised/resolved; insight published; recommendation proposed/accepted; growth plan
activated/achieved) publish onto the shared bus. Seven tables carry **FORCE RLS** tenant isolation,
verified on live PostgreSQL, with tenant-scoped DB unique indexes for the profile (student) and
cohort insight (scope type, scope id), JSONB for evidence/histories/scores and DOUBLE PRECISION for
scores and percentages. Organization (P2-D01-M01) and student (P2-D03) existence enter through
injected directory ports (upstream evidence referenced, not re-verified — **TD-31**); all seven
service tokens are exported for **in-process cross-domain use**. This is the sixth contract of the
**Academic Excellence Platform** program and **completes Program B — the learner & academic core
(P2-D02…D11)**; the descriptive, explainable intelligence base the Phase-2 intelligence core
(D25…D30) builds on.

## Workforce & Human Capital Platform (P2-D12, Program: Workforce & Operations · ADR-0031)

The **staff system of record** — the HR analog of Student Lifecycle (P2-D03) — delivered as one
`@knowget/workforce` package on the certified `v0.2.0` baseline and the P2-D02…D11 identity, learner
and academic domains. It opens **Program C**, the operational institution beyond the learner core. It
models eight aggregates: **Department** (the HR org unit — hierarchical with a head and cost centre;
active → archived, with cycle-safe reparenting), **Position** (a defined, budgeted post under a
department — title, employment type, headcount and the pay **grade/band label only**; draft → open →
on_hold → closed), **Employee** (the Person-linked staff record — identity is never duplicated —
carrying an employee number and department/position, with the lifecycle onboarding → active,
reversible on_leave / suspended / notice_period, then a terminal separation resigned / terminated /
retired → alumni; at most one active employment per institution, unique employee number),
**EmploymentContract** (a version-controlled contract — one immutable version per relationship, a new
version expiring and superseding the prior active one so at most one is active; carries the pay
grade/band label only; draft → active → expired | terminated), **LeaveEntitlement** (the policy grant
of days per leave type per period), **LeaveRequest** (a leave application — requested → approved |
rejected | cancelled, only approved drawing down the balance), **PerformanceReview** (an appraisal
with a validated 1–5 rating; draft → submitted → acknowledged → finalized, only finalized counting
toward standing) and **WorkforceProfile** (the descriptive, AI-ready indicator snapshot per employee,
one per employee, **refreshed** by the intelligence engine). Its defining pieces are **two pure
engines**: `computeLeaveLedger` (reconciles entitlements against requests into a per-type ledger —
entitled/taken/pending/remaining, totals and a division-safe utilization rate; only approved leave
draws down) and `computeWorkforceIndicators` / `summarizeWorkforce` (tenure, leave utilization and
finalized-review standing → a transparent, worst-of-named-factors attrition-risk band, and the
leadership rollup). Two boundaries define it: **compensation is out of scope** — a contract/position
carries only a grade/band label, never an amount (money lives in the Financial platform, **P2-D14**),
enforced structurally and in tests; and it is **descriptive, not predictive** — the attrition-risk
band names its factors and **prediction is an explicit non-goal deferred to the intelligence core
(P2-D28)**. Coaching and professional development are the next contract (**Faculty Excellence,
P2-D13**) and excluded here. Workforce domain events (department created/archived; position
created/opened/closed; employee onboarded/activated/separated/became_alumni; contract
issued/activated/ended; leave requested/approved/rejected/cancelled; review submitted/finalized;
profile refreshed) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation,
verified on live PostgreSQL, with tenant-scoped DB unique indexes (department/position code, employee
number, one contract per (employee, version), one entitlement per (employee, leave type, period), one
profile per employee), DOUBLE PRECISION for day counts/rates/ratings and INTEGER for
tenure/headcount/version. Organization (P2-D01-M01) and Person (P2-D01-M02) existence enter through
injected directory ports — an employee is a Person, never a duplicate identity — with soft
head/reviewer references stored against the validated anchor (**TD-32**); all seven service tokens
are exported for **in-process cross-domain use**. This is the first contract of **Program C** — the
operational staff system of record the workforce-intelligence, faculty-excellence and financial
domains build on.

## Faculty Excellence, Coaching & Professional Growth Platform (P2-D13, Program: Workforce & Operations · ADR-0032)

The **professional-growth system of record for staff** — built on the workforce base (P2-D12), the
coaching and professional development that workforce explicitly deferred — delivered as one
`@knowget/faculty-excellence` package on the certified `v0.2.0` baseline. The second contract of
**Program C**. It models eight aggregates: **CompetencyFramework** (the institution's practice rubric
— a named set of competency standards; draft → active → archived, competencies frozen once active),
**Observation** (a classroom/practice observation scored against the framework — per-competency 1–4
ratings with evidence, an overall mean rating and strengths/growth notes; scheduled → conducted →
shared → acknowledged, only **acknowledged** counting toward growth standing), **CoachingEngagement**
(a coach↔coachee cycle; proposed → active → completed | cancelled, at most one active per coachee),
**CoachingSession** (a logged session within an active engagement), **DevelopmentRequirement** (the
CPD mandate: required hours per category per period), **ProfessionalLearningActivity** (a piece of CPD
with hours; planned → enrolled → completed | cancelled, only **completed** earning hours),
**DevelopmentGoal** (a growth objective; draft → active → achieved | abandoned, recording a reasoned
outcome) and **FacultyProfile** (the descriptive, AI-ready indicator snapshot per employee, one per
employee, **refreshed** by the growth engine). Its defining pieces are **two pure engines**:
`computeDevelopmentLedger` (reconciles requirements against completed activities into a per-category
compliance ledger — required/completed/remaining and a rate that credits completion only **up to each
requirement**, so a surplus never masks a deficit; division-safe, clamped 0–100) and
`computeFacultyGrowth` / `summarizeFaculty` (acknowledged-observation practice standing, goal progress
and PD compliance → a transparent growth band `emerging < developing < proficient < distinguished`,
and the leadership rollup). It is **descriptive and explainable only**: the growth band is the
transparent mapping of observed-practice ratings onto the scale, and **prediction is an explicit
non-goal deferred to the intelligence core (P2-D28)**. A staff member is an **Employee (P2-D12)**,
referenced via an Employee directory (existence + organization), never duplicated; observations
validate their rating keys against the framework's competencies. Faculty domain events (framework
created/activated/archived; observation conducted/shared/acknowledged; coaching proposed/accepted/
completed and session logged; PD planned/completed; goal activated/achieved; profile refreshed)
publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation, verified on live
PostgreSQL, with tenant-scoped DB unique indexes (framework code, one requirement per (employee,
category, period), one profile per employee), JSONB for a framework's competencies and an
observation's ratings, and DOUBLE PRECISION for hours/rates/ratings. Organization (P2-D01-M01) and
Employee (P2-D12) existence enter through injected directory ports (soft framework/engagement/
competency references stored against the validated anchor — **TD-33**); all seven service tokens are
exported for **in-process cross-domain use**. The professional-growth base the workforce-intelligence
and Phase-2 intelligence-core (D25…D30) domains build on.

## Fees, Finance & Payroll Platform (P2-D14, Program: Workforce & Operations · ADR-0033)

The **money system of record for the institution** — built on the student (P2-D03) and workforce
(P2-D12) bases, owning the compensation boundary those domains deferred — delivered as one
`@knowget/financial` package on the certified `v0.2.0` baseline. The third contract of **Program C**.
Its defining decision is that **money is integer minor units plus an ISO-4217 currency, never a
float**: `money()` validates the amount is an integer and the currency well-formed, arithmetic is
exact, rounding is explicit half-away-from-zero, and `allocateMoney` splits an amount across weights so
the parts **sum exactly to the whole** (largest-remainder). The money core and the pure
`computeAccountStatement` / `summarizeReceivables` engines were built and tested first. It models eight
aggregates: **FinancialPeriod** (an accounting window; open → closed, reopenable), **FeeStructure** (a
reusable fee schedule of components in one currency; draft → active → archived, components frozen once
active), **Invoice** (a bill to a student; draft → issued → partially_paid | paid | overdue |
cancelled, lines frozen at issue, `amountPaidMinor` recomputed **together with status** by pure
apply/reverse, overpayment and below-zero reversal rejected, cancel blocked once paid), **Payment** (a
tender; pending → cleared | failed, cleared → refunded, **inheriting org/student/currency from the
invoice**, applied to the invoice **before** the payment is persisted so a rejected application leaves
it untouched), **Concession** (a percentage or fixed scholarship/discount; requested → approved →
revoked | rejected, pure `concessionAmount` capping a fixed discount at the base), **PayrollRun** (a
compensation batch in one currency; draft → processed → paid | cancelled), **Payslip** (an employee's
compensation; draft → approved → paid, one per (run, employee), **net = gross − deductions** pure, its
earnings seeded from the employee's active-contract **grade/band label** resolved through the
institution's pay scale — the crossing where the label workforce stores becomes real money) and
**StudentFinancialAccount** (the descriptive receivables read model per student, **refreshed** from the
account-statement engine, never posted to directly). It is **descriptive, not predictive**: the account
is derived, with cash-flow forecasting deferred to the intelligence core (P2-D28). A payer is a
**Student (P2-D03)** and a payee is an **Employee (P2-D12)**, referenced via directory ports and never
duplicated. Finance domain events (period opened/closed/reopened; fee structure created/activated/
archived; invoice issued/paid/overdue/cancelled; payment recorded/cleared/failed/refunded; concession
requested/approved/rejected/revoked; payroll run processed/paid/cancelled; payslip approved/paid;
account refreshed) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation,
verified on live PostgreSQL (BIGINT money round-tripping exactly), with tenant-scoped DB unique indexes
(period code, fee-structure code, invoice number, one payslip per (run, employee), one account per
student); scalar money is **BIGINT** minor units (adapter `Number()`/`BigInt()` bridge) and
component/line/earning lists are non-null JSONB. **Two permission scope pairs** split the platform along
its confidentiality boundary — `finance:*` for the student-facing money (periods, fee structures,
invoices, payments, concessions, accounts) and `payroll:*` for staff compensation (runs, payslips) — so
salary data never shares a scope with fee data. Organization (P2-D01-M01), Student (P2-D03) and
Employee-compensation (P2-D12) existence enter through injected directory ports; the pay scale is
composition-root configuration (cross-repository payment atomicity — **TD-34**). All eight service
tokens are exported for **in-process cross-domain use**. The money base the operational and
intelligence-core domains build on.

## Procurement, Inventory & Assets Platform (P2-D15, Program: Workforce & Operations · ADR-0034)

The **resource system of record for the institution** — the operational counterpart to the money
system of record (P2-D14) — built on the organization (P2-D01-M01) and workforce (P2-D12) bases,
delivered as one `@knowget/resource` package on the certified `v0.2.0` baseline. The fourth contract of
**Program C**. Two quantities are **derived, not stored**, so the design begins with **two pure engines**
built and tested first: `computeStockPosition` / `summarizeStock` reconciles an item's append-only
movement ledger into on-hand + a **below-reorder** flag (`onHand <= reorderLevel`) and rolls positions
up, and `computeDepreciation` computes **straight-line net book value** — monotonic, never below
salvage, never above cost, landing **exactly on salvage at end of life**, and **clock-free** (the caller
passes the as-of date). Money is **integer minor units + ISO-4217 currency, never a float**, in a
**self-contained module that does not import `@knowget/financial`** — the domain architecture (ADR-0010)
forbids one domain package depending on another, so the small stable money core is duplicated rather
than coupling two bounded contexts (a shared `@knowget/money` package is **TD-35**). It models eight
aggregates: **Supplier** (the vendor master; active ↔ suspended → blacklisted, code unique per tenant,
active required to issue an order), **InventoryItem** (a stockable good with a unit of measure, reorder
level and **optional standard cost** valuing stock; active ↔ discontinued, sku unique per tenant),
**StockMovement** (an **append-only** ledger entry — receipt / issue / signed adjustment, never edited,
corrected only by further adjustment), **PurchaseRequisition** (an internal request; draft → submitted →
approved | rejected, lines frozen at submit), **PurchaseOrder** (an order to a supplier; draft → issued →
partially_received | received → closed | cancelled, lines frozen at issue, issuing requires an active
supplier, **over-receipt rejected**, and **receiving an item-linked line posts a stock receipt _before_
the order is persisted** so the ledger and order never disagree; a partially-received order must be
closed, not cancelled), **Asset** (a fixed asset with acquisition/salvage/life validated (salvage ≤
cost, life > 0); in_service ↔ under_maintenance → retired → disposed, tag unique per tenant, net book
value via the pure engine), **AssetMaintenance** (a log against an asset; scheduled → completed |
cancelled, completion recording the performed date and actual cost, **every terminal transition emits an
event**) and **InventoryPosition** (the descriptive stock read model per item, **refreshed** from the
stock-balance engine and valued at standard cost, never posted to directly). It is **descriptive, not
predictive**: on-hand and net book value are derived, with demand forecasting / reorder optimisation /
replacement planning deferred to the intelligence core (P2-D28). A vendor's organization is an
**Organization (P2-D01-M01)** and a requester/custodian is an **Employee (P2-D12)**, referenced via
directory ports and never duplicated. Resource domain events (supplier registered/suspended/reinstated/
blacklisted; item created/discontinued/reactivated; stock movement recorded; requisition submitted/
approved/rejected; purchase order issued/received/closed/cancelled; asset registered/retired/disposed;
maintenance scheduled/completed/cancelled; position refreshed) publish onto the shared bus. Eight tables
carry **FORCE RLS** tenant isolation, verified on live PostgreSQL (BIGINT money round-tripping exactly
for values beyond int4 range), with tenant-scoped DB unique indexes (supplier code, item sku, order
number, asset tag, one position per item); scalar money is **BIGINT** minor units (adapter
`Number()`/`BigInt()` bridge, null-guarded for the nullable item cost / maintenance cost / stock value)
and requisition & order lines are non-null JSONB. **Two permission scope pairs** split the platform
along its operational boundary — `procurement:*` for the buy-and-hold flow (suppliers, items, stock
ledger, requisitions, orders, positions) and `asset:*` for the fixed-asset register and its maintenance.
Organization (P2-D01-M01) and Employee (P2-D12) existence enter through injected directory ports. All
eight service tokens are exported for **in-process cross-domain use**. The resource base the operational
and intelligence-core domains build on.

## Smart Mobility, Transport & Fleet Platform (P2-D16, Program: Workforce & Operations · ADR-0035)

The **transport system of record for the institution** — the operational counterpart to the Asset
register (P2-D15), which owns a vehicle as depreciating capital while this domain owns it as an
operating unit — built on the organization (P2-D01-M01), workforce (P2-D12) and student (P2-D03) bases,
delivered as one `@knowget/transport` package on the certified `v0.2.0` baseline. The fifth contract of
**Program C**. Two quantities are **derived, not stored**, so the design begins with **two pure engines**
built and tested first: `computeRouteSchedule` turns a departure time and ordered stop offsets into
per-stop arrival ETAs (validating consecutive sequences and strictly-increasing offsets) and
`computeSeatUtilization` / `summarizeFleetUtilization` value capacity against subscribers; and
`computeTripOccupancy` reconciles a boarding/alighting ledger into running-end and **peak** occupancy,
flagging capacity-exceeded at the peak. Distinctively, **this domain carries no money** — transport fees
belong to Finance (P2-D14) and vehicle valuation/maintenance to the Asset register (P2-D15) — so the
fee/valuation boundary is held structurally (there is nowhere to put an amount) and no money core is
imported. It models eight aggregates: **Vehicle** (a fleet unit with a seating capacity that bounds trip
occupancy; active ↔ under_maintenance → retired, registration unique per tenant, active required to
assign), **Driver** (a validated **Employee** with a licence number/class/expiry; active ↔ suspended →
deactivated, licence + employee unique per tenant, org derived from the employee), **Route** (an ordered
set of named stops served from a scheduled departure in one direction; draft → active → suspended →
retired, **stops frozen once active**, code unique per tenant, the schedule engine validating offsets
strictly increase), **VehicleAssignment** (binds an active vehicle + a licensed active driver to an
active route with the licence valid on the effective date; active → ended, **one active per route**),
**TransportSubscription** (a student's enrollment with pickup/drop stops validated on the route;
requested → active → suspended → ended, **one open per student+route**), **Trip** (a run with a captured
seating capacity and an append-only boarding ledger; scheduled → in_progress → completed | cancelled,
**a board over capacity rejected** via the occupancy engine and an alight of a not-onboard student
rejected), **VehicleDocument** (a compliance record — insurance/fitness/permit/pollution/road_tax — one
per type per vehicle, its valid/expiring/expired status **derived** from the expiry date, never stored)
and **RouteUtilizationProfile** (the descriptive seat-usage read model per route, **refreshed** from the
seat-utilization engine, never posted to directly). It is **descriptive, not predictive**: route
optimisation, demand forecasting and predictive maintenance are deferred to the intelligence core
(P2-D28). A vehicle's organization is an **Organization (P2-D01-M01)**, a driver is an **Employee
(P2-D12)** and a subscriber is a **Student (P2-D03)**, referenced via directory ports and never
duplicated. Transport domain events (vehicle registered/maintenance/retired; driver registered/
suspended/reinstated/deactivated; route activated/suspended/resumed/retired; assignment created/ended;
subscription requested/activated/suspended/resumed/ended; trip scheduled/started/completed/cancelled;
document recorded/renewed; utilization refreshed) publish onto the shared bus. Eight tables carry
**FORCE RLS** tenant isolation, verified on live PostgreSQL (JSONB stops/events, INTEGER capacity and
BOOLEAN flags round-tripping exactly), with tenant-scoped DB unique indexes (registration, licence,
employee, route code, one document per (vehicle, type), one profile per route); capacities/offsets/
percents/versions are **INTEGER**, over-capacity/has-active-assignment are **BOOLEAN**, route stops and
trip events are non-null **JSONB**, and date/ISO stamps are **TEXT** — **no money**. **Two permission
scope pairs** split the platform along its operational boundary — `fleet:*` for the fleet and its people
and compliance (vehicles, drivers, documents) and `transport:*` for the operations (routes, assignments,
subscriptions, trips, utilization). Organization, Employee and Student existence enter through injected
directory ports. Two status-scoped uniqueness invariants (one active assignment per route, one open
subscription per student+route) are service-enforced (**TD-36**); both independent audits were clean.
All eight service tokens are exported for **in-process cross-domain use**. The transport base the
operational and intelligence-core domains build on.

## Residential Life, Hostel & Boarding Platform (P2-D17, Program: Workforce & Operations · ADR-0036)

The **boarding system of record for the institution** — the residential counterpart to the transport
system (P2-D16), managing where boarders live rather than how they travel — built on the organization
(P2-D01-M01), workforce (P2-D12) and student (P2-D03) bases, delivered as one `@knowget/residential`
package on the certified `v0.2.0` baseline. The **sixth contract of Program C**. Two quantities are
**derived, not stored**, so the design begins with **two pure engines** built and tested first:
`computeRoomOccupancy` / `computeHostelOccupancy` / `summarizeResidenceOccupancy` value a room's active
occupants against its beds and roll room → hostel → institution (beds available, occupancy percent,
over-capacity); and `computeRollCall` reconciles a curfew roll call's per-resident presence markings
(present/late/on_leave/absent) against the expected roster into counts and the **safety-critical
unaccounted-for number** — the residential analog of the trip-occupancy ledger. Distinctively, **this
domain carries no money** — hostel/mess fees belong to Finance (P2-D14) and facility valuation/
maintenance to the Asset register (P2-D15) — so the boundary is held structurally and no money core is
imported. It models eight aggregates: **Hostel** (a residential building for boys/girls/mixed with an
optional supervising warden; active ↔ under_maintenance → decommissioned, code unique per tenant, active
required to take rooms/allocations), **Warden** (a validated **Employee**, one per employee, org derived
from the employee; active ↔ suspended → relieved), **Room** (an ordered set of individually-allocatable
bed line-objects on a floor; draft → available → decommissioned, **beds & floor frozen once available**,
number unique per hostel, the bed count is its capacity), **BedAllocation** (a student's residency in a
specific bed; active → ended, **one active per bed and one active per student**), **Outpass** (a
resident's gate pass; requested → approved → checked_out → returned | rejected | cancelled, a validated
out/return window, **overdue derived** clock-free from the expected return, **one open per resident**),
**RollCall** (a curfew presence check capturing the roster from active allocations and accumulating one
marking per resident, rejecting off-roster and duplicate marks; scheduled → in_progress → completed |
cancelled, the summary derived by the engine), **HostelInspection** (a statutory compliance record —
fire_safety/hygiene/electrical/structural/security — one per type per hostel, re-inspected in place, its
valid/due_soon/overdue status **derived** from the next-due date, never stored) and
**HostelOccupancyProfile** (the descriptive bed-usage read model per hostel, **refreshed** from the
occupancy engine over in-service rooms, never posted to directly). It is **descriptive, not predictive**
(P2-D28). A hostel's organization is an **Organization (P2-D01-M01)**, a warden is an **Employee
(P2-D12)** and a resident is a **Student (P2-D03)**, referenced via directory ports and never
duplicated. Residential domain events (hostel registered/warden-assigned/warden-unassigned/maintenance/
decommissioned; warden registered/suspended/reinstated/relieved; room drafted/made-available/maintenance/
decommissioned; allocation created/ended; outpass requested/approved/rejected/checked-out/returned/
cancelled; roll-call scheduled/started/completed/cancelled; inspection recorded/reinspected; occupancy
refreshed) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation, verified on
live PostgreSQL (JSONB room beds / roll-call roster & markings, INTEGER bed counts and BOOLEAN
over-capacity round-tripping exactly), with tenant-scoped DB unique indexes (hostel code, one warden per
employee, room number per hostel, one inspection per (hostel, type), one profile per hostel); bed counts/
occupancy/percents/versions are **INTEGER**, over-capacity is **BOOLEAN**, room beds and roll-call
roster/markings are non-null **JSONB**, and date/ISO stamps are **TEXT** — **no money**. **Two permission
scope pairs** split the platform along its operational boundary — `hostel:*` for the physical plant and
its people and compliance (hostels, wardens, rooms, inspections) and `boarding:*` for the operations
(allocations, outpasses, roll calls, occupancy). Organization, Employee and Student existence enter
through injected directory ports. Two status-scoped uniqueness invariants (one active allocation per bed,
one active per student) are service-enforced (**TD-37**); both independent audits were clean. All eight
service tokens are exported for **in-process cross-domain use**. The residential base the operational and
intelligence-core domains build on.

## Knowledge Resource, Library & Digital Learning Asset Platform (P2-D18, Program: Workforce & Operations · ADR-0037)

The **library system of record for the institution** — the catalog it holds, the physical copies on its
shelves, the digital assets it licenses, the members entitled to borrow, and the loans, reservations and
policy that circulate the collection — built on the organization (P2-D01-M01) and person (P2-D01-M02)
bases, delivered as one `@knowget/library` package on the certified `v0.2.0` baseline. The **seventh
contract of Program C**. Two quantities are **derived, not stored**, so the design begins with **two pure
engines** built and tested first: `computeTitleAvailability` / `computeCollectionUtilization` value a
title's loanable copies against those on loan or lost (available, and **reservable** when no copy is free
but a loanable one exists) and roll the title views into the collection's on-loan-vs-loanable utilization;
and `computeLoanStatus` derives a loan's due date (`issue + period × (1 + renewals used)`), whether and by
how many **days** it is overdue, and whether it can still be renewed — **never money**. Distinctively, as
with residential, **this domain carries no money** — overdue and lost-item fines belong to Finance
(P2-D14) and acquisition spend and asset valuation to Procurement & Assets (P2-D15) — so the boundary is
held structurally and no money core is imported. It models eight aggregates: **Title** (a catalogued work
— book/journal/magazine/reference/media/thesis — with an optional ISBN unique per tenant, author and
subject lists; active ↔ withdrawn), **Copy** (a physical holding tracked by a barcode unique per tenant,
org derived from the title; available ↔ on_loan → lost | withdrawn, lost-while-on-loan only through the
loan), **DigitalAsset** (a licensed digital resource — ebook/audiobook/video/e-journal/courseware/dataset,
open/licensed/subscription — that does not circulate; active ↔ retired), **LibraryMember** (a validated
**Person** linked to an org with a membership number unique per tenant, **one per person per org**; active
↔ suspended → expired), **Loan** (a copy issued to a member with its **terms captured at issue** from the
org policy; active → returned | lost, **one active per copy**, the borrowing limit enforced, the copy
flipped in lock-step, due/overdue derived), **Reservation** (a member's hold on a title with a queue
position one past the highest open hold; requested → ready → fulfilled | cancelled | expired, **one open
per member+title**), **CirculationPolicy** (the version-controlled lending rules — a default rule + per-
category rules; draft → active → archived, **rules frozen once active**, **one active per org**, the
single source of a member category's terms via `resolveTermsForMember`) and **CollectionProfile** (the
descriptive catalog/holdings/circulation read model per org, **refreshed** from both engines, never posted
to directly). It is **descriptive, not predictive** (P2-D28). A title's organization is an **Organization
(P2-D01-M01)** and a member is a **Person (P2-D01-M02)**, referenced via directory ports and never
duplicated; loan issue is composed at the API layer (read the member → resolve terms from the org active
policy → issue with them captured). Library domain events (title cataloged/renamed/authors/subjects/
metadata/withdrawn/restored; copy accessioned/located/condition/lost/withdrawn/issued/returned; digital
cataloged/renamed/access/licence-renewed/retired/reactivated; member registered/category/expiry/suspended/
reinstated/expired; loan issued/renewed/returned/lost; reservation placed/ready/fulfilled/cancelled/
expired; policy drafted/rules/default/activated/archived; collection refreshed) publish onto the shared
bus. Eight tables carry **FORCE RLS** tenant isolation, verified on live PostgreSQL (JSONB authors/subjects
and policy rules, INTEGER counts/periods and the nullable-ISBN unique round-tripping exactly), with
tenant-scoped DB unique indexes (ISBN, barcode, membership number, membership per (person, org), profile
per org); loan periods/limits/queue positions/counts/percents/versions are **INTEGER**, authors/subjects
and policy rules/default-rule are **JSONB**, and date/ISO stamps and licence expiry are **TEXT** — **no
money**. **Two permission scope pairs** split the platform along its operational boundary — `library:*`
for the knowledge collection (titles, copies, digital assets, the collection profile) and `circulation:*`
for the lending relationship (members, loans, reservations, the circulation policy). Organization and
Person existence enter through injected directory ports. Three status-scoped uniqueness invariants (one
active loan per copy, one open reservation per member+title, one active policy per org) are
service-enforced (**TD-38**); both independent audits were clean. All eight service tokens are exported for
**in-process cross-domain use**. The library base the operational and intelligence-core domains build on.

## Integrated Health Centre & Clinical Services Platform (P2-D19, Program: Campus & Engagement · ADR-0038)

The **operational clinical system of record for the institution** — the health centres it runs and the
clinicians who staff them, the patient appointments, the clinical encounters, the medication prescriptions,
the sick-bay admissions and the external referrals — built on the organization (P2-D01-M01), person
(P2-D01-M02) and workforce (P2-D12) bases, delivered as one `@knowget/health-centre` package on the
certified `v0.2.0` baseline. The **first contract of Program D (Campus & Engagement)**. Two quantities are
**derived, not stored**, so the design begins with **two pure engines** built and tested first:
`computeBayOccupancy` / `summarizeClinicalOccupancy` value a centre's active admissions against its
sick-bay capacity and roll centre → institution (beds available, occupancy percent, over-capacity); and
`computeMedicationSchedule` derives a prescription's total/remaining/due/**overdue** doses as of a date
from its start date, doses-per-day, duration and doses administered (**days, never money**). Distinctively,
**this domain carries no money** (clinical services are not billed here — Finance P2-D14; medical-supply
cost is Procurement & Assets' — P2-D15) and **every domain event is content-free** (ids, status, coded
metadata and counts — never a chief complaint, assessment, disposition, medication, dosage or referral/
admission reason), the confidentiality discipline Learner Wellbeing (P2-D05) applies to counselling and
safeguarding. It models eight aggregates: **HealthCentre** (an infirmary/clinic/dental/counselling/wellness
facility with a sick-bay capacity and optional lead clinician; active ↔ under_maintenance →
decommissioned, code unique per tenant, active required for clinical ops), **Clinician** (a validated
**Employee** with a clinical role + optional registration; active ↔ suspended → relieved, one per
employee, org from the employee), **Appointment** (pure scheduling; requested → scheduled → checked_in →
completed | cancelled | no_show, reschedule changes only the time), **ClinicalEncounter** (the
consultation; draft → in_progress → completed | cancelled, a clinician required before start, chief
complaint + assessment held **off events**), **Prescription** (a medication course feeding the schedule
engine; active → completed | discontinued, doses tallied never past the total, medication + dosage held
**off events**), **SickBayAdmission** (a patient in a bed feeding the occupancy engine; active →
discharged, **one active per bed and one active per patient**, never beyond capacity), **Referral** (onward
external coordination; raised → accepted → completed | cancelled) and **CentreProfile** (the descriptive
sick-bay-occupancy + clinical-workload read model per centre, **refreshed** from both engines, never posted
to directly). It is **descriptive, not predictive** (P2-D28). The **standing health record** (history,
allergies, chronic conditions, immunization history, standing medications, medical alerts) belongs to
**Learner Wellbeing (P2-D05)**; this domain holds the operational clinical services. A centre's org is an
**Organization**, a patient a **Person**, a clinician an **Employee**, referenced via directory ports and
never duplicated. Content-free clinical events publish onto the shared bus. Eight tables carry **FORCE RLS**
tenant isolation, verified on live PostgreSQL (INTEGER capacities/counts/doses, BOOLEAN over-capacity and
TEXT date stamps round-tripping exactly — **no JSONB**, this domain has no list-valued fields), with
tenant-scoped DB unique indexes (centre code, one clinician per employee, one profile per centre). **Two
permission scope pairs** split the platform along its operational boundary — `clinic:*` for the clinical
estate and its people and oversight (centres, clinicians, the centre profile) and `clinical:*` for the
patient-facing operations (appointments, encounters, prescriptions, admissions, referrals). Organization,
Person and Employee existence enter through injected directory ports. Two status-scoped uniqueness
invariants (one active admission per bed, one active per patient) are service-enforced (**TD-39**); both
independent audits were clean. All eight service tokens are exported for **in-process cross-domain use**.
The operational clinical base the campus and intelligence-core domains build on.

## Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20, Program: Campus & Engagement · ADR-0039)

The **built-environment system of record for the institution** — the buildings on the campus and the spaces
within them, the fixed infrastructure systems that serve them, the smart sensors and the environment
readings they capture, the operational maintenance work, the comfort policy that judges a space's
environment, and the descriptive per-building condition profile — built on the organization (P2-D01-M01) and
workforce (P2-D12) bases, delivered as one `@knowget/facilities` package on the certified `v0.2.0` baseline.
The **second contract of Program D (Campus & Engagement)**. Several quantities are **derived, not stored**,
so the design begins with **two pure engines** built and tested first: the **condition engine**
(`computeBuildingCondition` / `summarizeCampusCondition` value a building's live spaces and systems,
capacities and a readiness percent and roll building → campus — **decommissioned spaces and systems excluded**
so a retired wing never permanently depresses readiness; `computeServiceStatus` derives a system's
ok/due-soon/overdue against its next-due date in **days, never money**) and the **comfort engine**
(`computeComfortIndex` measures a space's latest readings against per-metric acceptable ranges into a
comfortable/marginal/poor band). Distinctively, one aggregate is **immutable append-only telemetry** (an
environment reading is captured once, never edited — its repository omits `remove`), and **this domain
carries no money** (asset value and costed maintenance are Procurement & Assets' — P2-D15; utility billing
is Finance's — P2-D14). It models eight aggregates: **Building** (an academic/administrative/laboratory/
sports/library/utility/multipurpose structure with a floor count; active ↔ under_renovation →
decommissioned, code unique per tenant, active required to take spaces/systems/sensors, terminal state
frozen against edits), **Space** (a room/area with a floor + usable capacity; draft → available ↔
out_of_service → decommissioned, code unique per building, **floor frozen once in service**, terminal state
frozen), **FacilitySystem** (fixed infrastructure — HVAC/electrical/plumbing/elevator/fire_safety/network/
water — with a service interval + last-serviced date; operational ↔ under_maintenance → decommissioned,
**service status derived** never stored), **Sensor** (a smart device reading one metric — temperature/
humidity/co2/occupancy/energy/water; active ↔ inactive → retired, code unique per tenant, **one active per
(space, metric)**, org/building from the space), **EnvironmentReading** (an **immutable append-only** float
sample feeding the comfort engine), **MaintenanceOrder** (an operational **no-money** work order against a
building/space/system with an **Employee** assignee; reported → assigned → in_progress → completed |
cancelled), **ComfortPolicy** (a versioned per-metric threshold set in **JSONB**; draft → active → archived,
thresholds frozen once active, **one active per org**) and **FacilityProfile** (the descriptive per-building
condition + open-maintenance read model, **refreshed** from the condition engine, never posted to directly).
The **comfort-assessment service** is the smart-environment integration spine — a space's latest readings
measured against its org's active policy via the comfort engine (comfortable when no policy is active). It is
**descriptive, not predictive** (P2-D28). The **movable, capitalized asset register**, asset depreciation and
costed asset maintenance belong to **Procurement & Assets (P2-D15)**; this domain owns the immovable built
environment and its operational, no-money work queue. A building's org is an **Organization** and a
work-order assignee an **Employee**, referenced via directory ports and never duplicated. Money-free,
free-text-free facilities events publish onto the shared bus. Eight tables carry **FORCE RLS** tenant
isolation, verified on live PostgreSQL (INTEGER counts/capacities/floors/intervals/percents/versions, **FLOAT**
sensor value, **JSONB** comfort thresholds and **TEXT** date stamps round-tripping exactly, cross-tenant
INSERT rejected 42501), with tenant-scoped DB unique indexes (building code, space + facility-system code per
building, sensor + maintenance-order code, one profile per building). **Two permission scope pairs** split the
platform along its physical boundary — `facilities:*` for the immovable built environment and its operational
work (buildings, spaces, fixed systems, maintenance orders, the condition profile) and `environment:*` for the
smart environment (sensors, telemetry readings, comfort policies, the live comfort assessment). Organization
and Employee existence enter through injected directory ports. Two status-scoped uniqueness invariants (one
active sensor per space+metric, one active comfort policy per org) are service-enforced (**TD-40**); both
independent adversarial audits were resolved clean (six domain consistency/semantics findings fixed before
merge). All nine service tokens are exported for **in-process cross-domain use**. The operational
built-environment base the campus and intelligence-core domains build on.

## Campus Security, Safety & Visitor Platform (P2-D21, Program: Campus & Engagement · ADR-0040)

The **physical-security and safety system of record for the institution** — the security zones the campus is
divided into, the visitors who come to it and their visits, the access credentials that open zones and the
immutable log of every access decision, the security incidents raised across the estate, the emergency drills
that account for who is present, and the descriptive per-zone safety profile — built on the organization
(P2-D01-M01), person (P2-D01-M02) and workforce (P2-D12) bases, delivered as one `@knowget/campus-security`
package on the certified `v0.2.0` baseline. The **third contract of Program D (Campus & Engagement)**. It is
named `@knowget/campus-security` — **not** the platform `@knowget/security` (the P1-M04 crypto/RBAC
foundation) — an entirely different bounded context, on a distinct `campus-security.*` event namespace.
Several quantities are **derived, not stored**, so the design begins with **two pure engines** built and
tested first: the **presence engine** (`computeZonePresence` values a zone's checked-in count against its
safe-occupancy capacity — places remaining, an over-capacity flag and an occupancy percent, **capacity 0 =
not capacity-tracked**; `summarizeSitePresence` rolls zones into the campus picture; `computeMusterStatus`
reconciles a drill's expected roster against the accounted-for headcount into the **safety-critical
unaccounted-for count**, the roll-call analog) and the **access engine** (`evaluateAccess` decides
granted/denied by strict priority — credential inactive → expired → zone-unavailable → locked-down →
not-granted → ok, comparing a **date-only expiry against the date of the moment** so a credential is honoured
through its whole expiry day; `summarizeAccessActivity` tallies the log). Distinctively, one aggregate is
**immutable append-only telemetry** (an access event is a decision recorded once, never edited — its
repository omits `remove`), and **this domain carries no money** (there is nothing to bill or buy here —
security procurement is Procurement & Assets', P2-D15; any charge is Finance's, P2-D14). It models eight
aggregates: **AccessZone** (a securable area with a security level — public/restricted/secure/high_security —
and a safe-occupancy capacity; active ↔ locked_down → decommissioned, code unique per tenant),
**Visitor** (a campus visitor with a type and optional contact; active ↔ blocked → archived, code unique per
tenant, a blocked/archived visitor cannot have a visit requested or approved), **Visit** (a visitor's
time-bounded presence linked to a host **Person** and an optional zone; requested → approved → checked_in →
checked_out | denied | cancelled | expired, org derived from the visitor, **only checked-in counts toward
presence**), **AccessCredential** (opens zones for an **Employee/Person/Visitor** holder — validated by type
— with a de-duplicated set of granted zones and an optional date-only expiry; active ↔ suspended → revoked,
number unique per tenant), **AccessEvent** (an **immutable append-only** granted/denied decision recorded by
the spine, feeding the activity tally), **SecurityIncident** (the operational security event — reported →
triaged → investigating → resolved → closed | cancelled, an **Employee assignee required before
investigation**, a category + severity; **not** a standing safeguarding record — Learner Wellbeing P2-D05 —
and **not** a clinical event — Health Centre P2-D19), **EmergencyDrill** (scheduled → in_progress → completed
| cancelled with an optional **Employee** conductor, its **muster status derived** by the presence engine) and
**SafetyProfile** (the descriptive per-zone presence + over-capacity + open-incident/active-credential/
granted-denied read model, **refreshed** from the engines, never posted to directly). The
**access-decision service** is the integration spine — it resolves a credential and a zone, runs the access
engine, appends the decision to the immutable log and publishes the access-recorded event. It is
**descriptive, not predictive** (threat scoring / anomaly detection are P2-D28). The **standing safeguarding/
disciplinary record** belongs to **Learner Wellbeing (P2-D05)** and **clinical incidents** to the **Health
Centre (P2-D19)**; this domain owns the operational, time-bounded security occurrence. A zone's/visitor's org
is an **Organization**, a visit host and incident reporter a **Person**, and an incident assignee / drill
conductor / employee credential-holder an **Employee**, referenced via directory ports and never duplicated.
Money-free, free-text-free, **PII-free** campus-security events (no visitor name or contact, no incident
summary) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation, verified on live
PostgreSQL (INTEGER capacities/counts/rosters/musters/percents, **JSONB** granted-zone-ids, **BOOLEAN**
over-capacity flag and **TEXT** codes/names/summaries/date stamps round-tripping exactly, cross-tenant INSERT
rejected 42501), with tenant-scoped DB unique indexes (zone, visitor, credential, incident, drill codes; one
profile per zone) — **all uniqueness absolute and DB-backed** (no status-scoped TOCTOU guard, unlike
D16–D20). **Two permission scope pairs** split the platform along its access boundary — `security:*` for the
institutional security surface (zones, credentials, the access decision + its log, incidents, drills, the
safety profile) and `visitor:*` for the visitor surface (visitors, visits). Organization, Person and Employee
existence enter through injected directory ports. Both independent adversarial audits were resolved clean
(two domain consistency findings — the date-vs-timestamp expiry default and the missing credential-issuance
organization validation — fixed before merge); zone occupancy capacity is advisory, a hard cap left opt-in
behind the service (**TD-41**). All nine service tokens are exported for **in-process cross-domain use**. The
operational campus-security base the engagement and intelligence-core domains build on.

## Unified Communication, Engagement & Collaboration Platform (P2-D22, Program: Campus & Engagement · ADR-0041)

The **engagement system of record for the institution** — the audiences it addresses, the announcements it
broadcasts and the immutable acknowledgement receipts they draw, the message threads and their immutable
messages, the surveys it runs and the immutable responses they collect, and the descriptive per-audience
engagement profile — built on the organization (P2-D01-M01) and person (P2-D01-M02) bases, delivered as one
`@knowget/engagement` package on the certified `v0.2.0` baseline. The **fourth contract of Program D (Campus &
Engagement)**. It is named `@knowget/engagement` — **not** the platform `@knowget/notifications` delivery
service (P1-M05) — an institution-facing domain on a distinct `engagement.*` event namespace; notifications
performs channel delivery (email/SMS/push/in-app), this domain composes and records the message. Several
quantities are **derived, not stored**, so the design begins with **two pure engines** built and tested first:
the **engagement engine** (`computeAnnouncementReach` values an announcement's audience size against its
acknowledgements — acknowledged/pending and an acknowledgement percent; `summarizeEngagement` rolls
announcements into a campaign picture, **capping each item at its own audience size** so no rollup exceeds
100%) and the **survey-tally engine** (`tallySurveyResponses` reduces a survey's questions + responses into a
per-question distribution — per-declared-option counts for the choice types, unknown values ignored;
`computeResponseRate` values responses against audience size). Distinctively, **three of the eight aggregates
are immutable append-only logs** (an acknowledgement receipt, a message and a survey response are written once,
never edited — their repositories omit `remove`), and **this domain carries no money**. It models eight
aggregates: **Audience** (a reusable recipient group with a de-duplicated opaque JSONB set of member Person
ids; active → archived, code unique per tenant, its size feeds the engines, members **not** per-item
validated), **Announcement** (an institution→audience broadcast — title/body/category/priority; draft →
scheduled → published → archived | cancelled, content frozen once published, pinned only while published, org
from the audience; **channel delivery is notifications' P1-M05**), **AcknowledgementReceipt** (an **immutable**
record that a person acknowledged a published announcement — one per (announcement, person)),
**MessageThread** (a conversation among ≥2 validated participant Persons; open ↔ closed → archived, only an
open thread accepts messages), **Message** (an **immutable** entry posted to an open thread by a participant),
**Survey** (a feedback/poll/consent-check instrument with a validated **JSONB** question set; draft → open →
closed → archived, questions/title frozen once open), **SurveyResponse** (an **immutable** submission — one
identified response per (survey, respondent), an anonymous null respondent unbounded, answers validated against
the questions + de-duplicated + single-value for choice types) and **EngagementProfile** (the descriptive
per-audience reach + response read model, **refreshed** from the engines, draft surveys excluded, never posted
to directly). The **engagement-profile service** is the integration spine — it rolls an audience's published
announcements against acknowledgement receipts and its issued surveys against responses through the two
engines and refreshes the one profile per audience. It is **descriptive, not predictive** (sentiment / send-
time optimization are P2-D28). **Channel delivery** stays in the **notifications service (P1-M05)** and
**contact/communication preferences** in **Family & Guardian (P2-D04)**; this domain composes and records the
message. An audience/announcement's org is an **Organization**, and an author, participant and respondent a
**Person**, referenced via directory ports and never duplicated. Money-free, free-text-free, **PII-free**
engagement events (no audience name, no announcement title/body, no message body, no survey title/questions,
no response answers) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant isolation, verified
on live PostgreSQL (INTEGER counts/percents, **JSONB** member/participant/question/answer sets, **BOOLEAN**
pinned flag and **TEXT** codes/names/titles/bodies round-tripping exactly, cross-tenant INSERT rejected 42501,
two anonymous NULL-respondent responses both persisting), with **all uniqueness absolute and DB-backed**
(audience code; one ack per (announcement, person); one identified response per (survey, respondent),
NULL-distinct; one profile per audience) — no status-scoped TOCTOU guard, like P2-D21 and unlike D16–D20.
**Two permission scope pairs** split the platform — `communication:*` for the messaging surface (audiences,
announcements, acknowledgements, threads, messages) and `engagement:*` for the feedback surface (surveys,
responses, the engagement profile). Organization and Person existence enter through injected directory ports.
Both independent adversarial audits were resolved clean (the persistence/API audit clean across all
categories; the domain audit's one medium — the survey-tally value-cardinality over-count — and several low
findings fixed before merge); audience membership is stored without per-item validation (**TD-42**). All eight
service tokens are exported for **in-process cross-domain use**. The operational engagement base the remaining
campus and intelligence-core domains build on.

## Admissions, Marketing, Enrollment & Growth Platform (P2-D23, Program: Campus & Engagement · ADR-0042)

The **admissions system of record for the institution** — the marketing campaigns it runs and the leads they
draw, the admission cycles it opens with their per-grade seat plans, the applications families submit and the
immutable entrance evaluations they gather, the offers extended and the immutable enrollment confirmations that
close the funnel, and the descriptive per-cycle funnel profile — built on the organization (P2-D01-M01) and
person (P2-D01-M02) bases, delivered as one `@knowget/admissions` package on the certified `v0.2.0` baseline.
The **fifth contract of Program D (Campus & Engagement)**. Its defining boundary is **Student Lifecycle
(P2-D03)**: that domain owns the prospect/applicant/student **records** and the enrolled-student lifecycle;
this one runs the funnel that _ends_ where P2-D03 _begins_ — an application references its applicant as a
**Person**, and a confirmed enrollment is the **hand-off point** (`admissions.enrollment.confirmed`, which
Student Lifecycle consumes to enrol the student; `student_id` records the resulting student reference once
known). Several quantities are **derived, not stored**, so the design begins with **two pure engines** built
and tested first: the **funnel engine** (`computeAdmissionFunnel` values the stage counts leads → applications
→ offers → enrollments and the conversion rate between each adjacent pair + the overall lead → enrollment
rate, **each capped at 100** so no stage exceeds the one before it; `summarizeApplicationStages` tallies
applications per status) and the **intake engine** (`computeIntakeCapacity` values a grade's confirmed places
against capacity — remaining / over-subscribed / fill percent, capacity 0 = untracked; `summarizeIntake` rolls
a cycle's grades into a cycle-wide picture). Distinctively, **two of the eight aggregates are immutable
append-only records** (an admission evaluation and an enrollment confirmation are written once, never edited —
their repositories omit `remove`), and **this domain carries no money** — application and admission **fees are
Finance's (P2-D14)**. It models eight aggregates: **MarketingCampaign** (a growth drive over a channel; draft
→ active → completed | cancelled, code unique per tenant; message _delivery_ is notifications' P1-M05 /
engagement's P2-D22), **Lead** (an inbound inquiry; new → contacted → qualified → converted, lost from any open
state, code unique per tenant, contact name + optional phone/email **held on the aggregate, never on an
event**, an optional attributed campaign validated), **AdmissionCycle** (an intake season with a **per-grade
seat plan (JSONB)**; planning → open → closed → archived, code unique per tenant, applications open-only, the
seat plan feeding the intake engine), **Application** (the admissions-process record; submitted → under_review
→ interview → offered with waitlisted | rejected | withdrawn branches, the applicant a validated **Person**,
org derived from the cycle, an optional attributed lead validated), **AdmissionEvaluation** (an **immutable**
entrance evaluation — type, a 0–100 score, a recommendation — recordable only while the application is
under_review or at interview), **Offer** (a seat offer for an `offered` application, grade + cycle derived from
it; extended → accepted | declined | expired | withdrawn, **one offer per application**), **EnrollmentConfirmation**
(an **immutable** close of the funnel — confirmed only from an accepted offer, **one per offer**, the
Student-Lifecycle hand-off) and **AdmissionsFunnelProfile** (the descriptive per-cycle funnel + intake read
model, **refreshed** from the two engines, never posted to directly). The **admissions-funnel-profile service**
is the integration spine — it rolls the organization's leads and the cycle's applications/offers/enrollments
through the funnel engine and the seat plan vs confirmed enrollments through the intake engine, and refreshes
the one profile per cycle (live read helpers derive the funnel and per-grade intake on demand without
persisting). It is **descriptive, not predictive** (yield forecasting / lead scoring are P2-D28). **Fees** stay
in **Finance (P2-D14)** and **marketing delivery** in **notifications (P1-M05) / engagement (P2-D22)**; the
prospect/applicant/student records stay in **Student Lifecycle (P2-D03)**. An admissions record's org is an
**Organization**, and an applicant a **Person**, referenced via directory ports and never duplicated.
Money-free, free-text-free, **PII-free** admissions events (no campaign name, no lead contact name/phone/email,
no applicant identity beyond an id) publish onto the shared bus. Eight tables carry **FORCE RLS** tenant
isolation, verified on live PostgreSQL (INTEGER score/counts/percents, **JSONB** seat plan and **TEXT**
codes/names/grades/contact details round-tripping exactly, cross-tenant INSERT rejected 42501, the three
business uniques — one offer per application, one enrollment per offer, one profile per cycle — rejecting
duplicates 23505), with **all uniqueness absolute and DB-backed** (campaign/lead/cycle/application code per
tenant; one offer per application; one enrollment per offer; one profile per cycle) — no status-scoped TOCTOU
guard, like P2-D21/P2-D22 and unlike D16–D20. **Two permission scope pairs** split the platform —
`marketing:*` for the growth surface (campaigns, leads) and `admissions:*` for the admissions-process surface
(cycles, applications, evaluations, offers, enrollments, the funnel profile). Organization and Person existence
enter through injected directory ports. Both independent adversarial audits were resolved clean (the
persistence/API audit clean across all categories; the domain audit's one confirmed low defect — an empty
application grade threw the code error — and two integrity/consistency refinements fixed before merge with
regression tests); seat capacity is advisory, an opt-in hard cap deferred (**TD-43**). All eight service tokens
are exported for **in-process cross-domain use**. The operational admissions base the remaining Program-D
(Alumni, P2-D24) and intelligence-core domains build on.

## Alumni, Community & Relationship Platform (P2-D24, Program: Campus & Engagement · ADR-0043)

The **alumni-network system of record for the institution** — the alumni-network profiles built on the alumnus
lifecycle stage, the regional/interest chapters and their memberships, the reunions and networking events and
their registrations, the mentorship connections between alumni, and the immutable giving record — built on the
organization (P2-D01-M01) and person (P2-D01-M02) bases, delivered as one `@knowget/alumni` package on the
certified `v0.2.0` baseline. The **sixth and final contract of Program D (Campus & Engagement)**. Its defining
boundary is **Student Lifecycle (P2-D03)**, exactly as for admissions: P2-D03 owns the prospect → applicant →
student → **alumnus** lifecycle _record_; this domain models the alumnus's **network membership** on top of it,
referencing the alumnus as a **Person** and never re-modelling the lifecycle — where admissions (P2-D23) runs
the funnel that brings students in, this keeps the relationship after they leave, both attaching to the same
Person. Several quantities are **derived, not stored**, so the design begins with **two pure engines** built and
tested first: the **engagement engine** (`computeAlumniEngagement` values an alumnus's engagement — a weighted,
capped 0–100 score over attended events / active chapters / active mentorships / contributions and the level it
falls in; `summarizeAlumniEngagement` rolls a set into count / average / per-level distribution) and the
**participation engine** (`computeEventParticipation` values an event's fill / remaining / over-subscribed /
attendance rate against capacity, 0 = untracked; `summarizeParticipation` rolls a set up, **counting only
capacity-tracked events toward the overall fill**). Distinctively, **one of the eight aggregates is an immutable
append-only record** (a contribution is written once, never edited — its repository omits `remove`), and **this
domain carries no money**. It models eight aggregates: **AlumniProfile** (the network-membership anchor
referencing the alumnus as a Person; active ↔ lapsed → opted_out, one per person per tenant), **AlumniChapter**
(a regional/interest/class-year/professional community; forming → active ↔ inactive → archived, code unique,
joinable while forming/active), **ChapterMembership** (an alumnus in a chapter with a role; active → left with
left → active reactivation, **one row per (chapter, alumnus)** — rejoin reactivates, never duplicates),
**AlumniEvent** (a reunion/networking/webinar/fundraiser/volunteer event with a capacity — 0 = untracked — and
window; draft → scheduled → open → closed → completed | cancelled, registrations only while open),
**EventRegistration** (an alumnus's registration; registered → attended | no_show | cancelled with cancelled →
registered reinstatement, **one row per (event, alumnus)**), **MentorshipConnection** (a mentor ↔ mentee between
two **distinct** alumni; proposed → active → completed | ended), **Contribution** (an **immutable** giving
record — type + **non-monetary recognition tier** + optional campaign ref; the amount is Finance's, P2-D14) and
**AlumniEngagementProfile** (the descriptive per-alumnus read model, **refreshed** from the engagement engine,
never posted to directly). The **alumni-engagement-profile service** is the integration spine — it gathers an
alumnus's attended registrations, active chapter memberships, active mentorships and contributions, rolls them
through the engagement engine and refreshes the one profile per alumnus (live read helpers derive engagement and
event participation on demand without persisting). It is **descriptive, not predictive** (giving-propensity /
engagement forecasting are P2-D28). **Gift amounts** stay in **Finance (P2-D14)**, **community delivery** in
**notifications (P1-M05) / engagement (P2-D22)**, and the alumnus lifecycle record in **Student Lifecycle
(P2-D03)**. An alumni record's org is an **Organization**, and an alumnus a **Person**, referenced via directory
ports and never duplicated. Money-free, free-text-free, **PII-free** alumni events (no person name, no graduation
year, no chapter/event name, no mentorship focus, no campaign ref, no gift amount) publish onto the shared bus.
Eight tables carry **FORCE RLS** tenant isolation, verified on live PostgreSQL (INTEGER capacity/counts/score
round-tripping exactly, cross-tenant INSERT rejected, every business unique — one profile per (tenant, alumnus
person); chapter/event code; one membership per (chapter, profile); one registration per (event, profile); one
engagement profile per profile — rejecting duplicates 23505), with **all uniqueness absolute and DB-backed** —
no status-scoped TOCTOU guard, like P2-D21/D22/D23 and unlike D16–D20, the two one-row-per-pair aggregates
reactivating rather than duplicating on return. **Two permission scope pairs** split the platform — `alumni:*`
for the individual relationship surface (profiles, mentorships, contributions, the engagement profile) and
`community:*` for the community surface (chapters, memberships, events, registrations). Organization and Person
existence enter through injected directory ports. Both independent adversarial audits were **clean of functional
defects** (two low design notes — a role dropped on chapter rejoin, and the participation rollup blending tracked
and untracked capacity — polished before merge with regression tests); event capacity is advisory, an opt-in
hard cap deferred (**TD-44**). All eight service tokens are exported for **in-process cross-domain use**. The
operational alumni base — closing **Program D** and the operational core **D01–D24** — the intelligence-core
domains (Program E, D25–D30) build on.

## Institutional Knowledge Graph, Semantic Intelligence & Digital Memory (P2-D25, Program: Intelligence Core · ADR-0044)

The `@knowget/knowledge-graph` package is the institution's **semantic layer and digital memory**, and the
**first contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0` baseline and the
now-complete operational base **D01–D24**. It follows the domain architecture (ADR-0010): a pure package —
**six aggregates plus four pure engines and a refresh spine** — behind repository ports, Prisma/RLS adapters at
the `apps/api` composition root, application services on the platform event bus, and permission-gated,
tenant-scoped REST controllers. Two boundaries define it, both held structurally. **LLMs, agents, vector
embeddings and RAG are deferred _out_ of this contract** into the later intelligence domains (P2-D26+) — D25 is
the structural, semantic and provenance layer, not a model runtime; nothing in the package imports or
implements any of them. And the graph **references domain records, never re-models them** — a knowledge entity
points at a domain record by `sourceDomain` + `sourceRef`, opaquely; no domain→domain import (only the
organization owner via a directory port). Four **pure engines** compute what is derived, built and tested
first: **temporal** (as-of resolution over versioned, time-windowed edges), **traversal** (neighbourhood,
degree, bounded reachability), **provenance** (the derivation tree, explainability, cycle- and retraction-safe,
weakest-link confidence), and **metrics** (descriptive graph summary + per-entity digital memory). Six
aggregates: `EntityType` + `RelationshipType` (the extensible ontology with the source/target edge grammar),
`KnowledgeEntity` (a node with a global id and `active → merged | archived` identity resolution),
`SemanticRelationship` (a directed, **versioned, time-aware** edge, `asserted → superseded | retracted`, the
prior version kept), `Assertion` (an **immutable** claim carrying method + confidence + evidence + antecedents),
and `EntityMemory` (the re-derivable digital-memory read model, maintained by the `KnowledgeMemoryService`
spine). The contract's **defining rule — every assertion carries an evidence chain and is explainable** — is
enforced twice: the aggregate refuses a grounded assertion with no source and a derived one with no antecedents,
and the service requires every cited antecedent to be _standing_; the provenance engine treats a
retracted/absent antecedent as withdrawn, so retracting a fact breaks the explainability and zeroes the
confidence of everything derived from it (exposed at `GET /knowledge/assertions/:id/explain`). Six **FORCE-RLS**
tables (`entity_type`, `relationship_type`, `knowledge_entity`, `semantic_relationship`, `assertion` with a
`derived_from` UUID[], `entity_memory`), each `tenant_isolation` (USING + WITH CHECK, fail-closed), verified on
live PostgreSQL 16 (isolation, unset=0, cross-tenant `42501`, absolute uniques `23505`, INTEGER + UUID[]
round-trips). **Two permission scope pairs** split the surface — `ontology:*` for the schema (entity +
relationship types) and `knowledge:*` for the content (entities, relationships, assertions, the memory spine).
Both independent adversarial audits were **clean of functional defects** (three low/medium notes — a free-text
`predicate` on the assertion event, `summarizeGraph` counting retracted assertions, `supersede` not
re-validating endpoints — polished before merge with regression tests); relationship-type cardinality is
advisory and merge is single-hop (**TD-45**). All six service tokens are exported for **in-process cross-domain
use**. The semantic layer that **opens Program E** — the AI operating system (P2-D26), decision intelligence
(P2-D27), predictive intelligence (P2-D28) and executive intelligence (P2-D29) build on it.

## Enterprise AI Operating System, Agent Orchestration & Reasoning (P2-D26, Program: Intelligence Core · ADR-0045)

The `@knowget/agent-orchestration` package is the institution's **AI runtime**, and the **second contract of
Program E** (D25–D30), built on P2-D25's semantic layer and the operational base **D01–D24** whose capabilities
agents invoke by key. It follows the domain architecture (ADR-0010): a pure package — **six aggregates plus five
pure engines** — behind repository ports, Prisma/RLS adapters at the `apps/api` composition root, application
services on the platform event bus, and permission-gated, tenant-scoped REST controllers. The design problem the
contract poses is **authority, not orchestration**: what may an agent do unattended, on whose authority, what can
be undone, and what is the evidence. Two contract rules define it and both are held structurally. **Agents
invoke capabilities, never databases directly** — an agent's whole reach is a set of catalogued capability keys,
and the package holds no database client, no HTTP client and no vocabulary for a query (verified by absence: no
`@prisma`, `PrismaClient`, `openai`, `anthropic`, `axios`, `node-fetch`, `langchain`, embedding, vector or
`fetch(` reference anywhere; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions`,
`@knowget/events`). **Knowledge retrieval originates from D25** — `RETRIEVAL_SOURCES` is the one-member union
`["knowledge_graph"]`, so there is no word for another source. A third boundary comes from the phase plan:
**external AI providers are reached only through the Phase-3 AI integration adapter (P3-D09)** — the AI OS never
calls a provider itself and holds no SDK to do it with. Five **pure, deterministic, clock-free engines** compute
what is derived, built and tested first: **authorization** (the autonomy × effect × risk × reversibility matrix,
three-way outcome, stable reason codes), **planning** (a plan made inspectable before it moves),
**reasoning** (the session evidence chain, cycle-safe, weakest-support confidence), **rollback**
(`compensationPlan` over what actually happened, in reverse) and **metrics** (descriptive counts only). Six
aggregates: `AgentDefinition` (autonomy + the granted capability keys that are its whole reach), `ToolDefinition`
(the **capability catalog**: effect, risk, reversibility, compensating capability), `ExecutionPlan` (goal +
ordered dependency-linked steps **inside the aggregate**, an unknown dependency refused at add time so a cycle is
impossible by construction), `ApprovalRequest` (the human gate — subject, expiry, a recorded decider, and
**single-use consumption**), `ToolInvocation` (created **only** authorized, settled writes `compensated`) and
`ReasoningSession` (purpose + ordered trace chain). The gate cannot be routed around: `DENYING_REASONS` are
**grant** failures no approval rescues (approval raises a gate, it never mints authority), `MAX_UNATTENDED_RISK`
and `UNATTENDED_EFFECTS` cap what runs unattended so **nothing `critical` or irreversible ever executes
unattended at any autonomy level**, `decidedByUserId` comes from the authenticated principal and is never
accepted from a body, spending an approval is scope-checked to this agent and this capability, and **one human yes
buys exactly one act** — `isApprovalSpendable` (granted _and_ unspent) is checked in the service and
independently in the aggregate constructor, the grant spent before the invocation is stored so a crash fails
closed. Six **FORCE-RLS** tables, each `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, with
the absolute uniques DB-backed (agent key per tenant; capability key per tenant); **three tables deliberately
carry no soft-delete column** (approval, invocation, reasoning session — accountability records with no discard
path). **Three permission scope groups** split the surface — `agent:*` for registry and catalog governance,
`ai:read`+`ai:operate` for the runtime, and `ai:approve` for the human gate alone (including `expire-due`, since
closing gates without a decision has the same effect on the queue as rejecting them). Prose- and PII-free `ai.*`
events publish onto the shared bus. A consistency pass audited the delivery against the 30 sibling domains, and
the documentation pass that followed it **found and closed a real authority hole** (an approval that was never
consumed) rather than describing one; the residual check-then-act window under true concurrency is **TD-46**. All
seven service tokens are exported for **in-process cross-domain use**. The runtime through which decision
intelligence (P2-D27), predictive intelligence (P2-D28) and executive intelligence (P2-D29) will make their
recommendations act — behind plans, permissions and the human gate.
