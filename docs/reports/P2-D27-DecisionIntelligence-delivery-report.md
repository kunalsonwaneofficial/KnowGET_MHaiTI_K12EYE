# Engineering Delivery Report — P2-D27

**Institutional Decision Intelligence, Workflow Orchestration & Autonomous Operations** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D27 — Institutional Decision Intelligence, Workflow Orchestration & Autonomous Operations                                                                                                                                                                                                                                                                                |
| **Status**     | 🟡 Awaiting CI. In-sandbox: `@knowget/decision-intelligence` typecheck/lint/format/build clean, **750 tests** (21 files); `apps/api` typecheck/lint/build clean + decision-intelligence DI-graph spec (3 tests) in the **232-test** api suite. Full monorepo typecheck/lint/tests green (TD-12 on the Prisma build in-sandbox).                                             |
| **Depends on** | **P2-D25 (Institutional Knowledge Graph — evidence resolves against it)** and **P2-D26 (Enterprise AI Operating System — capabilities resolve against its catalog, and it is what actually invokes)**, P2-D01-M01 (Organization, via a directory port), the operational base **D01–D24**, P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). Third contract of **Program E** (D25–D30). |
| **Date**       | 28 December 2026                                                                                                                                                                                                                                                                                                                                                            |
| **Next**       | P2-D28 — Predictive Intelligence (fourth Program E contract)                                                                                                                                                                                                                                                                                                                |

---

## 1. Mission recap

Deliver the **decision layer** — the third contract of Program E, and the thing D25 and D26 were built for. D25
gave the institution a semantic memory; D26 gave it a governed AI runtime. D27 is what turns that knowledge into
**recommendations a person can weigh, decisions the institution can answer for, workflows that carry cases through
their stages, and standing automation that acts within a boundary**.

Three rules define the contract, and the whole of the engineering judgement here was to make each of them
**structural rather than procedural**: (1) **only low-risk actions auto-execute; high-risk actions require human
approval**, (2) **recommendations always ship with evidence chains**, (3) **automation carries
rollback/compensation**. A rule expressed as a review comment survives until someone is in a hurry; a rule
expressed as a constant, a constructor precondition or a derived value survives indefinitely.

So the design problem is **restraint, not capability**. The hard part is not making the platform able to act on
its own conclusions — it is making it structurally unable to act beyond what it can justify, undo, and be held to.
As with every domain here, the design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Six pure, deterministic, **clock-free** engines built and tested first: **autonomy** (`classifyAction` / `isAutoExecutable` / `requiresHumanApproval` / `isBlocked` / `blockingReasons` / `partitionByDisposition` — the contract's first rule), **evidence** (`inspectEvidenceChain` / `isChainGrounded` / `chainConfidence` / `graphRootIds` / `supportClosure` / `dependentClosure` — the second), **reversal** (`planReversal` / `isFullyReversible` / `irreversibleCompletedStageKeys` / `compensationStateFor` / `isCompensationOutstanding` — the third), **orchestration** (`inspectWorkflow` / `isPublishableWorkflow` / `stageExecutionLayers` / `instanceProgress` / `readyStageKeys` / `overdueStages`), **prioritization** (`priorityScore` / `rankRecommendations` / `summarizeBacklog`) and **metrics** (descriptive counts and rates only) |
| **Domain**      | `@knowget/decision-intelligence` — six aggregates: `Recommendation` (evidence chain refused at construction if it does not ground), `DecisionRecord` (separate aggregate, non-nullable `recommendationId`, decision-time snapshot), `Workflow` (**versioned** DAG definition with stages inside the aggregate), `WorkflowInstance` (one case, stage runs inside), `AutomationRule` (signal + conditions + one declared action + autonomy mode), `AutomationRun` (one firing, written **whatever the gate decided**, including a refusal); seven application services on the platform event bus, **41 `decision.*` events**, 64 typed errors. **No Prisma, no NestJS, no HTTP, no provider SDK, no `fetch`, no clock; prose- and PII-free events**                                                                                                          |
| **Persistence** | Six models in `schema.prisma` + one migration (`20261228000000_add_decision_intelligence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **four tables deliberately carry no soft-delete column** (recommendation, decision record, workflow instance, automation run — records of what was proposed, decided, run and refused); evidence, stages, stage runs, conditions and facts as JSONB; the two absolute uniques DB-backed (workflow `(tenant, key, version)`; rule `(tenant, key)`)                                                                                                                                                                                                                                                                                                             |
| **API**         | Six Prisma/RLS repositories + three directory adapters + **seven permission-gated controllers / 84 endpoints** under `apps/api/src/domains/decision-intelligence`, split `decision:manage` (governance) / `decision:operate` (runtime) / **`decision:decide` (the human answer, standing alone)** / `decision:read` (every read); all bodies zod-validated; module wires 6 repos + 3 directories + 7 services; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                                                                                              |

## 3. The three rules, as structure

**Only low-risk actions auto-execute.** `AUTO_EXECUTION_RISK_CEILING` is `low`, it is a constant beside the scale
it ranks, and **nothing in the package can raise it** — no tenant setting, no autonomy mode, no policy record. An
`AutonomyMode` (`propose_only → auto_with_approval → auto_execute`) is a **ceiling on ambition, never a grant**:
`auto_execute` only means the rule _asks_ to run unattended, and the gate still applies the risk ceiling, the
reversibility rule and the human-subject rule. The outcome is three-way — `auto_execute`, `requires_approval`,
`blocked` — with eight **stable reason codes**, and `BLOCKING_AUTONOMY_REASONS` refuse rather than gate: an
irreversible or uncompensated action is not something a person can wave through _as a standing automation_. The
risk vocabulary is deliberately the same as the P2-D26 capability catalog's, so the two gates cannot disagree
about what `high` means.

The rule then reaches the **record**, not only the gate. `recordDecision` refuses an `auto_executed` disposition
that names a decider, carries no evidence ids, lands on a subject declared to require human judgement, or whose
risk — **the worse of the recommendation's and the action's** — sits above the ceiling; and it refuses any
non-autonomous disposition with no decider at all. The gate would never have produced such a decision; this makes
one impossible to _write_, by a service that skipped the gate.

**Recommendations always ship with evidence chains.** `createRecommendation` inspects the chain and throws
`UngroundedRecommendationError` if it does not hold up — an ungrounded recommendation is not a bad record, it is
**not a record**. `EVIDENCE_SOURCES` is a two-member union, `knowledge_graph` and `reasoning_session`, both
upstream contracts of this same program, so the rule cannot degrade into citing a spreadsheet, a query or a
model's unsupported opinion. A chain must reach a graph root, supports must exist and must not cycle, and
confidence is an **integer 0–100 index capped by the weakest link**. Because `recommendationId` on a decision is
not nullable, every decision points **through** its recommendation at a grounded chain — there is no path for an
act to be taken and justified afterwards.

**Automation carries rollback/compensation.** `planReversal` reads what actually ran and produces the reversal in
reverse order; `compensationStateFor` derives a decision's or a run's compensation state from the action's
declared reversibility and how far execution got — never asserted — and `compensateDecision` refuses unless
compensation was genuinely available, so **a status update cannot stand in for the world being put back**. A
reversal that meets an irreversible step reports it as exactly that rather than continuing. And because
`compensation_not_declared` is a _blocking_ reason, an automation whose action cannot be undone never runs at
all: the rule is enforced at arming time, not only at cleanup time.

## 4. Authority — four scopes, and why `decision:decide` stands alone

`decision:manage` is governance: authoring, publishing and retiring workflow versions, drafting and arming
standing rules — everything an institution's processes are _allowed_ to become, decided ahead of time by people
who answer for the design. `decision:operate` is the runtime: raising recommendations, citing evidence, starting
cases, moving stages, dispatching signals, handing authorized actions on and recording reversals; it runs the
machinery and does not decide what the machinery may do. `decision:read` is every read, deliberately wide, because
automation an institution cannot look at is automation it has not really decided to run.

**`decision:decide` is separate and is implied by nothing.** Accepting or rejecting a recommendation, recording a
decision against one, and approving or refusing an automation firing all sit there. A platform where only
low-risk actions auto-execute has bought nothing if the operator who fired the rule can also clear the approval it
stopped for — the gate would record a signature and not a decision, which is the failure the first rule exists to
prevent. Separation of duty is the value, so it is a separate permission.

Accountable identity comes from the authenticated principal (`deciderOf`) at every accepting, deciding, approving
and cancelling endpoint and is **never read from a body** anywhere in this domain. **No endpoint accepts a script
or an executable payload**: a rule names a capability key, a risk level, a reversibility and a compensation key,
and actions and conditions are minted through the domain (`declareAction`, `declareCondition`) so the gate reads
the platform's declared shape rather than the request's. A rule that could carry executable intent would put the
gate on the wrong side of the thing it is gating. One deliberate asymmetry: the rule dry-run
(`POST decision/automation-rules/matching/:signalKey`) is `decision:read` despite being a POST — nothing is
written and nothing fires; the method is a POST only because the facts to evaluate against are a document rather
than a query string.

## 5. Workflows — checked before they carry cases

A workflow definition is a **DAG, not a list**. `ordinal` is reading order for a human, `dependsOn` is the real
order, and the two are allowed to disagree — which is the whole reason `inspectWorkflow` exists. It reports ten
stable issue codes, and two are deliberately distinct: `dependency_cycle` marks the stages actually in a loop (the
bug) while `unreachable_stage` marks what is merely downstream of one (the blast radius), because an author fixing
a definition needs to know which is which. Cycle detection settles **layer by layer** rather than recursing, so no
definition, however tangled, can hang the inspection meant to catch it.

Publication is the checkpoint. Instances running under a published version must keep meaning what they meant when
they started, and a cycle cannot be repaired in a workflow already carrying live cases — so editing a published
definition mints a **new version** and the old one keeps its instances. Stages live inside the workflow and stage
runs inside the instance for the same reason plan steps do in D26: every invariant worth having is an invariant
_across_ stages, and none of them is enforceable from a row that can be written on its own.

## 6. Quality gates

`@knowget/decision-intelligence`: typecheck / lint / format / build clean, **750 tests across 21 files** (six
engine suites, six aggregate suites, seven service suites, plus events and ports). `apps/api`: typecheck / lint /
build clean, decision-intelligence DI-graph spec (**3 tests** — the seven controllers, the seven exported service
tokens, and the three directories) in the **232-test** api suite (78 files, 3 skipped). Full monorepo typecheck /
lint / tests green (the Prisma build and the `@knowget/database` integration test are TD-12 in-sandbox). Repo-wide
`pnpm format:check` clean. Migration audited directly: all six tables `ENABLE` + `FORCE ROW LEVEL SECURITY` with
`tenant_isolation` (USING + WITH CHECK), both absolute uniques present, `deleted_at` on exactly the two aggregates
that have a discard path.

The DI-graph spec asserts the three **directories** bind, not only the services. A directory that silently failed
to bind would turn every "checked" in this domain into "assumed" — an unresolvable capability, an unverified
piece of evidence — while every other test still passed.

## 7. Boundaries & debt

- **D27 names capabilities; it never invokes them.** Execution is the P2-D26 runtime's, behind its plans,
  permissions and per-invocation human gate, and the capability's _implementation_ stays in the domain that owns
  it. The two gates share one risk vocabulary rather than two.
- **Evidence resolves against P2-D25 and P2-D26** — a two-member `EVIDENCE_SOURCES` union, resolved through the
  `EvidenceSourceDirectory` against the graph's entities, relationships and assertions and against the reasoning
  record. There is no vocabulary for another source.
- **Forecasting is P2-D28.** The metrics engine here is descriptive counts and rates only; `priorityScore` orders
  a backlog from declared facts and predicts nothing. Keeping that boundary clean is what lets D28 be an addition
  rather than a rewrite.
- **No domain→domain package import** (ADR-0010); the organization owner, the capability catalog and the evidence
  sources all enter through directory ports bound at the composition root.
- **TD-47 (new).** Three deferrals, none weakening an absolute invariant. (a) The rule-key and workflow-version
  guards are **check-then-act in the service** — both absolute uniques are **DB-backed** and reject `23505`, so a
  concurrent clash costs a less friendly error rather than a lost invariant. (b) **Signal dispatch is in-process**
  on the caller's thread: `fireOnSignal` lists the listening rules, matches them and fires each in turn, so a
  broad signal is a synchronous fan-out; queueing it belongs with the outbox work in TD-01. (c) **Execution
  dispatch is left to the D26 runtime and the owning domains** — the contract's own boundary rather than a
  shortcut: this contract governs whether an act may happen, on whose authority, with what grounds and what it
  would take to undo, not the call itself.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via the
  offline path; the six-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 41 `decision.*` events ride the same bus.

## 8. Outcome

The decision layer is complete behind its gates. The computational core is pure, deterministic and clock-free
(six engines, six aggregates, **750 tests**, no model, no clock, no network); the auto-execution risk ceiling is a
**constant no configuration can raise**; an **ungrounded recommendation cannot be constructed**; a decision record
**refuses to hold a decision the gate would not have produced**, so skipping the gate is an error rather than a
shortcut; **nothing irreversible or uncompensated is ever armed as automation**, and when an unwind is needed what
it takes is derived from what actually ran; workflows are checked before they carry cases and versioned so a fix
never rewrites the meaning of a case in flight; `decision:decide` stands alone so the operator who fired a rule
cannot clear the approval it stopped for; and all six tables are FORCE-RLS tenant-isolated, with four of them
deliberately carrying no soft-delete column because a recommendation, a decision, a case and a firing are the
record of what the institution proposed, decided, ran and refused.

Twelve increments, each verified and pushed. Next is **P2-D28 — Predictive Intelligence**, which is where
forecasting belongs. **Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not
yet been rotated across the P2-D18…D27 boundaries.
