# Engineering Delivery Report — P2-D26

**Enterprise AI Operating System, Agent Orchestration & Reasoning** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D26 — Enterprise AI Operating System, Agent Orchestration & Reasoning                                                                                                                                                                                                                                                                                                                                   |
| **Status**     | ✅ Merged to `main` (`8bf7ac9`, no-ff) after CI green. In-sandbox: `@knowget/agent-orchestration` typecheck/lint/format/build clean, **368 tests** (20 files); `apps/api` typecheck/lint/build clean + agent-orchestration DI-graph spec (2 tests) in the **220-test** api suite. Full monorepo typecheck/lint/tests green (**269** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox). |
| **Depends on** | **P2-D25 (Institutional Knowledge Graph — the sole source of retrieved knowledge)**, P2-D01-M01 (Organization, via a directory port), the operational base **D01–D24** whose capabilities agents invoke by key, P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). Second contract of **Program E** (D25–D30).                                                                                                         |
| **Date**       | 27 December 2026                                                                                                                                                                                                                                                                                                                                                                                           |
| **Next**       | P2-D27 — Decision Intelligence (third Program E contract)                                                                                                                                                                                                                                                                                                                                                  |

---

## 1. Mission recap

Deliver the **Enterprise AI Operating System** — **the AI runtime**, and the **second contract of Program E**:
the agent registry and what each agent may do, the capability catalog that says what each action costs,
**inspectable execution plans**, **permission-controlled tool invocation with rollback**, **enforceable human
approval**, and reasoning sessions that record how a conclusion was reached. Two contract rules define it, and
both are held structurally rather than by convention. **First, agents invoke capabilities, never databases
directly** — an agent's whole reach is a set of catalogued capability keys, and the package has no database
client, no HTTP client and no vocabulary for a query. **Second, knowledge retrieval originates from D25** —
`RETRIEVAL_SOURCES` is a one-member union (`["knowledge_graph"]`), so there is no word for another source. A
third boundary comes from the phase plan: **external AI providers are reached only through the Phase-3 AI
integration adapter (P3-D09)** — the AI OS never calls a provider itself, and holds no SDK to do it with. The
design problem the contract actually poses is **authority, not orchestration**: what may an agent do unattended,
on whose authority, what can be undone, and what is the evidence. Every answer is derived from declared facts, so
the design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Five pure, deterministic, clock-free engines built and tested first: **authorization** (`authorizeInvocation` / `isExecutable` / `isAllowedUnattended` / `requiresHumanApproval` / `denyingReasons` / `authorizeAll` / `unattendedCapabilities` — the autonomy × effect × risk × reversibility matrix, three-way outcome, stable reason codes), **planning** (`inspectPlan` / `highestRisk` / `nextExecutableSteps` / `planProgress` — a plan made inspectable before it moves), **reasoning** (`evidenceOf` / `evidenceChain` / `isTraceGrounded` / `groundSession` / `unsourcedRetrievalTraceIds` / `decisionConfidence` / `summarizeSession` — the session evidence chain, cycle-safe, weakest-support confidence), **rollback** (`compensationPlan` / `isFullyReversible` / `irreversibleInvocations` / `reversibleShare`), and **metrics** (descriptive counts only)       |
| **Domain**      | `@knowget/agent-orchestration` — six aggregates: `AgentDefinition` (autonomy + the granted capability keys that are its whole reach; `draft → active ↔ suspended → retired`), `ToolDefinition` (the **capability catalog**: effect, risk, reversibility, compensating capability, always-approve flag), `ExecutionPlan` (goal + ordered dependency-linked steps **inside the aggregate**), `ApprovalRequest` (the human gate, with subject, expiry, a recorded decider, and **single-use consumption** — `consumedAt` + `consumedByInvocationId`), `ToolInvocation` (created **only** authorized, `→ executing → succeeded \| failed`, settled writes `compensated`), `ReasoningSession` (purpose + ordered trace chain); seven application services on the platform event bus, **37 `ai.*` events**. **No provider SDK, no DB client, no `fetch`; prose- and PII-free events** |
| **Persistence** | Six models in `schema.prisma` + one migration (`20261227000000_add_agent_orchestration`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **three tables deliberately carry no soft-delete column** (approval, invocation, reasoning session — accountability records with no discard path); plan `steps` and session `traces` as JSONB, grants as TEXT[], confidence/ordinal/version as INTEGER; the absolute uniques DB-backed (agent key per tenant; capability key per tenant)                                                                                                                                                                                                                                                                                                                                             |
| **API**         | Six Prisma/RLS repositories + **seven permission-gated controllers / 85 endpoints** under `apps/api/src/domains/agent-orchestration`, split `agent:*` (registry + catalog governance) / `ai:read`+`ai:operate` (runtime) / `ai:approve` (the human gate alone); 31 request bodies all zod-validated; module wires 6 repos + 1 directory + 7 services; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 3. Authority — the two rules and the gate

**Agents invoke capabilities, never databases.** A grant names a capability _key_; a plan step names a key; an
invocation names a key. The catalog is the only thing that says what a key means and what it costs, and the
package holds no client of any kind with which to mean anything else. Verified by absence: no `@prisma`,
`PrismaClient`, `openai`, `anthropic`, `axios`, `node-fetch`, `langchain`, embedding, vector or `fetch(`
reference anywhere in the package; its only dependencies are `@knowget/types`, `@knowget/shared`,
`@knowget/exceptions`, `@knowget/events`.

**Knowledge comes from D25 alone.** `RETRIEVAL_SOURCES = ["knowledge_graph"]` is a one-member union; a
`retrieval` trace citing no knowledge reference is refused, a non-retrieval trace may not carry one, and the
derived kinds (`inference`, `decision`) must cite earlier steps — so a session's conclusion is grounded by
construction and `unsourcedRetrievalTraceIds` is what an auditor reads.

**The gate cannot be routed around.** Authorization is three-way: `allowed`, `requires_approval`, `denied`.
`DENYING_REASONS` (`agent_not_active`, `capability_not_granted`, `tool_not_active`) are **grant** failures and no
approval rescues them — approval raises a gate, it never mints authority. `MAX_UNATTENDED_RISK`
(`advisory: null`, `supervised: low`, `bounded: medium`, `autonomous: high`) and `UNATTENDED_EFFECTS`
(`advisory: []`, `supervised: ["read"]`) cap what runs unattended; **`critical` appears in no entry and an
irreversible action always needs a human**. Spending an approval is scope-checked to this agent and this
capability, `decidedByUserId` comes from the authenticated principal and is never accepted from a body, and
`expire-due` requires `ai:approve` — closing gates without a decision has the same effect on the queue as
rejecting them. Rollback is **derived from what actually happened** (`compensationPlan` over the plan's
invocations, in reverse), and a rollback that meets an irreversible step **stops there and says so**.

**One yes buys one act.** Scope alone is not enough to make the gate enforceable: outside a plan an approval's
subject is the `agentId:capabilityKey` pair, so a grant that stayed spendable would have licensed that pair
indefinitely. `consumeApproval` stamps `consumedAt` and `consumedByInvocationId`, and what the invocation path
checks is `isApprovalSpendable` — granted _and_ unspent — in the aggregate constructor as well as in the service,
so the rule holds for any caller of `authorizeToolInvocation`, not only the service that remembered to check.
Naming an already-spent request explicitly is a `409` (`ApprovalAlreadySpentError`, carrying the invocation the
grant went to); a second identical call with no fresh grant is refused as unauthorized. The grant is spent
**before** the invocation is stored, deliberately: if the store then fails, a human's approval has been consumed
without the call happening — an inconvenience, resolved by asking again — whereas the reverse order would leave a
recorded invocation beside a grant still marked unspent, which is the same yes available to authorize the next
call too. `ai.approval.spent` broadcasts the conversion, so an auditor reads not only that a human said yes but
which single act that yes became.

## 4. Quality gates

`@knowget/agent-orchestration`: typecheck / lint / format / build clean, **368 tests across 20 files** (17
authorization, plus planning, reasoning, rollback and metrics engine suites; 18 agent, 19 approval-request and
the other aggregate suites; seven service suites; ports and events). `apps/api`: typecheck / lint / build clean,
agent-orchestration DI-graph spec (2 tests) in the **220-test** api suite (74 files passed / 3 skipped). Full
monorepo typecheck / lint / tests green (**269** prisma-independent turbo tasks; the Prisma build and the
`@knowget/database` integration test are TD-12 in-sandbox). Repo-wide `pnpm format:check` clean. Migration
audited directly: all six tables `ENABLE` + `FORCE ROW LEVEL SECURITY` with `tenant_isolation` (USING + WITH
CHECK), both absolute uniques present.

## 5. Consistency pass, and a hole the documentation found

A dedicated increment audited the delivery against the 30 sibling domains rather than against itself, and every
finding was resolved toward the house convention. The highest-value one: `approval_request`, `tool_invocation`
and `reasoning_session` declared a `deleted_at` column that no adapter read ever filtered, because these three
aggregates have no `remove` path by design — so a retention job or a manual `UPDATE` would have soft-deleted rows
that every read still returned. **The column was dropped from all three** (schema + migration), making the
schema express the documented intent rather than adding an always-true filter. Also aligned: the three
soft-deleting adapters now use `update` rather than `updateMany` (matching all 30 siblings); the four multi-route
controllers were reordered to the house verb/specificity convention (POSTs → bare `@Get()` → literal keyword
GETs → sub-resource GETs → `@Get(":id")` → DELETEs) and verified to have zero literal-after-parameter
shadowing; the `?openOnly=true` flag that switched a read's response _type_ was split into its own route
(`GET by-subject/:subject/:subjectId/open`), since "what is blocking this plan" and "what has ever been asked
about it" are different questions; and `expireDueSchema` now defaults, so a bodyless `POST expire-due` — the
common case, meaning "as of now" — parses like any other. Four residual typecheck errors were closed by finding
the codebase's actual Prisma-JSON-write convention (a bare `JSON.parse(JSON.stringify(x))`, used at 30+ sites,
`Prisma.InputJsonValue` at none) instead of inventing a cast.

Writing this report then paid for itself. Fact-checking a claim drafted for §6 — that the plan step `dependsOn`
grammar was advisory — showed the claim was simply false: `addPlanStep` builds the set of known step ids and
throws `UnknownStepDependencyError` for anything outside it, which also makes a cycle impossible by construction,
while `inspectPlan` and `beginStep` re-check defensively. Auditing the rest of that paragraph the same way led to
`resolveApproval`, and there the debt was real and was not debt: **a granted approval was never consumed**. In a
plan, invocations are bounded by the step lifecycle and plan-level gates by `requireOpenGate`; outside a plan the
approval subject is the `agentId:capabilityKey` pair, so one human yes authorized unlimited repeat calls of that
pair. That is a defect in the contract's defining rule — _enforceable_ human approval — not a deferral, so the
code was fixed rather than the wording softened: consumption on the aggregate, a spendability check in the
constructor and the service, two new `409`s, `ai.approval.spent`, two nullable columns, and nine tests covering
the second call, the second grant, and a spend attempted from a pending, rejected or expired request. The
in-branch migration absorbed the columns, since CI applies it from scratch. What remains of the original
paragraph is the honest residue, now TD-46: the check-then-act window under true concurrency.

## 6. Boundaries & debt

- **Agents invoke capabilities, never databases** — held by absence of any DB/HTTP client and by the catalog
  indirection. A capability's _implementation_ stays in the domain that owns it, behind that domain's existing
  permission-gated surface.
- **Knowledge retrieval originates from D25** — a one-member `RETRIEVAL_SOURCES` union; there is no vocabulary
  for another source.
- **External AI providers are P3-D09's adapter** — the AI OS holds no provider SDK, so adding one later is a
  change behind an existing seam, not a change to the runtime.
- **No domain→domain package import** (ADR-0010); only the organization owner enters, through a directory port.
- **TD-46 (new).** The grant-consumption and registry-key guards are **check-then-act in the service** rather
  than a conditional update, so under genuinely concurrent authorization of the same approval two invocations
  could each read it unspent (the absolute registry/catalog uniques are **DB-backed**, rejecting `23505`, and so
  unaffected); closing this needs a compare-and-set on the `ApprovalRequestRepository` port. And **capability
  _implementation_ dispatch is left to the owning domains** — the contract's own boundary rather than a shortcut:
  this contract governs authority, planning and the record, not the call. Neither weakens an absolute invariant.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via
  the offline path; the six-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 37 `ai.*` events ride the same bus.

## 7. Outcome — CI green, merged to `main`

The Enterprise AI Operating System is complete behind its gates: the runtime is a pure, deterministic core (five
engines, six aggregates, **368 tests**, no model, no clock, no network), authority is answered from declared
facts in one place, **nothing critical or irreversible executes unattended at any autonomy level**, no approval
can manufacture a grant that was never given, **one human yes buys exactly one act**, plans are inspectable before
they move and rollbacks are honest about what cannot be undone, knowledge enters only from the Institutional
Knowledge Graph, and all six tables are FORCE-RLS tenant-isolated — with three of them deliberately carrying no
soft-delete column, because an approval decision, an invocation and a reasoning chain are the record of what the
platform did and on whose authority. Twelve increments, each verified and pushed, merged to `main` as `8bf7ac9`
(no-ff) after CI green; a dedicated consistency increment aligned the delivery with the 30 sibling domains and
dropped the three misleading soft-delete columns, and the documentation pass that followed it found and closed a
real authority hole rather than describing one. Next is **P2-D27 — Decision Intelligence**,
which reasons over D25's graph and will make its recommendations through this runtime's plans and its human gate.
**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated
across the P2-D18…D26 boundaries.
