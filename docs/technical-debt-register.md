# Technical-Debt Register

Deliberately-deferred capabilities, each behind a stable interface, with the
contract that will resolve them. Reviewed and burned down at every certification
milestone.

> **Phase-1 certification review (P1-M07):** 5 items resolved in Phase 1
> (TD-02/03/04/10/15); 14 remain, **all interface-protected and none blocking
> Phase 2**. No `TODO`/`FIXME` markers exist in the codebase.
>
> **P2-D02 governance review:** no new blocking debt. TD-21 (domain Prisma adapters
> at the composition root) now also covers the eight governance adapters; TD-01
> (in-process events/outbox) covers the eight `governance.*` events. One new low
> item, **TD-23** (approval subject decoupled by design). No `TODO`/`FIXME` markers.
>
> **P2-D03 student-lifecycle review:** no new blocking debt. TD-21 covers the six
> student-lifecycle adapters; TD-01 covers the nine `student.*` events. One new low
> item, **TD-24** (single-active-enrollment enforced in-service, DB backstop deferred).
> No `TODO`/`FIXME` markers.
>
> **P2-D04 family-guardian review:** no new blocking debt — an independent audit found
> no High/Medium correctness bugs across all seven aggregates. TD-21 covers the seven
> family-guardian adapters; TD-01 covers the eight `family.*` events. Two new low items,
> **TD-25** (consent decoupled from guardian legal authority / student relationship, by
> design) and **TD-26** (two status-scoped uniqueness invariants enforced in-service, DB
> partial-unique backstops deferred). No `TODO`/`FIXME` markers.
>
> **P2-D05…D08 domain reviews:** no new blocking debt across the learner-wellbeing (D05),
> academic-structure (D06), academic-scheduling (D07) and attendance-presence (D08) domains.
> TD-21 covers their composition-root Prisma adapters; TD-01 covers their domain events. Two
> new deferral items, both recognised-but-not-yet-evaluated policy rule types behind a stable
> rule-type dispatch: **TD-27** (three scheduling-policy rules — D07/ADR-0026) and **TD-28**
> (three attendance-policy rules — `late_arrival`, `early_departure`, `grace_period`, which
> need intra-session timing — D08/ADR-0027). An independent audit of D08 found no High/Medium
> correctness bugs; one minor engine-consistency finding (the presence chronic-absence streak
> not excusing approved leave that the attendance percentage already excused) was fixed
> in-milestone by sharing one leave-excusal helper between both engines, with a regression
> test. No `TODO`/`FIXME` markers.
>
> **P2-D09 teaching-learning review:** no new blocking debt — an independent audit found no
> High/Medium issues across all seven aggregates, the intelligence engine, adapters, schema,
> migration and controllers. TD-21 covers the seven composition-root adapters; TD-01 covers the
> nine `teaching.*` events. One new low item, **TD-29** (array cross-references stored without
> per-item validation, single references validated). One minor audit finding (two instructional
> indicators could exceed the documented 0–100 range) was fixed in-milestone by clamping, with a
> regression test. No `TODO`/`FIXME` markers.
>
> **P2-D10 assessment-evaluation review:** no new blocking debt — an independent audit found no
> Critical/Major or security/tenancy issues across all seven aggregates, both pure engines (grading
> and assessment intelligence), adapters, schema, migration and controllers. TD-21 covers the seven
> composition-root adapters; TD-01 covers the nine `assessment.*` events. One new low item, **TD-30**
> (array cross-references stored without per-item validation, single references validated). One minor
> audit finding (`revise` on the framework and question bank lacked a state guard, so a draft could
> be forced `active`) was fixed in-milestone by guarding both to require an active aggregate, with
> regression tests; a dead, never-thrown error class was removed. No `TODO`/`FIXME` markers.
>
> **P2-D11 learning-intelligence review:** no new blocking debt — an independent audit found no
> security/tenancy issues and confirmed the non-goal discipline (descriptive/explainable only, no
> prediction; human-in-the-loop recommendations; no upstream recomputation) across all seven
> aggregates, the three pure engines, adapters, schema, migration and controllers. TD-21 covers the
> seven composition-root adapters; TD-01 covers the nine `insight.*` events. One new low item,
> **TD-31** (upstream evidence references stored without per-item validation, the learner anchor
> validated). One major audit finding (the cohort-insight service did not pre-check its
> one-per-scope invariant, so a duplicate surfaced as a 500 not a 409) was fixed in-milestone with a
> `DuplicateCohortInsightError` + `findByScope` pre-check and a regression test; four minor findings
> (a dead error class, an incomplete default rule set, un-audited goal outcomes, an unclamped manual
> score) were also fixed with tests. No `TODO`/`FIXME` markers.
>
> **P2-D12 workforce review:** no new blocking debt — two independent audits (domain logic, and
> persistence/API) found no security/tenancy or schema/migration/adapter issues and confirmed the
> boundary discipline (no compensation amount stored — grade/band label only; workforce profile
> descriptive/explainable, not predictive) across all eight aggregates, both pure engines, adapters,
> schema, migration, controllers and DI wiring. TD-21 covers the eight composition-root adapters;
> TD-01 covers the workforce domain events. One new low item, **TD-32** (soft head/reviewer
> references stored without validating they resolve to a current employee; the Person/Organization
> anchors and department/position org-consistency are validated). One high audit finding (the
> contract service expired and superseded the current active contract before validating the target
> was a draft, so a mistaken re-activation of a superseded version would leave zero active contracts
> and emit a spurious event) was fixed in-milestone by validating the draft state up front, with a
> regression test; a dead, never-thrown error class was removed and a `getById` added to make its
> sibling error live. No `TODO`/`FIXME` markers.
>
> **P2-D13 faculty-excellence review:** no new blocking debt — two independent audits (domain logic;
> persistence/API) found no correctness, invariant, spec-adherence, schema/migration/adapter, RLS or
> DI-wiring defects across all eight aggregates, both pure engines, adapters, schema, migration,
> controllers and wiring, and confirmed the boundary discipline (descriptive faculty-growth band, not
> a prediction; only completed activities earn hours and compliance credits completion only up to each
> requirement; only acknowledged observations count toward standing; staff referenced as Employees,
> never duplicated). TD-21 covers the eight composition-root adapters; TD-01 covers the faculty domain
> events. One new low item, **TD-33** (soft framework/engagement/competency references stored without
> validation; the Employee/Organization anchors and observation rating-keys are validated). One dead,
> never-used helper (`isEngagementActive`, confusingly named next to the active-only
> `isEngagementRunning` the services use) was removed. No `TODO`/`FIXME` markers.

> **P2-D15 procurement/inventory/assets review:** no new blocking debt — two independent audits (domain
> logic; persistence/API) reviewed all eight aggregates, both pure engines, adapters, schema, migration,
> controllers and DI wiring. The **persistence/API audit was clean** (adapter field fidelity, the BIGINT
> money bridge incl. the three nullable columns, the JSON line round-trip, FORCE RLS + WITH CHECK on all
> eight tables, the procurement/asset scope split, route non-collision and DI dependency kinds all
> verified). The **domain audit** confirmed the money math, the stock-balance and straight-line
> depreciation engines, the state machines and the core service invariants (insufficient-stock and
> over-receipt rejection, receiving-posts-stock-before-persist, active-supplier-to-issue, org derived
> not supplied) correct, and surfaced two fixable low items — both addressed with regression tests: a
> `multiplyMoney` non-integer-quantity guard and the missing `maintenance.cancelled` event. TD-21 covers
> the eight composition-root adapters; TD-01 covers the resource domain events. One new low item,
> **TD-35** (the self-contained money module). No `TODO`/`FIXME` markers.

> **P2-D16 transport/fleet review:** no new blocking debt — **two independent adversarial audits (domain
> logic; persistence/API) were both clean**, finding no correctness, invariant, schema/migration/adapter,
> RLS, scope-gating, route-collision or DI-wiring defects across all eight aggregates, both pure engines,
> adapters, schema, migration, controllers and wiring, and confirming the boundary discipline (no money
> in the domain — fees are Finance, valuation/maintenance the Asset register; descriptive utilization,
> not a prediction; identity referenced not duplicated). The domain audit verified the schedule/occupancy
> engines, the capacity/onboard guards and the licence/compliance date-boundary math. TD-21 covers the
> eight composition-root adapters; TD-01 covers the transport domain events. One new low item, **TD-36**
> (two status-scoped uniqueness invariants enforced in-service, DB partial-unique backstops deferred). No
> `TODO`/`FIXME` markers.

> **P2-D17 residential/hostel/boarding review:** no new blocking debt — **two independent adversarial
> audits (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit was
> **clean across all eight categories** (adapter field fidelity, JSONB round-trip,
> schema/migration/adapter consistency, FORCE RLS + WITH CHECK, uniqueness, status-filtered queries,
> controller scope split + route ordering, DI wiring). The domain audit was **clean on all
> critical/major items** and verified both pure engines (occupancy; roll-call reconciliation), every
> state machine, the capacity/roster/overdue guards, the compliance date-boundary math and every service
> invariant; its two actionable findings were **fixed before merge** (a missing draft-guard on
> `setRoomFloor`, now frozen once available like the beds; and `unassignWarden` now publishes a distinct
> `warden_unassigned` event rather than reusing `warden_assigned`). The boundary discipline holds — no
> money in the domain (fees are Finance, valuation/maintenance the Asset register); descriptive occupancy,
> not a prediction; identity referenced not duplicated. TD-21 covers the eight composition-root adapters;
> TD-01 covers the residential domain events. One new low item, **TD-37** (two status-scoped uniqueness
> invariants enforced in-service, DB partial-unique backstops deferred). No `TODO`/`FIXME` markers.
>
> **P2-D18 library/circulation review:** no new blocking debt — **two independent adversarial audits
> (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit was **clean
> across all categories** (schema/migration column-by-column parity, adapter field fidelity, JSONB
> round-trip, correct delegates + status-filtered queries, port conformance, controller scope split + route
> ordering, DTO/enum parity, DI wiring, and the loan-issue term-resolution composition). The domain audit
> was **clean on all critical/major items** and verified both pure engines (title availability +
> utilization; loan status), every state machine, the borrowing-limit and uniqueness-scope guards, the
> null/undefined setter handling and every service invariant; its one actionable finding was **fixed before
> merge** — `CopyService.markLost` now refuses an on-loan copy (it must be lost through the loan, which
> reconciles the loan and the copy together), closing a cross-aggregate double-count; a cosmetic
> queue-position collision after a cancellation was hardened in the same pass. The boundary discipline holds
> — no money in the domain (fines are Finance, acquisition/valuation Procurement & Assets); descriptive
> collection profile, not a prediction; identity referenced not duplicated. TD-21 covers the eight
> composition-root adapters; TD-01 covers the library domain events. One new low item, **TD-38** (three
> status-scoped uniqueness invariants enforced in-service, DB partial-unique backstops deferred). No
> `TODO`/`FIXME` markers.
>
> **P2-D19 health-centre/clinical review:** no new blocking debt — **two independent adversarial audits
> (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit was **clean
> across all categories** (schema/migration column-by-column parity incl. the BOOLEAN over-capacity and the
> INTEGER/TEXT columns with no JSONB, adapter field fidelity, correct delegates + status-filtered queries,
> port conformance, controller scope split + route ordering, DTO/enum parity, DI wiring). The domain audit
> was **clean on all critical/major items** and specifically verified the **content-free event invariant
> across all eight payload builders** (no chief complaint, assessment, disposition, triage acuity,
> medication, dosage or referral/admission reason on any event), both pure engines (sick-bay occupancy;
> medication schedule), every state machine, the encounter-clinician-required and dose-limit guards, the
> admission capacity + one-per-bed + one-per-patient invariants, org derivation from an active centre, and
> the Learner-Wellbeing (P2-D05) boundary (no standing health record modelled); its one actionable finding
> was **fixed before merge** — `AppointmentService.reschedule` now publishes a distinct
> `clinical.appointment.rescheduled` event rather than a `scheduled` event that would misdescribe a
> still-requested appointment. The boundary discipline holds — no money (billing is Finance, supplies
> Procurement & Assets); descriptive centre profile, not a prediction; identity referenced not duplicated.
> TD-21 covers the eight composition-root adapters; TD-01 covers the (content-free) health-centre events.
> One new low item, **TD-39** (two status-scoped uniqueness invariants enforced in-service, DB partial-
> unique backstops deferred). No `TODO`/`FIXME` markers.
>
> **P2-D20 facilities/smart-environment review:** no new blocking debt — **two independent adversarial audits
> (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit was **clean across
> all categories** (schema/migration column-by-column parity incl. the FLOAT sensor value, the JSONB comfort
> thresholds and the INTEGER/TEXT columns, adapter field fidelity incl. the append-only reading repository with
> no `remove`, correct delegates + status-filtered queries, port conformance, controller scope split +
> route ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items** and
> surfaced **six consistency/semantics findings, all fixed before merge** — terminal-state guards added to
> `setSpaceType`, `renameBuilding`/`setBuildingFloors` and `setSensorUnit` (a decommissioned/retired aggregate
> can no longer be edited); `SensorService.reactivate` now self-excludes in the one-active-per-(space,metric)
> check so an already-active sensor yields a transition error, not a false duplicate; `computeBuildingCondition`
> now excludes decommissioned spaces/systems from the counts and total capacity; and the comfort-policy event
> payload no longer carries the free-text policy name. The boundary discipline holds — no money (asset cost is
> Procurement & Assets, utility billing is Finance); the immovable built environment vs the movable capitalized
> asset (P2-D15); descriptive facility profile, not a prediction; identity referenced not duplicated. TD-21
> covers the eight composition-root adapters; TD-01 covers the (money-free, free-text-free) facilities events.
> One new low item, **TD-40** (two status-scoped uniqueness invariants enforced in-service, DB partial-unique
> backstops deferred). No `TODO`/`FIXME` markers.
>
> **P2-D21 campus-security/safety/visitor review:** no new blocking debt — **two independent adversarial audits
> (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit was **clean across
> all categories** (schema/migration column-by-column parity incl. the JSONB granted-zone-ids, the BOOLEAN
> over-capacity flag and the INTEGER/TEXT columns, adapter field fidelity incl. the **append-only access-event
> repository with no `remove`**, correct delegates + status-filtered queries, port conformance, controller scope
> split + route ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items**
> and surfaced **two consistency findings, both fixed before merge** — the access-decision spine defaulted its
> as-of date to the full `occurredAt` **timestamp** while the engine compares a **date-only** `expiresOn`, so a
> credential was wrongly denied on its own expiry day; it now defaults to the **date portion**
> (`occurredAt.slice(0, 10)`), with a regression test covering the on-day grant and next-day denial. And
> `AccessCredentialService.issue` did not validate the organization while every sibling service does; it now
> validates via an injected `OrganizationDirectory`, with a test. The boundary discipline holds — no money
> (nothing is billed or bought here; procurement is Procurement & Assets, any charge Finance); the operational
> security **occurrence** vs the standing safeguarding record (Learner Wellbeing, P2-D05) and the clinical
> incident (Health Centre, P2-D19); the immutable append-only access log; identity referenced not duplicated;
> money-free, free-text-free **and PII-free** events (no visitor name/contact, no incident summary). Naming is
> deliberate — `@knowget/campus-security`, distinct from the platform `@knowget/security` (P1-M04 crypto/RBAC).
> TD-21 covers the eight composition-root adapters; TD-01 covers the campus-security events. Notably this domain
> carries **no status-scoped uniqueness TOCTOU debt** (unlike D16–D20): **all** its uniqueness (zone, visitor,
> credential, incident, drill codes; one profile per zone) is **absolute and DB-backed**. One new low item,
> **TD-41** (zone occupancy capacity advisory, hard cap deferred as opt-in). No `TODO`/`FIXME` markers.
>
> **P2-D22 communication/engagement/collaboration review:** no new blocking debt — **two independent
> adversarial audits (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit
> was **clean across all categories** (schema/migration column-by-column parity incl. the JSONB member/
> participant/question/answer sets, the BOOLEAN pinned flag and the INTEGER counts, adapter field fidelity incl.
> the **three append-only repositories with no `remove`** and the DB-backed uniques, correct delegates +
> status-filtered queries, controller scope split + route ordering, DTO/enum parity, DI wiring). The domain
> audit was **clean on all critical/major items** and surfaced **one medium and several low findings, all fixed
> before merge** — MEDIUM: the survey-tally could over-count, because a single-choice/rating answer carrying
> multiple (or duplicate) values incremented several options for one respondent; fixed by de-duplicating answer
> values on record and rejecting a single-choice/rating answer with more than one distinct value
> (`SingleValueQuestionError`), with a regression test. LOW: `summarizeEngagement` now caps each item's
> acknowledged count at its own audience size (no >100% rollup); the engagement-profile spine excludes draft
> surveys from the survey count + response-rate denominator (mirroring the published-only announcement roll-up);
> adding an already-present thread participant no longer saves or emits a spurious event; three never-thrown
> `NotFound` error classes were removed. The boundary discipline holds — no money; **channel delivery** stays in
> the notifications service (P1-M05) and **contact/communication preferences** in Family & Guardian (P2-D04);
> descriptive engagement profile, not a prediction; identity referenced not duplicated; money-free,
> free-text-free **and PII-free** events (no audience name, no announcement title/body, no message body, no
> survey title/questions, no response answers). Naming is deliberate — `@knowget/engagement`, distinct from the
> platform `@knowget/notifications` (P1-M05 channel delivery). TD-21 covers the eight composition-root adapters;
> TD-01 covers the engagement events. Notably, like P2-D21 and unlike D16–D20, this domain carries **no
> status-scoped uniqueness TOCTOU debt** — **all** its uniqueness (audience code; one ack per (announcement,
> person); one identified response per (survey, respondent), NULL-distinct so anonymous is unbounded; one
> profile per audience) is **absolute and DB-backed**. One new low item, **TD-42** (audience membership stored
> without per-item validation). No `TODO`/`FIXME` markers.
>
> **P2-D23 admissions/marketing/enrollment/growth review:** no new blocking debt — **two independent
> adversarial audits (domain logic; persistence/API) reviewed the whole milestone**. The persistence/API audit
> was **clean across all categories** (schema/migration column-by-column parity incl. the JSONB seat plan and
> the INTEGER score/counts, adapter field fidelity incl. the **two append-only repositories with no `remove`**
> and the DB-backed uniques, correct delegates + status-filtered queries, controller scope split + route
> ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items** and
> surfaced **one confirmed low defect and two integrity/consistency refinements, all fixed before merge with
> regression tests** — LOW: `createApplication` threw `EmptyApplicationCodeError` for an empty _grade_ (wrong
> field blamed); fixed with a new `EmptyApplicationGradeError` and a test asserting each error blames the right
> field. REFINEMENTS: `ApplicationService.submit` now validates an optional attributed `leadId` (matching how
> `LeadService` validates `campaignId`), so no application references a non-existent lead (new
> `LeadNotFoundForApplicationError` + regression test); and the private open-status sets are derived from the
> exported `OPEN_*_STATUSES` constants, removing the duplicated source of truth. The boundary discipline holds —
> no money (**fees** stay in Finance, P2-D14); the prospect/applicant/student records stay in **Student
> Lifecycle (P2-D03)**, to which a confirmed enrollment hands off by event; **marketing delivery** stays in
> notifications (P1-M05) / engagement (P2-D22); descriptive funnel profile, not a prediction; identity
> referenced not duplicated; money-free, free-text-free **and PII-free** events (no campaign name, no lead
> contact name/phone/email, no applicant identity beyond an id). TD-21 covers the eight composition-root
> adapters; TD-01 covers the admissions events. Notably, like P2-D21 and P2-D22 and unlike D16–D20, this domain
> carries **no status-scoped uniqueness TOCTOU debt** — **all** its uniqueness (campaign/lead/cycle/application
> code per tenant; one offer per application; one enrollment per offer; one profile per cycle) is **absolute and
> DB-backed**. One new low item, **TD-43** (seat capacity advisory, hard cap deferred as opt-in). No
> `TODO`/`FIXME` markers.

| #     | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Interface protecting callers                                                                                                   | Resolved by                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| TD-01 | Event delivery is in-process; a transactional outbox now exists but its store is in-memory and there is no streaming backbone                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `EventBus` / `OutboxStore` (`@knowget/events`)                                                                                 | P3-D02 (streaming) + Phase-2 (PG outbox)                                    |
| TD-02 | ~~No real persistence~~ (resolved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `@knowget/persistence` + `@knowget/database`                                                                                   | ✅ P1-M03                                                                   |
| TD-03 | ~~Auth is contracts only (no login/token issuance)~~ (resolved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Principal` / permission fns (`@knowget/auth`)                                                                                 | ✅ P1-M04                                                                   |
| TD-04 | ~~Security is foundational (no full crypto/key mgmt)~~ (resolved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `@knowget/security` exports                                                                                                    | ✅ P1-M04                                                                   |
| TD-05 | SDK exposes only `health()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `KnowGetClient` (`@knowget/sdk`)                                                                                               | P3-D01                                                                      |
| TD-06 | Docker images copy the full workspace (not slimmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `Dockerfile.*`                                                                                                                 | P1-M06                                                                      |
| TD-07 | Playwright E2E runs in CI only (not local verify)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `apps/web` `test:e2e`                                                                                                          | P1-M06                                                                      |
| TD-09 | Feature flags are static/config-driven only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `FeatureFlagService` (`@knowget/configuration`)                                                                                | later                                                                       |
| TD-10 | ~~Distributed tracing is correlation-id only (no spans)~~ (resolved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `Tracer` / `Span` (`@knowget/tracing`)                                                                                         | ✅ P1-M06                                                                   |
| TD-11 | ~~Signing-key material is in-memory and secrets are env-backed (no HSM/KMS); JWT verify uses the single current key~~ **(resolved).** Envelope key custody (`KmsClient` wrap/unwrap; `SECURITY_KEY_CUSTODY=envelope`) unwraps a KMS-wrapped signing key at boot so it is never plaintext at rest; an async `TokenSigner` seam carries issuance with multi-version verify (HMAC active); an RS256 `AsymmetricTokenSigner` over a `KmsSigner` port is ready behind the seam. Env-gated; a real cloud-KMS/HSM adapter behind the ports is the remaining drop-in (ADR-0019).                        | `KeyRing` / `SecretsProvider` / `KmsClient` / `TokenSigner` (env-gated)                                                        | ✅ ADR-0019                                                                 |
| TD-12 | Prisma engine CDN unreachable in the build sandbox → Prisma-client build + DB integration tests are CI-verified (not local)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                              | environmental                                                               |
| TD-13 | RLS requires the app to connect as a **non-superuser** (superusers bypass RLS) — deployment/ops requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `withTenant` (`@knowget/database`)                                                                                             | P5-D03 (ops docs)                                                           |
| TD-14 | `DataProbe` is a platform verification fixture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `dataProbeRepository`                                                                                                          | remove when domain tables land (Phase 2)                                    |
| TD-15 | ~~Prisma `binaryTargets` = native only; Docker alpine needs `linux-musl-openssl-3.0.x`~~ (resolved)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `schema.prisma`                                                                                                                | ✅ P1-M06                                                                   |
| TD-16 | ~~RBAC + live security: identity, principal→role, role→permission, **sessions and token revocation**~~ **(resolved).** Identity, principal→role and role→permission stores are persisted, tenant-scoped and **certified** (M03–M05/M07); the live bootstrap swap is wired (ADR-0014); and **sessions + token revocation are now persisted and enforced per request** (ADR-0015) under `SECURITY_STORE=persisted`, on live-RLS tables (tenant as a JWT claim; `jti`; `POST /secure/logout`). Promoting `persisted` to the **default** is an operational toggle; refresh-token rotation is TD-18. | `IdentityRepository` / `PrincipalResolver` / `RoleStore` / `SessionStore` / `RevocationStore` (persisted, certified, enforced) | ✅ M03–M05, certified M07; live swap ADR-0014; sessions/revocation ADR-0015 |
| TD-17 | ~~Rate limiter is in-process fixed-window (per-instance, not shared across replicas)~~ **(resolved).** Async distributed limiter over the Redis `KeyValueStore` (`REDIS_URL`); concurrent replicas share one atomic fixed-window counter (ADR-0017).                                                                                                                                                                                                                                                                                                                                            | `RateLimiter` (`@knowget/security`)                                                                                            | ✅ ADR-0017                                                                 |
| TD-18 | ~~Refresh-token rotation / replay-detection / family lineage~~ **(resolved).** Refresh tokens are persisted, single-use and rotate within a **session-bound family** (`security_refresh_token`, FORCE RLS); replaying a consumed token revokes the family and its session; logout ends the lineage (ADR-0016).                                                                                                                                                                                                                                                                                  | `RefreshTokenStore` + `RevocationStore` (family)                                                                               | ✅ ADR-0016                                                                 |
| TD-19 | ~~Shared services use in-memory/node-stdlib defaults, not shared across replicas~~ **(resolved).** All shared services now have distributed backends behind their ports, env-gated: cache (ADR-0017), and **jobs + notifications on Redis** and **search + files on Postgres** (ADR-0018). In-memory remains the default (dev/test/single-instance).                                                                                                                                                                                                                                            | service ports (`@knowget/cache`/`jobs`/`files`/`search`/`notifications`)                                                       | ✅ ADR-0017 (cache) + ADR-0018 (jobs, notifications, search, files)         |
| TD-20 | Media processing is passthrough (metadata + rendition planning only, no real transcode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `MediaProcessor` (`@knowget/media`)                                                                                            | later (sharp/ffmpeg processor)                                              |
| TD-21 | Domain Prisma adapters live at the composition root (`apps/api`), not per-domain persistence packages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | domain repository ports (e.g. `OrganizationRepository`)                                                                        | later (mechanical refactor as domains grow)                                 |

| TD-22 | ~~Per-request session validation reads and touches the session store on every authenticated request~~ **(resolved).** A read-through `SessionValidityCache` (over the shared `KeyValueStore`) skips the store validate on the fast path; revocation is still checked and logout/replay invalidate the entry (ADR-0017). | `SessionEnforcer` (apps/api security) | ✅ ADR-0017 |
| TD-23 | Governance **approval** references its subject opaquely (`kind` + `subjectId`) and is **not** foreign-key-validated against the referenced aggregate (policy/committee/resolution/delegation), keeping the one reusable workflow decoupled from the six aggregates (ADR-0021). Tightening to a validated subject reference is a later refinement behind the service. | `GovernanceApprovalService` (`@knowget/governance`) | later (validated subject reference) |
| TD-24 | The **single active enrollment per institution** invariant is enforced in the service (check-then-act via `listByPerson` + `isOnRoll`), with no DB backstop, so two concurrent `enroll` calls for the same person+org have a TOCTOU window. The unique student number already has a DB `@@unique`. A partial unique index on `(tenant_id, person_id, organization_id) WHERE enrollment_status IN ('enrolled','active','on_leave') AND deleted_at IS NULL` would backstop it (ADR-0022). | `StudentService` (`@knowget/student-lifecycle`) | later (partial unique index) |
| TD-25 | Granting a **consent** is deliberately **decoupled** from the guardian's legal authority and from the existence of a student↔guardian relationship: `ConsentService.grant` validates guardian, student and (optional) policy existence, but does not require the guardian to hold legal authority or to be actively related to the student. The append-only ledger records _who decided_; authority lives on the relationship aggregate. Tightening to require an active guardian↔student link is a later refinement behind the service (mirrors TD-23, ADR-0023). | `ConsentService` (`@knowget/family-guardian`) | later (validated guardian↔student link) |
| TD-26 | Two **status-scoped uniqueness** invariants — a single **active** guardian↔student relationship, and a unique **active** emergency priority per student — are enforced in the service (check-then-act via `findActive` / a priority scan), with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_ invariants (family number, guardian person+org, consent version, one profile per family) all have DB `@@unique` indexes. A **partial** unique index (required because archived/ended rows retain their values) would backstop each (ADR-0023). | `StudentGuardianRelationshipService` / `EmergencyContactService` (`@knowget/family-guardian`) | later (partial unique indexes) |
| TD-27 | Three scheduling-policy rule types — `subject_sequencing`, `resource_priority`, `availability_window` — are stored and version-controlled but not yet evaluated by the conflict engine (they need data beyond the weekly slot grid). The engine dispatches on rule type, so each can be implemented behind the existing seam without a model change (ADR-0026). | `detectConflicts` / `SchedulingPolicyService` (`@knowget/academic-scheduling`) | later (per-rule evaluators) |
| TD-28 | Three attendance-policy rule types — `late_arrival`, `early_departure`, `grace_period` — are stored and version-controlled but not yet evaluated by the policy engine (they need intra-session timing beyond the day-grained record model; the three percentage rules are enforced). The engine dispatches on rule type, so each can be implemented behind the existing seam without a model change (ADR-0027). | `evaluatePolicies` / `AttendancePolicyService` (`@knowget/attendance-presence`) | later (per-rule evaluators) |
| TD-29 | Array cross-references in teaching-learning — a unit/lesson/resource's `learningOutcomeIds`, a lesson's `requiredResourceIds`, a session's `resourcesUsedIds` — are stored without per-item existence validation, though single references (subject, curriculum framework, unit plan, schedule slot, section, student) are validated on write. Validating each list member would add a directory call per element per write; the curriculum framework and subject are the validated anchors. Tightening to validate list members is a later refinement behind the services (ADR-0028). | teaching-learning services (`@knowget/teaching-learning`) | later (per-item list validation) |
| TD-30 | Array cross-references in assessment-evaluation — an assessment's `learningOutcomeIds` and `competencies`, and a question's `learningOutcomeIds` and `competencies` — are stored without per-item existence validation, though single references (organization, subject, framework, plan, assessment, student) are validated on write. Validating each list member would add a directory call per element per write; the subject and framework are the validated anchors. Tightening to validate list members is a later refinement behind the services (ADR-0029). | assessment-evaluation services (`@knowget/assessment-evaluation`) | later (per-item list validation) |
| TD-31 | Upstream evidence references in learning-intelligence — a signal's / warning's / insight's / recommendation's evidence refs and a growth plan's `sourceRecommendationIds` — are stored without per-item existence validation, though the owning Organization and Student are validated on write. This domain **synthesizes** the upstream domains rather than re-verifying them, so validating each reference would add a cross-domain call per element per write for little benefit; the learner is the validated anchor. Tightening to validate references is a later refinement behind the services (ADR-0030). | learning-intelligence services (`@knowget/learning-intelligence`) | later (per-item reference validation) |
| TD-32 | Soft intra-domain references in workforce — a department's `headEmployeeId` and a performance review's `reviewerId` — are stored without validating they resolve to a current employee, and leave/review target an existing employee but not necessarily an on-staff one. The **Person and Organization anchors are validated on write**, and a department/position assigned to an employee is validated to share the organization. Validating the soft references would add a lookup per write for little benefit; the employee/Person is the validated anchor. Tightening is a later refinement behind the services (ADR-0031). | workforce services (`@knowget/workforce`) | later (head/reviewer employee validation) |
| TD-33 | Soft references in faculty-excellence — a development goal's `frameworkId` / `engagementId` / `targetCompetencyKey` and a coaching engagement's optional `frameworkId` — are stored without per-item existence validation. The **Employee (observed, observer, coach, coachee) and Organization anchors are validated on write**, an observation is scheduled only against an active framework, and its rating keys are validated against that framework's competencies. Validating the remaining soft references would add a lookup per write for little benefit; the Employee is the validated anchor. Tightening is a later refinement behind the services (ADR-0032). | faculty-excellence services (`@knowget/faculty-excellence`) | later (goal/engagement reference validation) |
| TD-34 | Cross-repository atomicity of payment **clearing/refund** in financial: `PaymentService.clear`/`refund` write both the payment and its invoice without a shared transaction or optimistic lock. The **apply-before-persist ordering makes the validation-failure path safe** (a rejected application leaves the payment untouched), and payment amounts are per-invoice-capped, but a mid-operation infrastructure failure or a concurrent clear of the same pending payment can desync the `(payment, invoice)` pair or double-apply. A unit-of-work transaction spanning the two repositories, or an idempotency key recording which payment ids an invoice has applied, would close the window (ADR-0033). Separately, the **pay scale** (grade/band → earnings) is composition-root configuration, empty by default — an unconfigured grade returns 404 from the payslip-from-employee endpoint until configured; a managed salary-structure aggregate is a later refinement. | `PaymentService` (`@knowget/financial`); pay scale (`apps/api` composition root) | later (unit-of-work / idempotency; salary-structure aggregate) |
| TD-35 | The `@knowget/resource` **money core is a deliberate self-contained copy** of the Finance money engineering (integer minor units, half-away-from-zero rounding, currency guards), because the domain architecture (ADR-0010) forbids one domain package depending on another (`@knowget/resource` must not import `@knowget/financial`). Extracting a shared, neutral **`@knowget/money`** package that both domains depend on is the clean resolution; duplicating the small, stable core now — rather than coupling two bounded contexts — is the correct trade-off. Both copies are pure and independently tested, so callers are interface-protected (ADR-0034). | `money.ts` (`@knowget/resource`, `@knowget/financial`) | later (extract shared `@knowget/money`) |
| TD-36 | Two **status-scoped uniqueness** invariants in transport — a single **active** vehicle assignment per route (`VehicleAssignmentService.create` via `findActiveByRoute`), and a single **open** subscription per student+route (`TransportSubscriptionService.request` via `findOpenByStudentAndRoute`) — are enforced in the service (check-then-act), with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_ uniques (vehicle registration, driver licence and employee, route code, one document per (vehicle, type), one profile per route) all have DB `@@unique` indexes. A **partial** unique index (required because ended/retired rows retain their route/student values) would backstop each (ADR-0035). Mirrors TD-24/TD-26. | `VehicleAssignmentService` / `TransportSubscriptionService` (`@knowget/transport`) | later (partial unique indexes) |
| TD-37 | Two **status-scoped uniqueness** invariants in residential — a single **active** bed allocation per bed (`BedAllocationService.create` via `findActiveByBed`), and a single **active** allocation per student (via `findActiveByStudent`) — are enforced in the service (check-then-act), with no DB backstop, so concurrent writes have a TOCTOU window. (The one-open-outpass-per-resident guard is similarly service-enforced via `findOpenByStudent`.) The domain's _absolute_ uniques (hostel code, one warden per employee, room number per hostel, one inspection per (hostel, type), one profile per hostel) all have DB `@@unique` indexes. A **partial** unique index (required because ended rows retain their bed/student values) would backstop each (ADR-0036). Mirrors TD-26/TD-36. | `BedAllocationService` / `OutpassService` (`@knowget/residential`) | later (partial unique indexes) |
| TD-38 | Three **status-scoped uniqueness** invariants in library — a single **active** loan per copy (`LoanService.issue` via `findActiveByCopy`), a single **open** reservation per member+title (`ReservationService.place` via `findOpenByMemberAndTitle`), and a single **active** circulation policy per organization (`CirculationPolicyService.activate` via `findActiveByOrganization`) — are enforced in the service (check-then-act), with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_ uniques (ISBN, barcode, membership number, one membership per (person, org), one profile per org) all have DB `@@unique` indexes. A **partial** unique index (required because returned/lost/cancelled/archived rows retain their copy/member/title/org values) would backstop each (ADR-0037). Mirrors TD-26/TD-36/TD-37. | `LoanService` / `ReservationService` / `CirculationPolicyService` (`@knowget/library`) | later (partial unique indexes) |
| TD-39 | Two **status-scoped uniqueness** invariants in health-centre — a single **active** sick-bay admission per (centre, bed), and a single **active** admission per patient — are enforced in `AdmissionService.admit` (check-then-act via `findActiveByBed` / `findActiveByPatient`), alongside a sick-bay **capacity** guard, with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_ uniques (centre code, one clinician per employee, one profile per centre) all have DB `@@unique` indexes. A **partial** unique index (required because discharged rows retain their bed/patient values) would backstop each (ADR-0038). Mirrors TD-36/TD-37/TD-38. | `AdmissionService` (`@knowget/health-centre`) | later (partial unique indexes) |
| TD-40 | Two **status-scoped uniqueness** invariants in facilities — a single **active** sensor per (space, metric) (`SensorService.install`/`reactivate` via `findActiveBySpaceAndMetric`), and a single **active** comfort policy per organization (`ComfortPolicyService.activate` via `findActiveByOrganization`) — are enforced in the service (check-then-act), with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_ uniques (building code, space + facility-system code per building, sensor + maintenance-order code, one profile per building) all have DB `@@unique` indexes. A **partial** unique index (required because inactive/retired sensors and archived policies retain their space/metric/org values) would backstop each (ADR-0039). Mirrors TD-37/TD-38/TD-39. | `SensorService` / `ComfortPolicyService` (`@knowget/facilities`) | later (partial unique indexes) |
| TD-41 | Zone **occupancy capacity is advisory, not enforced** in campus-security: `VisitService.checkIn` does not reject a check-in when a zone is at or over its `capacity`. The presence engine _derives_ an `overCapacity` signal (surfaced on the zone-presence view and the safety profile's `over_capacity` flag) for monitoring, but the write path does not block — **deliberate**, because a physical-safety system must record a person who is actually present and must never impede egress (a capacity of 0 means untracked/no limit). A hard occupancy cap is therefore offered as an **opt-in** refinement behind the service, not a default (ADR-0040). Note: unlike TD-36…TD-40, this domain carries **no status-scoped uniqueness TOCTOU debt** — all its uniques (zone/visitor/credential/incident/drill codes per tenant, one profile per zone) are **absolute and DB-backed**, and the access-event log is append-only. | `VisitService` (`@knowget/campus-security`) | later (opt-in hard occupancy cap) |
| TD-42 | An audience's **member Person ids are stored as an opaque JSONB set and are not per-item existence-validated** on write in engagement (`AudienceService.create`/`addMembers`), because an audience may hold thousands of members — validating each would add a directory call per element per write. The **Organization is the validated anchor**, and thread participants (a small explicit set) _are_ validated on write. The audience size (member count) drives the reach/response engines, so a stale id inflates a denominator but breaks no invariant. Tightening audience membership to validate each id is a later refinement behind the service (ADR-0041). Mirrors TD-29/TD-30/TD-31 (the array-cross-reference family). Note: like P2-D21 and unlike D16–D20, this domain carries **no status-scoped uniqueness TOCTOU debt** — all its uniques (audience code; one ack per (announcement, person); one identified response per (survey, respondent), NULL-distinct; one profile per audience) are **absolute and DB-backed**. | `AudienceService` (`@knowget/engagement`) | later (per-item audience-member validation) |
| TD-43 | **Seat capacity is advisory, not enforced** in admissions: `EnrollmentConfirmationService.confirm` does not reject a confirmation when a grade's confirmed enrollments reach or exceed its declared `capacity`. The intake engine _derives_ an `overSubscribed`/`remaining` signal (surfaced on the per-grade intake view and the funnel profile's fill percent) for monitoring, but the write path does not block — **deliberate**, because admissions routinely over-offer against expected melt (a capacity of 0 means untracked/no limit). A hard seat cap is therefore offered as an **opt-in** refinement behind the service, not a default (ADR-0042). Mirrors TD-41 (the advisory-signal family). Note: like P2-D21/P2-D22 and unlike D16–D20, this domain carries **no status-scoped uniqueness TOCTOU debt** — all its uniques (campaign/lead/cycle/application code per tenant; one offer per application; one enrollment per offer; one profile per cycle) are **absolute and DB-backed**. | `EnrollmentConfirmationService` (`@knowget/admissions`) | later (opt-in hard seat cap) |

No `TODO` markers exist in the codebase; deferrals are tracked here instead.
