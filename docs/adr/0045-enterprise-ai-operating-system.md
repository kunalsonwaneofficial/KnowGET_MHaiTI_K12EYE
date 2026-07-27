# 45. Enterprise AI Operating System: one package, six aggregates, five pure engines, capabilities never databases, knowledge only from D25, and a human gate that cannot be bypassed

- **Status:** Accepted
- **Date:** 2026-12-27
- **Contract:** P2-D26 (Enterprise AI Operating System, Agent Orchestration & Reasoning)

## Context

P2-D26 is **the second contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the full operational base **D01–D24**, and the **Institutional Knowledge
Graph (P2-D25)** delivered immediately before it. It is **the AI runtime**: the registry of agents and what each
may do, **inspectable execution plans**, reasoning sessions that record how a conclusion was reached,
**permission-controlled tool invocation with rollback**, and an **enforceable human approval** gate.

Two rules define the contract, and both are structural rather than advisory. First, **agents invoke
capabilities, never databases directly** — an agent's reach is a set of catalogued capability keys, each carrying
a declared effect, risk, reversibility and compensation, and the runtime has no vocabulary for a query, a table
or a connection. Second, **knowledge retrieval originates from D25** — the graph is the only place institutional
knowledge enters a reasoning session. A third boundary comes from the platform's phase plan: **external AI
providers are reached only through the Phase-3 AI integration adapter (P3-D09)**, so the AI OS never calls a
provider itself. Nothing in `@knowget/agent-orchestration` imports Prisma, a provider SDK, an HTTP client, or
`fetch`; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and
`@knowget/events`.

The design problem this contract actually poses is **authority**, not orchestration. A plan is easy; a plan that
can be trusted to run without a human watching is not. So the questions that shaped the design were: what may an
agent do unattended, and on whose authority; when must a human decide, and can that gate be routed around; when
something has been done and should not have been, what can be undone and what cannot; and when an agent
concludes something, what is the evidence. Every one of those answers is **derived** from declared facts —
which is why, as with every domain here, the design **begins with the pure engines** rather than with an
aggregate.

## Decision

1. **Five pure engines are the computational core, built and tested first.** The **authorization engine**
   (`authorizeInvocation`, `isExecutable`, `isAllowedUnattended`, `requiresHumanApproval`, `denyingReasons`,
   `authorizeAll`, `unattendedCapabilities`) decides whether an agent may invoke a capability, and is the
   contract's centre of gravity. The **planning engine** (`inspectPlan`, `highestRisk`, `nextExecutableSteps`,
   `planProgress`) makes a plan **inspectable** before it moves — its highest risk, what it will need approved,
   which steps are runnable now, how far it got. The **reasoning engine** (`evidenceOf`, `evidenceChain`,
   `isTraceGrounded`, `groundSession`, `unsourcedRetrievalTraceIds`, `decisionConfidence`, `summarizeSession`)
   is the evidence chain of a session — what a step rests on, back to grounded facts, cycle-safe, with a
   decision's confidence capped by its weakest support. The **rollback engine** (`compensationPlan`,
   `isFullyReversible`, `irreversibleInvocations`, `reversibleShare`) derives what undoing a plan would take,
   in reverse order, and is honest about the parts that cannot be undone. The **metrics engine**
   (`summarizeAgentOperations`, `plansByStatus`, `plansByAgent`, `invocationsByCapability`, `tally`) is
   descriptive counts only — nothing predictive (that is P2-D28), and nothing calls a model.

2. **Authorization is a matrix over declared facts, and denial is not the same as gating.** An agent's
   `autonomyLevel` (`advisory → supervised → bounded → autonomous`) is checked against the capability's
   `effect`, `riskLevel` and `reversibility`: `MAX_UNATTENDED_RISK` caps how much risk each level may execute
   unattended (`advisory: null` — nothing), and `UNATTENDED_EFFECTS` caps what kind of thing it may do
   (`advisory: []`, `supervised: ["read"]`). **`critical` is absent from every entry on purpose, and an
   irreversible action always needs a human** — no level is trusted with either. Crucially, the outcome is a
   three-way split, not a boolean: `allowed`, `requires_approval`, or `denied`. `DENYING_REASONS`
   (`agent_not_active`, `capability_not_granted`, `tool_not_active`) are **grant** failures, and **no human
   approval can substitute for a missing grant** — approval raises a gate, it does not mint authority. Every
   reason is a **stable code**, never prose, so it is safe in an event, an audit record, an API response and a
   test.

3. **One pure package, `@knowget/agent-orchestration`, six aggregates.** Two are the **governed registry** —
   `AgentDefinition` (identity, purpose, autonomy level, and the granted capability keys that are its whole
   reach; `draft → active ↔ suspended → retired`) and `ToolDefinition` (the **capability catalog**: key, domain,
   effect, risk, reversibility, an optional compensating capability, and whether it always needs a human;
   `draft → active → deprecated`). Two are the **runtime** — `ExecutionPlan` (a goal plus ordered, dependency-
   linked steps, `drafted → awaiting_approval | approved → executing → completed | failed | rolled_back`, with
   `rejected` and `cancelled`) and `ToolInvocation` (one permission-controlled call, created **only** in the
   `authorized` state, `→ executing → succeeded | failed`, and a settled write may later be `compensated`). One
   is the **gate** — `ApprovalRequest` (a decision a human owes the runtime, against a plan or an invocation,
   `pending → approved | rejected | expired`, and a granted one additionally **spent once**). One is the
   **reasoning record** — `ReasoningSession` (a purpose and an ordered chain of traces,
   `open → concluded | abandoned`).

4. **Agents invoke capabilities, never databases — enforced by the catalog and by absence.** A grant names a
   capability **key**, an invocation names a capability **key**, and a plan step names a capability **key**;
   the catalog is the only thing that says what a key means and what it costs. The package therefore has no
   database client, no HTTP client and no provider SDK — a capability's _implementation_ lives in the domain
   that owns it, behind the platform's existing permission-gated surface, and reaching an external model is
   P3-D09's adapter. The rule is held by there being **no vocabulary here for anything else**, which is a
   stronger guarantee than a review checklist.

5. **Knowledge enters a reasoning session only from the graph (P2-D25), and only through a retrieval.**
   `RETRIEVAL_SOURCES` is a **one-member union** — `["knowledge_graph"]` — so the contract's rule is held by
   the type system rather than by convention: there is no word for another source. A `retrieval` trace that
   cites no knowledge reference is refused, and a non-retrieval trace may not carry one. `inference` and
   `decision` traces are **derived** kinds and must cite earlier steps, so a session's conclusion is grounded
   by construction; `groundSession` and `unsourcedRetrievalTraceIds` are what an auditor reads. Confidence is
   an **integer 0–100 index**, never a probability float, because nothing here computes a probability.

6. **The human gate is enforceable and single-use, and the decider is never supplied by the caller.** An approval
   request is a first-class aggregate with a subject, an expiry and a recorded decider — not a boolean on the
   plan. Spending one is scope-checked (`coversInvocation`): an approval is this agent's and this capability's, or
   it does not apply. An invocation-level request is raised against the **plan step** (or, outside a plan, the
   agent-and-capability pair) rather than the invocation, because the invocation record only exists once
   authorization has already opened — a request naming it could only ever arrive after the moment it was meant
   to gate. `decidedByUserId` is taken from the authenticated principal; an approval whose decider a caller
   could name is a signature field, not an accountability record.

   **A grant is spent on exactly one act.** `consumeApproval` stamps `consumedAt` and
   `consumedByInvocationId`, and `isApprovalSpendable` — granted _and_ unspent — is what the invocation path
   actually checks, in the aggregate constructor as well as in the service, so the rule holds for any caller. The
   scope check alone is not sufficient: outside a plan the subject is the agent-and-capability pair rather than a
   step that can only run once, so a grant that stayed spendable would let one human "yes" authorize that same
   call indefinitely — a standing licence wearing the clothes of a gate. The grant is spent **before** the
   invocation is stored, deliberately: if the write then fails, an approval has been consumed without the call
   happening, which costs someone a second question, where the reverse order would leave a recorded invocation
   beside a grant still marked unspent. A second call needs a second question, freshly answered.

7. **Rollback is derived from what actually happened, not planned in advance.** `compensationPlan` reads the
   plan's invocations and reverses them: successful `compensatable` writes get their declared compensating
   capability, in reverse order of execution; `irreversible` ones are reported as exactly that. Reads need
   nothing. A rollback that meets an irreversible step **stops there and says so** — the alternative, a
   best-effort unwind that quietly leaves the institution half-changed, is worse than refusing.

8. **A plan's steps live inside the plan, in its own JSONB column.** Every invariant worth having in a plan is
   an invariant _across_ steps — an ordinal sequence with no gaps, dependencies that point only backwards, a
   status the step set actually supports — and not one of them is enforceable from a row that can be written on
   its own. Keeping steps in the aggregate makes "load the plan, apply a pure transition, save the plan" the
   only way to change one.

9. **The API splits along authority, in three permission scopes.** `agent:read` / `agent:write` govern the
   **registry and catalog** — who exists, what they may reach, what a capability costs — an administrative
   surface. `ai:read` / `ai:operate` govern the **runtime** — drafting and running plans, authorizing
   invocations, reasoning sessions, and the operations views. `ai:approve` stands **alone** for the human gate,
   including `expire-due`, because closing gates without a decision has the same effect on the queue as
   rejecting them. Reading the queue is `ai:read`, so an operator can see what is blocked without being able to
   unblock it. **85 endpoints across 7 controllers**, all permission-gated, every body zod-validated.

10. **Six FORCE-RLS tables, and three of them carry no soft-delete column at all.** An agent, a capability and a
    plan can be withdrawn, so they keep `deleted_at`. An **approval decision, an invocation and a reasoning
    chain cannot** — they are the accountability record of what the platform did and on whose authority, so
    there is no `remove` path, and therefore no column to imply one. Declaring a soft-delete column that no read
    filters is worse than not having it: a retention job or a manual `UPDATE` would mark rows deleted that every
    read still returns.

11. **Events carry ids, keys, statuses, reason codes and counts — never prose and never people.** A plan's
    `goal`, a step's `intent`, a session's `purpose` and `conclusion`, a trace's `statement`, an approval's
    `decisionNote` and an agent's `name`/`purpose` all stay in the domain. Reason _codes_ travel, because a
    denial nobody can see is not a control. `decidedByUserId` does not: an event is a broadcast, and a broadcast
    that names people turns an operational feed into a surveillance feed.

## Consequences

- The platform now has **one place that answers "may this agent do this, unattended?"**, and it answers from
  declared facts rather than from code paths — so the answer is testable (17 authorization tests alone),
  inspectable before anything runs (`decide` records nothing), and identical whether it is reached from a plan,
  a direct invocation, or an operator's console.
- **Nothing critical or irreversible executes without a human**, at any autonomy level, and no approval can
  manufacture a grant that was never given. The two failure modes an AI runtime is most likely to have are
  closed by construction rather than by policy.
- **Plans are inspectable and rollbacks are honest.** An operator can see a plan's highest risk and what it will
  need approved before approving it, and can see what undoing it would actually take — including the parts that
  cannot be undone — rather than discovering that mid-unwind.
- **P2-D25 is load-bearing.** Knowledge retrieval has exactly one source, held in the type system, so the
  evidence behind an agent's conclusion is the graph's evidence chain — explainable by construction, as D25
  promised. The two contracts compose into a runtime whose reasoning can be audited end to end.
- **P3-D09 stays the only door to an external model.** Because the AI OS holds no provider client, adding one
  later is an adapter behind an existing seam rather than a change to the runtime, and the runtime's tests stay
  deterministic (368 pure tests, no model, no clock, no network).
- The deferrals are recorded as **TD-46** — the grant-consumption and registry-key guards are **check-then-act
  in the service** rather than a conditional update, so under genuinely concurrent authorization of the same
  approval two invocations could each read it unspent (the absolute registry/catalog uniques are DB-backed and
  so unaffected); and capability _implementation_ dispatch is left to the owning domains, which is the
  contract's own boundary rather than a shortcut. Neither weakens an absolute invariant.
- Next is **P2-D27 — Decision Intelligence**, which reasons over the graph (P2-D25) and will make its
  recommendations through this runtime's plans and its human gate.

## Alternatives considered

- **Give agents a database or generic-SQL capability.** Rejected — it is precisely what the contract forbids, and
  it would make an agent's reach unbounded and unauditable. A catalogued capability declares its effect, risk,
  reversibility and compensation _before_ it is granted; `SELECT *` declares nothing.
- **Call an AI provider from this package.** Rejected — the AI OS is the authority and orchestration layer, not
  a provider client; provider access is P3-D09's adapter. Keeping the SDK out also keeps this package's 368
  tests deterministic and offline.
- **A single `canAct` boolean instead of the three-way outcome.** Rejected — it collapses "you were never
  granted this" into "ask a human", which is exactly the confusion that lets an approval mint authority. The
  `denied` / `requires_approval` split is the whole point of `DENYING_REASONS`.
- **Approval as a nullable `approvedBy` on the plan.** Rejected — a gate needs a subject, an expiry, a decision
  and a decider, and an expiry needs a sweep. A column cannot expire, and cannot record a rejection with a note.
- **Plan steps as their own table.** Rejected — every interesting plan invariant is cross-step, and a
  separately-writable step row makes all of them unenforceable.
- **Store the rollback plan when the plan is drafted.** Rejected — what can be undone depends on what actually
  succeeded, which is not known at draft time. Deriving it from the invocation record cannot go stale.
- **Best-effort rollback past an irreversible step.** Rejected — a partial unwind leaves the institution in a
  state nobody chose. Stopping and naming the irreversible step is the honest failure.
- **Confidence as a float probability.** Rejected — nothing in this domain computes a probability, and a float
  invites false precision. An integer 0–100 index, capped at the weakest support, is what the evidence supports.
