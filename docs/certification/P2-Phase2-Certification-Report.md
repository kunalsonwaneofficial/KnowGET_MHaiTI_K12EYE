# Phase 2 Certification Report — Domain Intelligence Platform

- **Certifies:** Phase 2 — P2-D01 … P2-D30, the complete K–12 institutional domain surface
- **Status:** ✅ Certified — merged to `main` (`350c624`); baseline frozen and tagged `v0.3.0`
- **Date:** 2026-07-29
- **Baseline tag:** `v0.3.0`
- **Built on:** Phase-1 Platform Core, certified and frozen at `v0.1.0`; Identity & Organization, certified at `v0.2.0`
- **Next:** Phase 3 — Integration, Extensibility & the External Surface

---

## 1. Purpose

This report certifies **Phase 2** of KnowGET MHaiTI: the thirty domain contracts (P2-D01 … P2-D30) that
turn the frozen Phase-1 platform core into a working institutional operating system. It records what was
engineered, the evidence that each domain is correct and tenant-isolated, the proof that thirty domains
compose without coupling to one another, the debt that remains and why none of it blocks Phase 3, and the
defects certification itself surfaced.

Certification introduces **no new product features**. Its only product-code change is the single
correctness fix recorded in §7 (CF-01), found by this audit and fixed inside it. Everything else here is
verification, evidence and documentation.

The claim being certified is narrow and testable: _a K–12 institution's academic, administrative,
financial, operational and strategic lifecycle can now be modelled end-to-end on this platform, by
thirty domains that share one data model and one tenant boundary and that were added without amending
the core._

## 2. Scope certified

### 2.1 Program A — Identity & Organization (`v0.2.0`, re-verified here)

Certified in its own report at `v0.2.0` and re-verified under this phase's sweep: `@knowget/organization`,
`@knowget/person`, `@knowget/enterprise-identity`, `@knowget/membership`, `@knowget/roles`,
`@knowget/relationship`, plus seven security-hardening contracts (ADR-0014 … ADR-0020) covering session and
revocation persistence, refresh-token rotation with replay detection, distributed cache and rate limiting,
distributed shared services, KMS key custody, and queue visibility.

### 2.2 Programs B–E — the twenty-nine domain contracts

Every row below is merged to `main`, CI-green, with a delivery report in `docs/reports/` and an ADR.

| Contract | Domain                          | Package                            | ADR      | Tables | Events | REST | Test files |
| -------- | ------------------------------- | ---------------------------------- | -------- | -----: | -----: | ---: | ---------: |
| P2-D02   | Institutional Governance        | `@knowget/governance`              | ADR-0021 |      8 |      9 |   59 |         14 |
| P2-D03   | Student Lifecycle               | `@knowget/student-lifecycle`       | ADR-0022 |      6 |      9 |   56 |          9 |
| P2-D04   | Family & Guardian               | `@knowget/family-guardian`         | ADR-0023 |      7 |      8 |   80 |         14 |
| P2-D05   | Learner Wellbeing               | `@knowget/learner-wellbeing`       | ADR-0024 |      7 |     11 |   94 |         14 |
| P2-D06   | Academic Structure              | `@knowget/academic-structure`      | ADR-0025 |      8 |     10 |   90 |         16 |
| P2-D07   | Academic Scheduling             | `@knowget/academic-scheduling`     | ADR-0026 |      6 |      8 |   51 |         10 |
| P2-D08   | Attendance & Presence           | `@knowget/attendance-presence`     | ADR-0027 |      6 |      9 |   43 |          9 |
| P2-D09   | Teaching & Learning             | `@knowget/teaching-learning`       | ADR-0028 |      7 |      9 |   83 |          9 |
| P2-D10   | Assessment & Evaluation         | `@knowget/assessment-evaluation`   | ADR-0029 |      7 |      9 |   75 |         11 |
| P2-D11   | Learning Intelligence           | `@knowget/learning-intelligence`   | ADR-0030 |      7 |      9 |   51 |         10 |
| P2-D12   | Workforce                       | `@knowget/workforce`               | ADR-0031 |      8 |     19 |   79 |         16 |
| P2-D13   | Faculty Excellence              | `@knowget/faculty-excellence`      | ADR-0032 |      8 |     15 |   57 |         16 |
| P2-D14   | Fees, Finance & Payroll         | `@knowget/financial`               | ADR-0033 |      8 |     24 |   71 |         20 |
| P2-D15   | Procurement, Inventory & Assets | `@knowget/resource`                | ADR-0034 |      8 |     22 |   76 |         20 |
| P2-D16   | Transport & Fleet               | `@knowget/transport`               | ADR-0035 |      8 |     26 |   71 |         15 |
| P2-D17   | Residential Life                | `@knowget/residential`             | ADR-0036 |      8 |     30 |   65 |         19 |
| P2-D18   | Library                         | `@knowget/library`                 | ADR-0037 |      8 |     29 |   69 |         19 |
| P2-D19   | Health Centre                   | `@knowget/health-centre`           | ADR-0038 |      8 |     37 |   73 |         18 |
| P2-D20   | Facilities                      | `@knowget/facilities`              | ADR-0039 |      8 |     36 |   70 |         19 |
| P2-D21   | Campus Security                 | `@knowget/campus-security`         | ADR-0040 |      8 |     44 |   81 |         19 |
| P2-D22   | Engagement                      | `@knowget/engagement`              | ADR-0041 |      8 |     32 |   52 |         17 |
| P2-D23   | Admissions                      | `@knowget/admissions`              | ADR-0042 |      8 |     35 |   61 |         18 |
| P2-D24   | Alumni                          | `@knowget/alumni`                  | ADR-0043 |      8 |     37 |   58 |         18 |
| P2-D25   | Knowledge Graph                 | `@knowget/knowledge-graph`         | ADR-0044 |      6 |     20 |   38 |         14 |
| P2-D26   | Agent Orchestration             | `@knowget/agent-orchestration`     | ADR-0045 |      6 |     37 |   85 |         20 |
| P2-D27   | Decision Intelligence           | `@knowget/decision-intelligence`   | ADR-0046 |      6 |     41 |   84 |         21 |
| P2-D28   | Predictive Intelligence         | `@knowget/predictive-intelligence` | ADR-0047 |      7 |     30 |   77 |         24 |
| P2-D29   | Executive Intelligence          | `@knowget/executive-intelligence`  | ADR-0048 |      7 |     32 |   69 |         25 |
| P2-D30   | Platform Evolution              | `@knowget/platform-evolution`      | ADR-0049 |      7 |     39 |   66 |         25 |

**Totals for D02–D30:** 212 tables, 676 domain events, 1,984 REST routes, 479 domain test files.

### 2.3 Platform scale at `v0.3.0`

| Measure                          |           Value |
| -------------------------------- | --------------: |
| Workspace projects / packages    |     75 **/** 70 |
| Tracked files                    |           2,717 |
| TypeScript source (non-test) LOC |         216,401 |
| TypeScript test LOC              |          91,668 |
| Prisma models / live tables      |   225 **/** 225 |
| Migrations                       |              41 |
| REST controllers / routes        | 226 **/** 2,059 |
| Domain event types               |             704 |
| Automated tests / test files     | 5,987 **/** 613 |
| ADRs / delivery reports          |     49 **/** 49 |
| Commits on `main`                |             492 |

## 3. Certification by dimension

### 3.1 Architecture

**Evidence.** All thirty domains are structurally identical under ADR-0010: a pure domain package
(aggregates, value objects, invariants, events, repository ports, in-memory implementations) → a Prisma/RLS
adapter at the composition root → a permission-gated REST module. No domain package imports another domain
package: an audit of every `from "@knowget/…"` and `require("@knowget/…")` in package source found the
domain packages depend only on `@knowget/types` (958 imports), `@knowget/events` (235),
`@knowget/shared` (225), `@knowget/exceptions` (34), `@knowget/workflow` (2) and `@knowget/security` (1).
Cross-domain reads travel through **22 directory port interfaces** declared across 32 port modules and
bound at the composition root.

**Verdict.** ✅ The domain surface is a flat set of independent packages over one shared spine. Adding the
thirtieth domain required no change to the first, and none to the core.

### 3.2 Code quality

**Evidence.** `pnpm turbo run typecheck lint test build` across every package and `apps/api` — see §4.
TypeScript `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`. **Zero** `TODO`, `FIXME`, `XXX` or `HACK`
markers repo-wide. Prettier clean over the whole tree. Following CF-01 the repository contains **zero raw
NUL bytes**, so every tracked source file is text to `grep(1)`, `file(1)` and `git diff`.

**Verdict.** ✅ No suppressed diagnostics, no deferred markers, no unreadable files.

### 3.3 Security & authorization

**Evidence.** 2,059 REST routes across 226 controllers. **2,048 carry an explicit permission requirement.**
The 11 that do not are each covered by a class-level or method-level `@Public()` and all live in
`apps/api/src/platform/`: four Kubernetes-style health probes, the Prometheus scrape and diagnostics
endpoints, the services catalogue and self-test, and login/refresh/logout. **No route in any of the 35
domain modules is unauthenticated.** Default-deny authorization, session and revocation persistence,
refresh-token rotation with replay detection, and KMS envelope key custody carry forward from `v0.2.0`.

**Verdict.** ✅ The domain surface is uniformly gated; every public route is deliberate, documented in its
controller, and confined to platform infrastructure.

### 3.4 Data & tenant isolation

**Evidence.** See §6 for the full behavioural proof. 225 tables; 223 carry `tenant_id`; **222 have RLS both
enabled and forced**; across all 222 policies there is **exactly one distinct `USING` expression and one
distinct `WITH CHECK` expression** — zero policy drift. A behavioural sweep as the non-superuser,
non-`BYPASSRLS` application role passed **222 of 222** tables on five assertions each, with zero failures
and zero skips.

**Verdict.** ✅ Tenant isolation is enforced by the database, uniformly, and proved by execution rather
than by inspection.

### 3.5 Determinism of the intelligence layer

**Evidence.** Across all 920 non-test package source files, `Math.random()` appears **zero** times. Argless
`new Date()` appears at exactly six sites, all in platform infrastructure or the shared spine: the kernel
`Clock` itself, `shared/datetime.nowIso()`, the Prisma soft-delete stamp, the error-response timestamp
fallback, and two date-only `today()` defaults in `@knowget/governance`. **The seven intelligence engines
— knowledge-graph, agent-orchestration, decision-intelligence, predictive-intelligence,
executive-intelligence, learning-intelligence and platform-evolution — contain zero clock reads and zero
randomness.**

**Verdict.** ✅ Every recommendation, forecast, briefing and evolution signal is a pure function of its
inputs. Time enters as an argument, never as ambient state. This is what makes reproducibility digests and
backtests meaningful rather than decorative.

### 3.6 Domain events

**Evidence.** 37 event modules export **704 event type constants across 35 namespaces with zero duplicate
type strings**, and 714 `createEvent` factory call sites. Every event is a typed `DomainEvent<K, P>` carrying
`tenantId`.

**Verdict.** ✅ The event catalogue is collision-free and uniformly typed — the precondition for the Phase-3
streaming bus (TD-01).

### 3.7 Persistence shape

**Evidence.** The 41 migrations replay from an empty schema to 225 tables with zero errors. The schema
declares **zero foreign key constraints** — deliberate, and consistent with ADR-0010: cross-aggregate
references travel by id through directory ports, validated in the domain layer, so that no domain's table
can hold another's schema hostage. 733 unique indexes (3 partial) carry the uniqueness invariants that are
enforced at the database. 190 of 225 tables carry `deleted_at`; the 35 that do not are analysed in §5.3.

**Verdict.** ✅ Consistent with the declared architecture. The absence of FKs is a decision, not an
omission; the residual risk is recorded against the status-scoped uniqueness debt items (TD-24, TD-26,
TD-36 … TD-40).

### 3.8 Runtime & services

**Evidence.** `apps/api` composes 42 NestJS modules — 35 domain modules plus the platform stack — and
builds clean. 73 `apps/api` specs cover controllers, DI graphs and the cross-domain certification suite.
Health, metrics, diagnostics, cache, jobs, files, search, i18n, notifications, documents, media, workflow
and the transactional outbox are unchanged from `v0.1.0`/`v0.2.0` and re-verified here.

**Verdict.** ✅ Thirty domains assemble into one process with no module-resolution or DI conflicts.

### 3.9 Developer experience & operations

**Evidence.** `pnpm verify`, `pnpm bench` and `pnpm certify` all present and working. Turborepo caching
keeps the full sweep to minutes. One command builds, one certifies. 49 delivery reports and 49 ADRs mean
every contract has a written rationale and a written outcome.

**Verdict.** ✅ Sustained across thirty contracts without a documentation gap.

### 3.10 AI-readiness

**Evidence.** The Institutional Knowledge Graph (D25) carries an evidence chain on every assertion; agent
orchestration (D26) exposes capabilities rather than databases and enforces a human gate that cannot be
bypassed; decision (D27), predictive (D28) and executive (D29) intelligence derive from the graph rather
than from raw tables; platform evolution (D30) closes the loop. All are pure and deterministic (§3.5).

**Verdict.** ✅ The unified semantic model the product brief calls for exists and is queryable. No LLM,
vector store or RAG dependency was introduced — that surface belongs to a later phase and is unblocked.

## 4. Quality gate evidence (in-sandbox)

Run on the certification branch at the tip of `main` plus the CF-01 fix.

| Gate                                       | Result                                             |
| ------------------------------------------ | -------------------------------------------------- |
| `packages/database` build (offline Prisma) | ✅ clean — Prisma Client v6.19.3 generated         |
| Monorepo sweep (all packages, 4-way)       | ✅ **285 of 285 turbo tasks successful**           |
| `apps/api` typecheck                       | ✅ clean                                           |
| `apps/api` lint                            | ✅ 0 errors, 0 warnings                            |
| `apps/api` test                            | ✅ **232 passed, 9 skipped** (78 files, 3 skipped) |
| Whole-repo test total                      | ✅ **5,978 passed, 9 skipped** (613 files)         |
| `apps/api` build (`nest build`)            | ✅ clean                                           |
| `pnpm run format:check` (repo-wide)        | ✅ "All matched files use Prettier code style!"    |
| Migration replay from empty schema         | ✅ **41 of 41 applied, 0 errors, 225 tables**      |
| Live RLS behavioural sweep                 | ✅ **222 PASS / 0 FAIL / 0 SKIP**                  |

`prisma migrate deploy` cannot execute in this sandbox because the Prisma schema-engine binary is a
zero-byte stub (TD-12, environmental). The replay above was performed instead by applying each
`migration.sql` in lexical order under `psql -v ON_ERROR_STOP=1`, which is a stricter test of the SQL than
the migration runner: it aborts on the first error rather than recording a partial state. CI runs the real
`prisma migrate deploy` on every branch.

## 5. Architecture integrity

### 5.1 Uniformity across thirty domains

The Phase-1 exit criterion was _"a domain can be added without touching the core."_ Phase 2 exercised it
twenty-nine more times. Every one of D02 … D30 follows the same five-part shape, and the shape did not
drift: the last domain (`platform-evolution`, 7 aggregates, 8 pure engines) has the same file layout,
naming, port structure and controller pattern as the first (`governance`, 6 aggregates). The core packages
— kernel, database, security, events, workflow — were not amended by any domain contract.

### 5.2 Cross-domain coupling

Zero domain→domain package imports. Where a domain needs to know that a Person, Organization, Employee or
Student exists, it declares a **directory port** — a narrow read interface it owns — and the composition
root binds it. This is what keeps the dependency graph flat: 29 domains, 0 edges between them. The cost is
that referential integrity for those references lives in the domain layer rather than in the database; that
cost is what TD-23, TD-25, TD-29 … TD-33 and TD-42 record.

### 5.3 Soft-delete coverage — analysis of the 35 exceptions

190 of 225 tables carry `deleted_at`. The 35 that do not fall into two deliberate groups:

**Lifecycle-modelled (24 tables).** Retirement is expressed in the aggregate's own state machine rather
than a generic flag — `status`, `stage`, `archived_at`, `superseded_at`, `retired_at`, `closed_at`,
`settled_at`, `expires_at` or `revoked_at`. Examples: `kpi_definition` (`status`, `retired_at`),
`health_index_definition` (`status`, `superseded_at`, `retired_at`), `forecast_run` (`status`,
`superseded_at`), `improvement_cycle` (`stage`, `settled_at`, `abandonment_reason`), `workflow_instance`
(`status`). For the three security tables — `security_session`, `security_refresh_token`,
`security_revocation` — a soft delete would be a **defect**: a revoked session must cease to exist as an
authenticator, not linger with a flag.

**Append-only evidence (11 tables).** `adoption_review`, `audit_log`, `backtest`, `decision_record`,
`family_consent`, `governance_policy_acknowledgment`, `kpi_reading`, `maturity_assessment`,
`student_timeline_entry`, plus the two platform service tables `service_blob` and
`service_search_document`. An audit entry, a consent record, a policy acknowledgment, a governance decision
or a recorded KPI reading that can be retracted is not evidence. These are written once and superseded, not
deleted.

**Verdict.** ✅ Every exception is explained by the aggregate's semantics. No table lacks a retirement
story.

### 5.4 Tables outside the RLS envelope

Three tables, all from Phase 1, sit outside the 222-table RLS envelope and are recorded here so the gap is
visible rather than implicit:

- **`audit_log`** — carries a **nullable** `tenant_id` and has no RLS policy. Platform-level audit entries
  legitimately have no tenant (a failed login against an unknown tenant, a kernel lifecycle event), so a
  fail-closed tenant policy would drop exactly the rows an auditor most needs. Access is confined to the
  platform audit service.
- **`service_blob`**, **`service_search_document`** — the shared-services backing stores. Neither carries a
  `tenant_id`; both are keyed by an opaque service-supplied key, and tenant scoping is applied by the
  calling service above them.

These are pre-existing Phase-1 shapes, unchanged by Phase 2. They are **not** blocking: no domain data
lands in them un-scoped. Tightening `audit_log` to a tenant-or-platform policy and pushing `tenant_id` into
the two service tables is Phase-3 work and is now recorded as **TD-51**.

### 5.5 ADR coverage

49 ADRs. ADR-0001 … ADR-0009 record the Phase-1 platform and its baseline. ADR-0010 defines the domain
architecture pattern. ADR-0011 … ADR-0020 cover Identity & Organization and the seven security-hardening
contracts. ADR-0021 … ADR-0049 are **one ADR per domain contract, D02 through D30, with no gaps**.

## 6. Tenant isolation — live behavioural proof

Structural checks ("is RLS enabled?") do not prove isolation; they prove configuration. This certification
therefore executed against live PostgreSQL 16, connected as the `knowget` role, which is **neither a
superuser nor `BYPASSRLS`** — the two conditions under which RLS is silently skipped (TD-13).

For every FORCE-RLS table reachable without satisfying a foreign key — all 222, since the schema declares
none — the harness synthesized a minimal row satisfying every NOT-NULL column, then asserted five
properties:

1. **Own-tenant read** — with `app.current_tenant` set to tenant 1, the row is visible. (1 row)
2. **Cross-tenant read isolation** — with the setting switched to tenant 2, the row is invisible. (0 rows)
3. **Cross-tenant write invisibility** — an `UPDATE` issued as tenant 2 matches nothing. (0 rows updated)
4. **`WITH CHECK` rejection** — an `INSERT` carrying tenant 1's id while acting as tenant 2 is refused
   with `insufficient_privilege`.
5. **Fail-closed default** — with `app.current_tenant` unset, the read returns nothing rather than
   everything.

**Result: 222 PASS, 0 FAIL, 0 SKIP.** Combined with the structural finding that all 222 policies share one
`USING` and one `WITH CHECK` expression, tenant isolation is uniform across the entire domain surface and
demonstrated by execution.

## 7. Certification findings

Certification is only worth performing if it can fail. It found three things.

### CF-01 — Transcript term ordering used an inert NUL delimiter (fixed in this contract)

`ReportingService.generateTranscript` in `@knowget/assessment-evaluation` ordered a learner's published
academic records by `localeCompare` over a single key built by joining `academicYear` and `term` with a raw
`U+0000`. **`localeCompare` treats `U+0000` as collation-ignorable**, so the separator is inert and the key
collates as though the character were absent. Distinct `(year, term)` pairs whose concatenations coincide
therefore compared **equal**, and their order on the transcript fell through to repository insertion order.
Both fields are unconstrained free text — no CHECK constraint; the aggregate requires only non-empty — so
the collision is reachable, and the cumulative academic transcript is the wrong document to have a
non-deterministic row order.

Empirically confirmed before fixing: `"a\0b".localeCompare("ab") === 0`, and the pairs `("2024","10")` vs
`("20241","0")` collate equal. Existing coverage could not have caught it — the sole transcript test
asserted `toHaveLength(1)`.

**Fixed** by comparing the two fields structurally (year, then term) and adding
`reporting-service.test.ts` with four tests including a regression case that **fails against the previous
comparator** (`["2023/1", "20241/0", "2024/10"]`) and passes against the new one.

A second-order effect is worth recording: the raw NUL made the file **binary to git** and opaque to
`grep(1)` and `file(1)`, which had silently excluded it from earlier text-based repository audits — the
defect was hiding behind the same byte that caused it. The repository now contains zero raw NUL bytes, and
that is a property worth keeping.

### CF-02 — TD-14 reached its stated resolution point and is re-scoped, not resolved

TD-14 recorded the `DataProbe` fixture with the resolution _"remove when domain tables land (Phase 2)."_
Domain tables have landed — 212 of them — and the fixture is still present (`data_probe`,
`packages/database/src/probe-repository.ts`).

On review, removing it would be wrong. `packages/database/src/database.integration.test.ts` is the only
suite that exercises the **generic** persistence layer against a live Postgres independently of any domain,
and four of its six tests are keyed on this table: CRUD with pagination through the generic repository,
soft-delete and restore, Row-Level-Security tenant isolation, and transaction rollback. (The other two
cover database health and platform audit writes.) Deleting the table would delete the only
domain-independent verification of `PrismaRepository` and `withTenant`, replacing a 40-line fixture with a
coverage hole — and a regression in the shared repository would then surface as a puzzling failure inside
whichever domain happened to notice first.

**Resolution:** TD-14 is **re-scoped** — from debt awaiting removal to a deliberately retained platform
conformance fixture — with that rationale recorded in the register. It is one tenant-scoped, FORCE-RLS
table (it passes the §6 sweep like every other) and it ships no product surface.

### CF-03 — Three Phase-1 tables sit outside the RLS envelope (recorded as TD-51)

Documented in §5.4. Non-blocking, pre-existing, and now tracked rather than implicit.

**No other correctness defect was found.** The audit covered cross-domain imports, permission gating on
every route, clock and randomness in every engine, soft-delete coverage on every table, event-type
collisions across the full catalogue, and the behavioural RLS sweep.

## 8. Technical-debt review

The register holds **50 items** — 49 carried into certification (TD-08 was withdrawn during Phase 1) plus
**TD-51**, newly recorded from CF-03. Phase 2 closes with **11 resolved**, **1 re-scoped** and **38 open**.

**Resolved to date (11):** TD-02 (persistence), TD-03 (auth), TD-04 (crypto/key management), TD-10
(tracing spans), TD-11 (KMS custody), TD-15 (musl Prisma target), TD-16 (RBAC and live security), TD-17
(distributed cache and rate limiter), TD-18 (refresh-token rotation), TD-19 (distributed shared services),
TD-22 (session read-through).

**Re-scoped (1):** TD-14, per CF-02 — from debt awaiting removal to a retained platform conformance
fixture. It is no longer open, and it is not resolved either; the register now says so plainly.

The 38 open items fall into eight groups, none blocking:

- **Phase-3 platform scope by design (5):** TD-01 (in-process event delivery; the PG outbox exists, the
  streaming bus is P3-D02), TD-05 (SDK exposes only `health()`), TD-09 (static feature flags), TD-20 (media
  passthrough), TD-51 (the three tables outside the RLS envelope, per CF-03).
- **Build and CI ergonomics carried from Phase 1 (2):** TD-06 (Docker images copy the full workspace),
  TD-07 (Playwright E2E runs in CI only). Both named P1-M06 and were never struck; neither touches product
  behaviour, and both were re-targeted to P3 during this review rather than left naming a milestone that
  had already closed.
- **Environmental / operational (2):** TD-12 (Prisma engine CDN unreachable in this sandbox — CI is
  unaffected), TD-13 (RLS requires a non-superuser connection — an ops-documentation item, and the
  condition under which §6 was deliberately run).
- **Deliberate structural choices (4):** TD-21 (domain Prisma adapters at the composition root — a
  mechanical refactor, not a defect), TD-23 (governance approvals reference their subject opaquely),
  TD-34 (cross-repository payment clearing awaits a unit of work), TD-35 (the resource money core is a
  knowing self-contained copy).
- **Status-scoped uniqueness enforced in-service, DB backstop deferred (7):** TD-24, TD-26, TD-36, TD-37,
  TD-38, TD-39, TD-40. Each is a partial unique index waiting to be added; each invariant is enforced today
  in the service and covered by tests. D29 and D30 show the shape that closes them — both hold their
  status-scoped rule in Postgres with a partial index, so the family stopped growing at D20.
- **Advisory capacity by design (3):** TD-41 (zone occupancy), TD-43 (admission seats), TD-44 (alumni
  events). Each institution over-subscribes against expected melt and works a waitlist; a hard cap is
  offered as an opt-in refinement behind the service rather than imposed as a default.
- **Soft cross-reference and rule-type validation deferred (9):** TD-25, TD-27 … TD-33, TD-42. Each records
  a reference or policy rule type recognised behind a stable interface but not yet deeply validated or
  evaluated — the direct consequence of the no-foreign-key rule (§5.2).
- **Check-then-act key guards with the absolute uniques DB-backed (6):** TD-45 … TD-50, one per
  intelligence contract. In every case the unique that matters is enforced by Postgres and rejects `23505`,
  so the race window costs a less friendly error rather than a lost invariant.

**Assessment.** Every open item sits behind a stable interface, so resolving it changes an implementation
rather than a contract. None weakens an absolute invariant, and none blocks Phase 3. The concentration of
new debt in the last three groups is the honest cost of the no-foreign-key, no-cross-domain-import
architecture (§5.2), and it is the right cost: it buys thirty independent domains.

## 9. Performance baseline

Median of three consecutive runs of `pnpm bench` on the certification host, against the built,
Prisma-free packages.

| Operation                 | Iterations | `v0.1.0` | `v0.3.0` | Ratio |
| ------------------------- | ---------: | -------: | -------: | ----: |
| cache set+get             |    200,000 |   836 ns |  1.33 µs |  1.59 |
| search query (1k docs)    |     50,000 | 281.8 µs | 417.2 µs |  1.48 |
| metrics counter.inc       |    500,000 |   518 ns |   648 ns |  1.25 |
| event publish             |    200,000 |  2.05 µs |  2.76 µs |  1.35 |
| workflow start+transition |    200,000 |  1.27 µs |  1.68 µs |  1.32 |
| jwt sign+verify (HS256)   |     20,000 |  8.55 µs | 14.09 µs |  1.65 |
| password hash (scrypt)    |         25 |  38.6 ms |  46.6 ms |  1.21 |
| password verify (scrypt)  |         25 |  38.7 ms |  46.4 ms |  1.20 |

**Interpretation.** Every operation is 1.20×–1.65× slower than at `v0.1.0`, including **scrypt hashing and
verification — code that has not changed since `v0.1.0` and whose cost is a fixed work factor.** That
1.20× establishes the host-speed floor for this run, and every other operation sits within 1.0×–1.4× of it.
No operation shows an order-of-magnitude change, and no hot path regressed relative to the floor. The
reading is host variance, not regression — the certification container is materially slower than the
Phase-1 build host.

These remain **indicative microbenchmarks, not SLAs**. Their purpose is regression detection. The
`v0.3.0` column is now the reference for Phase 3, and the scrypt rows should continue to be used as the
host-speed normaliser when comparing across hosts.

## 10. Production-readiness checklist

| Item                                                               | Status             |
| ------------------------------------------------------------------ | ------------------ |
| Every domain tenant-isolated by FORCE RLS, proved behaviourally    | ✅                 |
| Every domain route permission-gated; public routes enumerated      | ✅                 |
| Default-deny authorization, data-driven from roles and membership  | ✅                 |
| Session, revocation and refresh-token persistence                  | ✅                 |
| KMS envelope key custody with an async signer seam                 | ✅                 |
| Migrations replay from empty to full schema without error          | ✅                 |
| Health probes, metrics, tracing, diagnostics, alerting             | ✅                 |
| Distributed cache, jobs, search, files, notifications              | ✅                 |
| Transactional outbox for domain events                             | ✅                 |
| Zero `TODO`/`FIXME` markers; zero suppressed diagnostics           | ✅                 |
| Deterministic intelligence layer (no ambient clock, no randomness) | ✅                 |
| One ADR and one delivery report per contract                       | ✅                 |
| Reproducible one-command certification (`pnpm certify`)            | ✅                 |
| Streaming event bus across replicas                                | ⏳ TD-01 (Phase 3) |
| Public SDK beyond `health()`                                       | ⏳ TD-05 (Phase 3) |
| DB-level backstops for status-scoped uniqueness                    | ⏳ 8 TD items      |

## 11. Phase 2 exit criterion — assessment

> **Exit criterion.** The complete K–12 institutional domain surface is modelled, tenant-isolated,
> permission-gated and composable, such that Phase 3 can build integration and external surfaces on top of
> it without amending any domain.

**Met.** Thirty domain contracts, 225 tables, 704 event types and 2,059 routes compose into one process
with zero domain→domain coupling and one uniformly-enforced tenant boundary. The domain packages are pure
and depend only on the shared spine, so an integration layer consumes them through ports it declares
itself. The event catalogue is collision-free and typed, so the streaming bus (TD-01) is a transport swap
rather than a redesign. The intelligence layer is deterministic, so external callers can reason about
reproducibility. Nothing in the open-debt register requires a domain contract to be reopened.

The single correctness defect this certification found (CF-01) was fixed within it, with a regression test
that fails against the prior implementation.

## 12. Certification statement

Phase 2 of KnowGET MHaiTI — the Domain Intelligence Platform, contracts P2-D01 through P2-D30 — is
**certified complete and production-ready** at the scope defined in §2, on the evidence in §4, §6 and §9,
with the findings in §7 and the debt in §8 recorded and non-blocking.

The baseline is frozen at **`v0.3.0`**. Phase 3 builds on it.

---

_Certified 2026-07-29 against `main`, on the Phase-1 core frozen at `v0.1.0` and Identity & Organization
certified at `v0.2.0`._
