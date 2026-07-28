# 46. Decision Intelligence: one package, six aggregates, six pure engines, a risk ceiling that is a constant, evidence as a precondition of existing, and reversal derived from what actually ran

- **Status:** Accepted
- **Date:** 2026-12-28
- **Contract:** P2-D27 (Institutional Decision Intelligence, Workflow Orchestration & Autonomous Operations)

## Context

P2-D27 is **the third contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the full operational base **D01–D24**, the **Institutional Knowledge Graph
(P2-D25)** and the **Enterprise AI Operating System (P2-D26)**. Where D25 gave the institution a semantic memory
and D26 gave it a governed runtime, D27 is what those two are _for_: the layer that turns institutional knowledge
into **recommendations a person can weigh, decisions the institution can answer for, workflows that carry cases
through their stages, and standing automation that acts within a boundary**.

Three rules define the contract, and all three are stated here as **structure rather than as procedure**:

1. **Only low-risk actions auto-execute; high-risk actions require human approval.**
2. **Recommendations always ship with evidence chains.**
3. **Automation carries rollback/compensation.**

A rule expressed as a code review comment survives until someone is in a hurry. A rule expressed as a constant, a
constructor precondition or a derived value survives indefinitely. The design question this contract poses is
therefore **restraint, not capability**: the hard part is not making the platform able to act on its own
conclusions, it is making it structurally unable to act beyond what it can justify, undo, and be held to.

Nothing in `@knowget/decision-intelligence` imports Prisma, NestJS, an HTTP client, a provider SDK or `fetch`;
its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and `@knowget/events`. It
does not invoke capabilities either — it _names_ them, and the P2-D26 runtime is what invokes. As with every
domain here, the design **begins with the pure engines**.

## Decision

1. **Six pure engines are the computational core, built and tested first.** The **autonomy engine**
   (`classifyAction`, `classifyRecommendedAction`, `isAutoExecutable`, `requiresHumanApproval`, `isBlocked`,
   `blockingReasons`, `mayProceed`, `classifyAll`, `autoExecutableRules`, `partitionByDisposition`) is the
   contract's first rule and the centre of gravity. The **evidence engine** (`inspectEvidenceChain`,
   `weakestStrength`, `evidenceRootIds`, `graphRootIds`, `isChainGrounded`, `chainConfidence`,
   `evidenceIssueCodes`, `supportClosure`, `dependentClosure`, `summarizeRecommendationEvidence`) is the second.
   The **reversal engine** (`planReversal`, `isFullyReversible`, `irreversibleCompletedStageKeys`,
   `requiresCompensation`, `reversalCapabilityKeys`, `reversalStepFor`, `compensationStateFor`,
   `isCompensationOutstanding`) is the third. The **orchestration engine** (`inspectWorkflow`,
   `isPublishableWorkflow`, `workflowIssueCodes`, `stageExecutionLayers`, `instanceProgress`, `readyStageKeys`,
   `overdueStages`, `isAutoExecutableStage`, `isHumanGatedStage`) makes a workflow definition **checkable before
   it is published**. The **prioritization engine** (`priorityScore`, `rankRecommendations`,
   `topRecommendations`, `humanGatedRecommendations`, `summarizeBacklog`, `isExpiredRecommendation`,
   `hoursUntil`) orders a backlog from declared facts. The **metrics engine** (`summarizeDecisionOperations`,
   `recommendationStatusCounts`, `runDispositionCounts`, `executionOutcomeCounts`, `acceptanceRate`,
   `autonomyRate`, `humanGatedRate`) is descriptive counts and rates only — nothing predictive (that is P2-D28),
   and nothing calls a model. Every engine is **clock-free**: `overdueStages`, `summarizeBacklog` and
   `isExpiredRecommendation` take the instant to judge against as an argument, so two callers judging the same
   moment always agree and a test never waits.

2. **The risk ceiling is a constant, not a setting.** `AUTO_EXECUTION_RISK_CEILING` is `low`, it lives in the
   value module beside the scale it ranks, and **nothing in this package can raise it** — no tenant
   configuration, no autonomy mode, no policy record. `isWithinAutoExecutionRisk` is the whole of "only low-risk
   auto-executes", and the autonomy engine reads that and nothing else for the risk half of its decision. An
   `AutonomyMode` (`propose_only → auto_with_approval → auto_execute`) is therefore **a ceiling on ambition,
   never a grant**: `auto_execute` only means the rule _asks_ to run unattended, and the gate still applies the
   risk ceiling, the reversibility rule and the human-subject rule. The risk scale is deliberately the same
   vocabulary as the P2-D26 capability catalog, so the two gates cannot disagree about what `high` means.

3. **The gate's outcome is three-way, and blocking is not gating.** `AUTONOMY_DISPOSITIONS` are `auto_execute`,
   `requires_approval` and `blocked`, and the eight `AUTONOMY_REASONS` are **stable codes, never prose**, so they
   are safe in an event, an accountability record, an API response and a test. `BLOCKING_AUTONOMY_REASONS`
   (`rule_not_active`, `irreversible_action`, `compensation_not_declared`, `recommendation_not_open`,
   `evidence_missing`) do not raise a human gate — they refuse. An irreversible or uncompensated action is not
   something a person can wave through **as a standing automation**: the rule itself is malformed, and the
   correct path is to declare the compensation or to run that action through the D26 runtime's own approval,
   where a human takes responsibility for one specific invocation rather than for an unattended rule.

4. **Evidence is a precondition of a recommendation existing, not a field on one.** `createRecommendation`
   inspects the chain and throws `UngroundedRecommendationError` if it does not hold up — so an ungrounded
   recommendation is not a bad record, it is **not a record**. `EVIDENCE_SOURCES` is a two-member union,
   `knowledge_graph` and `reasoning_session`, both upstream contracts of this same program: D25 already
   guarantees its own evidence chain, and D26's retrieval in turn originates only from the graph. Nothing else is
   expressible, so "ships with evidence" cannot degrade into citing a spreadsheet, a query or a model's
   unsupported opinion. A chain must reach a **graph root** (`no_graph_root` is an issue code), supports must
   exist and must not cycle, and confidence is an **integer 0–100 index capped by the weakest link** — never a
   probability float, because nothing here computes a probability.

5. **A decision record is a separate aggregate from the recommendation it answers, and `recommendationId` is
   not nullable.** The advice and the accountability have different lifetimes: a recommendation can be
   superseded, expired or withdrawn; the record of a decision taken on it cannot. Because every decision points
   at a recommendation, every decision points **through it** at a grounded chain — there is no path for an act to
   be taken and justified afterwards. What the decider was looking at is **snapshotted**
   (`confidenceAtDecision`, `riskLevelAtDecision`, `impactBandAtDecision`, `evidenceIds`, `autonomyReasons`)
   rather than read back later, because an audit six months on must be able to ask what was in front of the
   person at the time, not what the record says today.

   The three rules reach the **record** and not only the gate that precedes it. `recordDecision` refuses an
   `auto_executed` disposition that names a decider (`AutonomousDecisionHasDeciderError`), that carries no
   evidence ids (`AutonomousDecisionWithoutEvidenceError`), that lands on a subject declared to require human
   judgement (`AutonomousDecisionOnHumanSubjectError`), or whose risk — **the worse of the recommendation's and
   the action's** — sits above the ceiling (`AutonomousDecisionAboveCeilingError`); and it refuses any
   non-autonomous disposition with no decider at all (`AnonymousDecisionError`). The gate would never have
   produced such a decision. This makes one impossible to _write_, by a service that skipped the gate.

6. **One pure package, `@knowget/decision-intelligence`, six aggregates.** `Recommendation` (a proposal with its
   evidence chain, subject, risk, impact and confidence; `proposed → accepted | rejected | superseded | expired
| withdrawn`, only `proposed` open, every other landing terminal because a decision already taken cannot be
   quietly re-taken). `DecisionRecord` (the accountability record, with its own execution and compensation
   lifecycle). `Workflow` (a **versioned** definition whose stages are a DAG inside the aggregate; `draft →
published ↔ suspended → retired`). `WorkflowInstance` (one case moving through a published version, with a
   stage run per stage). `AutomationRule` (a standing rule: a signal key, conditions, one declared action, an
   autonomy mode; `draft → active ↔ paused → retired`). `AutomationRun` (one firing, written **whatever the gate
   decided** — including a refusal — so an institution can ask what its automation _wanted_ to do and was not
   allowed to).

7. **A workflow is a DAG that is checked before publication, not a list that is discovered at runtime.**
   `ordinal` is reading order for a human; `dependsOn` is the real order, and the two are allowed to disagree —
   which is exactly why inspection exists. `inspectWorkflow` reports ten stable `WORKFLOW_ISSUE_CODES`, and two
   of them are deliberately distinct: `dependency_cycle` marks the stages actually in a loop (the bug) and
   `unreachable_stage` marks what is merely downstream of one (the blast radius), because an author fixing a
   definition needs to know which is which. Cycle detection settles **layer by layer** rather than recursing, so
   no definition, however tangled, can hang the inspection meant to catch it. A definition is checked before
   publication because instances already running under a published version must keep meaning what they meant
   when they started — and a cycle cannot be repaired in a workflow that is already carrying live cases. Editing
   a published workflow therefore mints a **new version**; the old one keeps its instances.

8. **Reversal is derived from what actually ran, never asserted.** `planReversal` reads the completed stages or
   the settled action and produces the reversal steps in reverse order; `compensationStateFor` computes a
   decision's or a run's compensation state from the action's declared reversibility and how far execution
   actually got. `compensateDecision` refuses unless compensation was genuinely available, so **a status update
   cannot stand in for the world being put back**. A reversal that meets an irreversible step reports it as
   exactly that rather than continuing — `irreversibleCompletedStageKeys` and `isFullyReversible` are what an
   operator reads before deciding whether an unwind is even possible. And because `compensation_not_declared` is
   a _blocking_ autonomy reason, an automation whose action cannot be undone never runs in the first place: the
   third rule is enforced at arming time, not only at cleanup time.

9. **Stages live inside the workflow, and stage runs inside the instance.** Every invariant worth having is an
   invariant _across_ stages — unique keys, unique ordinals, dependencies that resolve and do not cycle, a
   capability declared on acting kinds only and on nothing else, a compensation declared where the action needs
   one — and not one of them is enforceable from a row that can be written on its own. Keeping them in the
   aggregate makes "load, apply a pure transition, save" the only way to change one, and it is what lets
   `isPublishableWorkflow` be a single honest answer.

10. **No domain→domain package import; three directory ports instead.** `OrganizationDirectory` resolves the
    owning organization, `CapabilityDirectory` asks the **P2-D26 tool catalog** whether a named capability is
    actually invocable (so a workflow stage or a rule action cannot name a capability that does not exist or is
    not active), and `EvidenceSourceDirectory` resolves cited evidence against the **P2-D25 graph** — entities,
    relationships and assertions — and against D26's reasoning record. The domain declares the ports; the
    composition root binds them. Cross-domain checks are only real if they resolve against the platform rather
    than against a claim in the request.

11. **The API splits along authority, in four permission scopes.** `decision:manage` is governance — authoring,
    publishing and retiring workflow versions, drafting and arming standing rules; everything an institution's
    processes are _allowed_ to become, decided ahead of time by people who answer for the design.
    `decision:operate` is the runtime — raising recommendations, citing evidence, starting cases, moving stages,
    dispatching signals, handing authorized actions to the runtime, recording reversals; it runs the machinery
    and does not decide what the machinery may do. **`decision:decide` stands alone** — accepting or rejecting a
    recommendation, recording a decision, approving or refusing a firing. A platform where only low-risk actions
    auto-execute has bought nothing if the operator who fired the rule can also clear the approval it stopped
    for: the gate would record a signature and not a decision, which is the failure the rule exists to prevent.
    `decision:read` is every read and is **deliberately wide**, because automation an institution cannot look at
    is automation it has not really decided to run. **84 endpoints across 7 controllers**, all permission-gated,
    every body zod-validated. A rule dry-run (`POST decision/automation-rules/matching/:signalKey`) is
    `decision:read` despite being a POST: nothing is written and nothing fires; the method is a POST only
    because the facts to evaluate against are a document rather than a query string.

12. **No endpoint accepts a script or an executable payload.** A rule names a capability key, a risk level, a
    reversibility and a compensation key; actions and conditions are minted through the domain
    (`declareAction`, `declareCondition`) so the gate reads the platform's declared shape and never the
    request's. A rule that could carry executable intent would put the gate on the wrong side of the thing it is
    gating.

13. **Six FORCE-RLS tables, and four of them carry no soft-delete column.** A workflow definition and an
    automation rule can be withdrawn, so they keep `deleted_at`. A **recommendation, a decision record, a
    workflow instance and an automation run cannot** — they are the record of what was proposed, decided, run
    and refused, and on whose authority — so there is no `remove` path and therefore no column to imply one.
    Declaring a soft-delete column that no read filters is worse than not having it. Two absolute uniques are
    DB-backed: workflow `(tenant, key, version)` and automation rule `(tenant, key)`.

14. **41 `decision.*` events carry ids, keys, statuses, dispositions, reason codes and counts — never prose and
    never people.** A recommendation's `title` and `summary`, a decision's `decisionNote`, a workflow's stage
    `instruction` and a rule's `description` stay in the domain. Reason _codes_ travel, because a refusal nobody
    can see is not a control. `decidedByUserId` does not: an event is a broadcast, and a broadcast that names
    people turns an operational feed into a surveillance feed. Accountable identity is taken from the
    authenticated principal (`deciderOf`) at every accepting, deciding, approving and cancelling endpoint, and
    is never read from a body anywhere in this domain.

## Consequences

- The platform now has **one place that answers "may this act happen without a person?"**, and it answers from
  declared facts against a constant that no configuration can raise. The answer is testable (the autonomy suite
  alone), identical whether reached from a rule firing, a workflow stage or a recommendation, and **the record
  refuses to hold a decision the gate would not have produced** — so skipping the gate is not a shortcut, it is
  an error.
- **An ungrounded recommendation cannot exist**, and every decision points through its recommendation at a chain
  that reaches the graph. The institution's advice and its accountability are separable, and both are auditable
  against what was actually in front of the decider at the time.
- **Nothing irreversible or uncompensated is ever armed as automation.** The third rule is enforced when a rule
  is drafted and activated, not merely when something needs undoing — and when an unwind is needed, what it
  takes is derived from what actually ran rather than from a plan made before anything happened.
- **Workflows are checkable before they carry cases**, and versioning means a fix never rewrites the meaning of a
  case already in flight. `dependency_cycle` versus `unreachable_stage` is the difference between a bug report an
  author can act on and one they cannot.
- **P2-D25 and P2-D26 are both load-bearing.** Evidence resolves against the graph; capabilities resolve against
  the catalog. D27 names capabilities and never invokes them, so the D26 runtime remains the only thing that
  acts, behind its own plans, permissions and human gate — and the two gates share one risk vocabulary rather
  than two.
- The deferrals are recorded as **TD-47**: the rule-key and workflow-version guards are check-then-act in the
  service (both absolute uniques are DB-backed and reject `23505`, so the window is a friendlier error rather
  than a lost invariant), signal dispatch evaluates matching rules in-process on the caller's thread, and
  **execution dispatch itself is left to the P2-D26 runtime and the owning domains** — the contract's own
  boundary rather than a shortcut. None weakens an absolute invariant.
- Next is **P2-D28 — Predictive Intelligence**, which is where forecasting belongs; this contract's metrics
  engine is deliberately descriptive so that boundary stays clean.

## Alternatives considered

- **Make the risk ceiling a tenant setting.** Rejected — it is the contract's first rule. A configurable ceiling
  is a ceiling that will be raised under deadline pressure by whoever has the admin console, and the rule would
  then hold only where nobody needed it not to.
- **Let a human approve an irreversible automation.** Rejected — that is a person accepting responsibility for
  an unattended standing rule rather than for a specific act. The honest path already exists: declare the
  compensation, or run it through the D26 runtime's per-invocation approval. Hence `irreversible_action` and
  `compensation_not_declared` block rather than gate.
- **Evidence as an optional field, validated on acceptance.** Rejected — it makes ungrounded recommendations
  representable, which means they will exist, be listed, be counted and occasionally be acted on by a path that
  forgot to check. Refusing at construction is the only version of "always ships with evidence" that is true.
- **One aggregate for recommendation-and-decision.** Rejected — the advice can be superseded and the
  accountability cannot, and collapsing them makes the audit question ("what did the decider see?") unanswerable
  once the recommendation moves on.
- **Workflow stages as their own table; stage runs as their own table.** Rejected — every interesting invariant
  is cross-stage, and a separately-writable row makes all of them unenforceable.
- **Edit a published workflow in place.** Rejected — running instances would silently change meaning mid-case.
  Versioning costs a row and buys a guarantee.
- **Store the reversal plan when a rule is armed.** Rejected — what can be undone depends on what actually ran.
  Deriving it cannot go stale.
- **Let a rule carry a script or a payload template.** Rejected — it moves the gate downstream of executable
  intent, and no amount of validation on a script recovers the property that a capability key gives for free:
  a declared effect, risk, reversibility and compensation, known before the rule is armed.
- **Fold `decision:decide` into `decision:operate`.** Rejected — separation of duty is the entire value of the
  approval gate. One scope would let the operator who fired the rule clear the approval it stopped for.
- **Confidence as a float probability.** Rejected — nothing here computes a probability, and a float invites
  false precision. An integer 0–100 index capped at the weakest link is what the evidence supports.
