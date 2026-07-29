# Engineering Delivery Report — P2-D29

**Executive Intelligence, Governance & Institutional Command** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D29 — Executive Intelligence, Governance & Institutional Command                                                                                                                                                                                                                                                                                                                                                                |
| **Status**     | ✅ Delivered — CI green, merged to `main` (`58995db`). `@knowget/executive-intelligence` typecheck/lint/format/build clean, **985 tests** (25 files); `apps/api` typecheck/lint/build clean + executive-intelligence DI-graph spec (3 tests) in the **238-test** api suite. Full monorepo green (TD-12 on the Prisma build in-sandbox).                                                                                            |
| **Depends on** | **P2-D25 (Knowledge Graph)**, **P2-D10 (Assessment & Evaluation)**, **P2-D27 (Decision Intelligence)** and **P2-D28 (Predictive Intelligence)** — the four stores an evidence citation resolves against; P2-D01-M01 (Organization) via a directory port; the operational base **D01–D24** whose measurement is read here rather than recomputed; P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). Fifth contract of **Program E** (D25–D30). |
| **Date**       | 30 December 2026                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Next**       | P2-D30 (sixth and final Program E contract)                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 1. Mission recap

Deliver the **command layer** — the fifth contract of Program E, and the place where twenty-eight domains' worth of
institutional activity becomes a small number of figures that leadership is expected to act on.

One rule defines the contract: **role-aware dashboards, a reproducible Institutional Health Index across ~10 domains,
evidence-traceable KPIs**. Each clause names a failure this layer is uniquely able to commit. A dashboard that shows
everybody everything leaks; a dashboard that silently blanks what a reader may not see teaches them the number is
zero. An index that cannot be recomputed is a score with an author rather than a method. A KPI whose figure traces
back to nothing is an opinion that has learned to render as a tile.

The design problem here is **plausibility, not accuracy**. Every other layer in the platform is checked by the world:
an attendance figure is wrong in front of a teacher, a fee balance is wrong in front of a parent. A composite index
is checked by nobody, because there is nothing to compare it against — it is the only number in the institution that
can be badly wrong and look completely fine. Everything a reader would use to judge it (which pillars were included,
how thin the evidence underneath was, what moved since last period, whether the figure on the slide is still the
figure in the system) is exactly what a summary throws away. So each clause is expressed as structure rather than
discipline: an excluded pillar rather than a zeroed one, a coverage figure that travels with the score, a standing
derived from the weakest evidence rather than declared by the author, a fingerprint with no tolerance, a panel that
disappears rather than blanks.

Two absences are load-bearing and were decided before anything was written. **The package holds no clock**, so no
figure in it depends on when it was read. **It recomputes nothing it cites** — a KPI reading is entered against
evidence in the domain that owns it, and this contract measures, bands, weights and composes, but never reaches back
into attendance or finance to derive a number for itself. A command layer that recomputed its own inputs would be a
second opinion about every domain in the platform, and the institution would discover the disagreement as a
discrepancy rather than as an error. As with every domain here, the design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engines**     | Eight pure, deterministic, **clock-free** engines built and tested first: **measurement** (`validateScale` / `clampOutcomeFor` / `normalizeMeasure` / `measure` — polarity-aware normalisation onto 0–100), **banding** (`bandFor` / `worstBand` / `bestBand` / `bandMovement` / `isBandFall` / `summarizeTrend`), **weighting** (`validateWeights` / `redistribute` / `redistributedWeight` — the exclusion arithmetic), **indexing** (`assessIndex` / `rollUpPillars` / `rankByDrag` / `isCitable`), **traceability** (`validateEvidence` / `auditTrace` — clause three), **reproducibility** (`fingerprintRun` / `reproduce` — clause two), **composition** (`validatePanels` / `composeFor` — clause one), **attention** (`isBreachBand` / `attentionKeyFor` / `raiseForIndex` / `raiseForPillar` / `raiseForKpi` / `rankAttention`)                                 |
| **Domain**      | `@knowget/executive-intelligence` — seven aggregates: `KpiDefinition` (what the institution says it measures, its scale, polarity and pillar), `KpiReading` (one period's figure with its evidence and derived standing), `HealthIndexDefinition` (**versioned by supersession**; pillar weights bounded on both sides), `HealthIndexAssessment` (the computed period — score, per-pillar roll-up, coverage, citability and fingerprint), `Dashboard` (panels, each naming the scope a reader must hold), `ExecutiveBriefing` (findings pinned to one assessment), `AttentionItem` (what the arithmetic is asking somebody to look at); seven application services on the platform event bus, **32 `command.*` events**, 59 typed errors. **No Prisma, no NestJS, no HTTP, no model runtime, no provider SDK, no `fetch`, no clock; value-, prose- and PII-free events** |
| **Persistence** | Seven models in `schema.prisma` + one migration (`20261230000000_add_executive_intelligence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **no table carries a soft-delete column at all** — every aggregate's way out is a domain state (retired, withdrawn, superseded, invalidated, archived, resolved, dismissed); scales, weights, pillar roll-ups, panels, findings and citations as JSONB; five absolute uniques DB-backed plus **two partial uniques that hold a rule rather than a shape** — one live reading per `(tenant, kpi, period)` where `withdrawn_at IS NULL`, and **one published definition per `(tenant, index_key)`**                                                                                                                                                                        |
| **API**         | Seven Prisma/RLS repositories + two directory adapters + **seven permission-gated controllers / 69 endpoints** under `apps/api/src/domains/executive-intelligence`, split `command:measure` (the figures) / `command:manage` (what is measured and how it composes) / `command:operate` (assessment and the queue) / **`command:brief` (what leadership is told, standing alone)** / `command:read` (every read); all bodies zod-validated; module wires 7 repos + 2 directories + 7 services and imports Organization, Assessment & Evaluation, Knowledge Graph, Decision Intelligence and Predictive Intelligence; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                      |

## 3. The three clauses, as structure

**Evidence-traceable KPIs.** `record` refuses a reading whose citations do not hold up — a figure with no evidence is
not a weakly sourced reading, it is **not a reading**, and the package cannot express one. Six stable issue codes are
the whole vocabulary of the check (`no_evidence`, `missing_source_domain`, `missing_source_ref`, `missing_attestor`,
`attestor_not_required`, `duplicate_citation`), and the citation is checked for existence at the composition root
through the `EvidenceRecordDirectory` at the moment it is entered. That timing is the point: the cost of finding the
right reference belongs on the person entering the figure, who can still go and find it, rather than on the governor
who follows the citation eighteen months later and arrives nowhere. Standing is then **derived from the weakest
citation rather than declared** — one forecast among nine measured records makes the reading `projected`, one manual
return makes it `attested` — because a reading's reliability is the reliability of its worst input, and an author
allowed to declare it would eventually declare it well.

**A reproducible Institutional Health Index across ten pillars.** `HEALTH_PILLARS` is closed at ten and shared by
every index in every tenant, so two institutions' scores mean the same thing. `fingerprintRun` digests the exact
inputs a score stood on — the definition version, the effective weights, every contributing pillar and reading — into
a 16-character FNV-1a fingerprint, and `reproduce` **calls the real `assessIndex`** rather than a comparison
shortcut, so a reproduction that passes is evidence the engine still computes what it computed. There is **no
tolerance**: a fingerprint matches or it does not. Composite scoring is exact decimal work at `INDEX_PRECISION` 6 and
`WEIGHT_PRECISION` 4, and a tolerance would be a place for a real drift to hide behind a rounding argument. This is
also why the package holds **no clock** — a score whose inputs can move underneath it was never reproducible.

**Role-aware dashboards.** Every panel names the scope its reader must hold, and `composeFor` **omits** panels the
reader may not see rather than rendering them empty, disabled or masked. `PANEL_VISIBILITY_OUTCOMES` is the
single-element list `["omitted"]` — the vocabulary has no word for "shown but blank", so no later increment can add
one without changing the type. A blanked tile is worse than a hidden one: it tells a reader a figure exists, that
they are not trusted with it, and — if the panel would have shown a count — that the count is probably zero.
`PANEL_SUBJECTS` is a total map from binding to whether a subject is required, so a panel bound to a KPI series
without naming a KPI is refused at definition rather than composed into a tile that renders nothing.

**And the fourth thing, which is not in the sentence but holds the other three up: a missing pillar is excluded, never
zeroed.** A pillar with no citable evidence does not contribute 0 out of 100 — it leaves the index, and its weight is
redistributed proportionally across the pillars that remain. Zeroing is the single most consequential arithmetic lie
available to this layer, because it is indistinguishable in the output from a genuine catastrophic result: an
institution that has not yet wired up its wellbeing KPIs would score identically to one whose learners are in crisis.
Under it sit two floors nothing in the package can lower — `MIN_PILLAR_COVERAGE` 0.6 and
`MIN_KPI_COVERAGE_PER_PILLAR` 0.5 — and a **coverage figure that travels with the score in the same object**, so a
reader is never handed a number without being handed how much of the institution it saw. An assessment below the
floor still computes and is **not citable**: `isCitable` is false, and the domain refuses to publish it into a
briefing. Refusing to compute would have taught users to stop asking; computing and letting it be quoted would have
been the failure this contract exists to prevent.

## 4. Authority — five scopes, and why `command:brief` stands alone

`command:measure` gates the figures — recording a reading and withdrawing one. It is separate from everything
downstream because a withdrawn reading **retroactively changes every assessment computed since**, which is a
legitimate and necessary act and is not the same act as computing an index. `command:manage` gates what the
institution says it measures and how it composes: defining, rescaling, retargeting, activating and retiring KPIs,
defining, reweighting, publishing and superseding index definitions, and defining and publishing dashboards. These
are settled ahead of time by people who answer for them, and the separation is what stops a weight being adjusted in
the same breath as the score it produces. `command:operate` gates the runtime — computing, finalising and
invalidating assessments, sweeping and closing the attention queue. `command:read` is every read and is deliberately
wide, because an index nobody may inspect fails this contract as surely as one nobody can reproduce.

**`command:brief` is separate and is implied by nothing.** Drafting a briefing, setting its findings, issuing it,
revising it and withdrawing it all sit there. Computing an index is an operational act; telling leadership what it
means, in a document they will act on and be held to, is a governance act. **The ability to compute the number is not
the authority to narrate it**, and the scope is that sentence written as authorization.

Accountable identity comes from the authenticated principal at every attributing endpoint — who computed an
assessment, issued a briefing, acknowledged, resolved or dismissed a finding — and is **never read from a body**
anywhere in this domain. Three deliberate asymmetries: `GET command/assessments/:id/reproduction` is gated on
`command:operate` rather than `command:read` despite writing nothing, because re-running an index from its pinned
inputs is the operator's check and not a general report; `POST command/attention/sweep` answers **200** rather than
201, because a sweep is idempotent by restatement and the second run of a period usually creates nothing at all; and
`POST command/indices/:id/supersede` answers **201**, because it mints a sibling aggregate — the next version — rather
than amending the one addressed.

## 5. Publication is exclusive, and closure is by judgement

**One published definition per index key, enforced by the database.** The partial unique index on
`(tenant_id, index_key) WHERE status = 'published'` is the difference between a rule and an intention: two
simultaneously published definitions of the same index would mean two institutions inside one tenant, each with a
defensible score, and no way to say which one the board was shown. Supersession mints the next version rather than
editing the current one, so every assessment ever computed can still point at the composition it was computed under —
a superseded definition that could be deleted would turn every historical score into an unexplainable number.

**An assessment freezes at finalisation.** Its score, per-pillar roll-up, coverage and fingerprint are what they were
when it was computed, not what they would be if recomputed on read. The gap between those two is the whole point: a
recomputing report is an account of what leadership _should have been_ told, and the only record worth keeping is
what they _were_ told. A period whose inputs later prove wrong is **invalidated rather than recomputed**, and stays
on the record beside the assessment that replaced it. **A briefing pins its figure** to one assessment and filters
its findings down rather than composing them afresh, so a document cannot quietly change its own number between
being issued and being read.

**The attention queue raises on absence, and closes only by judgement.** Eight stable reasons cover both directions —
`band_breach`, `band_fall`, `sustained_decline`, `target_miss`, `index_drop` on the arithmetic, and `coverage_gap`,
`evidence_stale`, `standing_weakened` on the evidence — because a pillar that stopped reporting is the finding most
likely to be read as "nothing to see". Closure is `resolved` (the institution dealt with it) or `dismissed` (it
should not have been raised, with a **compulsory reason**), never deletion, and a sweep leaves closed items untouched:
reopening one would erase the evidence that a human looked, which is the only thing separating a queue from a stream
of alerts. Dismissal reasons are the only feedback anyone tuning these engines will ever get. The queue is ranked by
the domain rather than by the caller, because the one thing a queue owes whoever opens it is that the top of it is
the thing to do next.

## 6. Quality gates

`@knowget/executive-intelligence`: typecheck / lint / format / build clean, **985 tests across 25 files** (eight
engine suites, seven aggregate suites, seven service suites, plus events, values and ports). `apps/api`: typecheck /
lint / build clean, executive-intelligence DI-graph spec (**3 tests** — the seven controllers, the seven exported
service tokens, and the two directories) in the **238-test** api suite (80 files, 3 skipped). Full monorepo typecheck
/ lint / tests green (the Prisma build and the `@knowget/database` integration test are TD-12 in-sandbox). Repo-wide
`pnpm format:check` clean. Migration audited directly: all seven tables `ENABLE` + `FORCE ROW LEVEL SECURITY` with
`tenant_isolation` (USING + WITH CHECK), all seven unique indexes present including the two partial ones, and **zero
`deleted_at` columns** across the contract.

The DI-graph spec asserts the two **directories** bind, not only the services. The evidence directory is why this
module imports four domains beyond the organization check, and it is clause three made structural — a directory that
silently failed to bind would turn "traceable" into "shaped like a trace" across every reading in the domain, while
every guard in the package still appeared to pass.

## 7. Boundaries & debt

- **Ten pillars are the closed scope**, and the closure is the feature. A tenant-extensible pillar set would make two
  institutions' health indices incomparable and would make the index's own history incomparable with itself the first
  time a pillar was added. Weights are bounded on **both** sides — `MIN_PILLAR_WEIGHT` 0.01 and `MAX_PILLAR_WEIGHT`
  0.5 — so no pillar can be present in name only, and none can quietly become the index.
- **This contract measures; it does not compute the underlying numbers.** A KPI reading is a figure entered against
  evidence in the domain that owns it. That is a real operational prerequisite rather than an oversight: the platform
  gets one arithmetic per fact, and the command layer is not entitled to a second opinion about attendance, finance
  or outcomes.
- **Evidence resolves against four stores.** Assessment results, forecast runs, decision records and knowledge
  assertions resolve to their owning domains by kind; everything else resolves through the P2-D25 graph by
  `(sourceDomain, sourceRef)`, which is what the graph is for rather than a convenient fallback. Manual returns
  demand a named attestor — a figure somebody typed is admissible, and anonymously typed is not.
- **There is no scope or role directory, and that absence is deliberate.** Panels and briefings name the scope a
  reader must hold; this package never asks whether that scope exists or who holds it. A directory to check would
  give executive intelligence a second opinion about who a principal is, and the institution would find out about the
  disagreement with the identity domain as a leak rather than as an error.
- **No domain→domain package import** (ADR-0010); the organization node and every evidence citation enter through
  directory ports bound at the composition root.
- **TD-49 (new).** Two deferrals, neither weakening an absolute invariant. (a) The KPI-key, index-key,
  dashboard-key, briefing-key and attention-key guards are **check-then-act in the service** — all of them are
  DB-backed and reject `23505`, so a concurrent clash costs a less friendly error rather than a lost invariant, and
  the two rules that would actually matter under concurrency (one live reading per period, one published definition
  per key) are held by **partial unique indexes** rather than by service code. (b) **Reproduction recomputes on the
  caller's thread**: `GET command/assessments/:id/reproduction` re-runs `assessIndex` from the assessment's pinned
  inputs synchronously, which is bounded by ten pillars but is still work done inline; moving it behind a queue
  belongs with the outbox work in TD-01.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via the
  offline path; the seven-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 32 `command.*` events ride the same bus.

## 8. Outcome

The command layer is complete behind its gates, and the platform has **one definition of institutional health**. The
computational core is pure, deterministic and clock-free (eight engines, seven aggregates, **985 tests**, no model
runtime, no clock, no network). A KPI reading **cannot exist without evidence**, and its standing is **derived from
its weakest citation** rather than declared by its author. A missing pillar is **excluded rather than zeroed**, so an
unmeasured institution never scores like a failing one; coverage **travels with the score**, and an assessment below
the floor computes but is **not citable**. The fingerprint is a **digest over pinned inputs with no tolerance**, and
reproduction runs the real engine. A dashboard **omits rather than denies**, and the vocabulary has no word for a
blanked tile. One definition per index key is **published at a time, enforced by the database**; an assessment
**freezes at finalisation** and a wrong period is invalidated rather than recomputed; a briefing **pins its figure**.
The attention queue **raises on absence** as readily as on breach and closes only by a human's judgement, with
dismissals explained. `command:brief` stands alone, so computing the number is not the authority to narrate it. All
seven tables are FORCE-RLS tenant-isolated and **none carries a soft-delete column**, because every aggregate here is
a record of what was measured, computed, said or noticed.

Thirteen increments, each verified and pushed. **Reminder: rotate the GitHub PAT** used for pushes at this milestone
boundary — it has not yet been rotated across the P2-D18…D29 boundaries.
