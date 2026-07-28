# 48. Executive Intelligence: one package, seven aggregates, eight pure engines, ten pillars that are excluded rather than zeroed, a standing derived from the weakest evidence rather than declared, a fingerprint with no tolerance, and a dashboard that omits rather than denies

- **Status:** Accepted
- **Date:** 2026-12-30
- **Contract:** P2-D29 (Executive Intelligence, Governance & Institutional Command)

## Context

P2-D29 is **the fifth contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the full operational base **D01–D24**, the **Institutional Knowledge Graph
(P2-D25)**, the **Enterprise AI Operating System (P2-D26)**, **Institutional Decision Intelligence (P2-D27)** and
**Predictive Intelligence (P2-D28)**. It is where the platform stops holding twenty-four domains' answers and
states **how the institution is doing**.

Every preceding contract measured something. None of them was asked to say what those measurements amount to
together, and the reason is that the question is harder than any of the individual ones: an institution's health
is not a fact any single domain holds, and the act of combining is where the platform can most easily produce
something that looks like knowledge and is not.

One rule defines the contract, and it is three requirements in one sentence:

> **Role-aware dashboards, a reproducible Institutional Health Index across ~10 domains, evidence-traceable
> KPIs.**

Each is a failure mode of executive reporting written as a requirement. A dashboard that shows everyone the same
thing either over-discloses to most of its readers or under-serves the few it was built for. A composite index
nobody can recompute is an assertion with a decimal point in it — quoted in a board paper, an inspection
response, a funding case, in rooms its author will not be standing in. And a KPI whose provenance is a number in
a cell is unfalsifiable: it cannot be checked, corrected, or argued with, only believed or ignored.

The design problem this contract poses is therefore **plausibility, not accuracy**. A composite's characteristic
failure is not being wrong; it is coming out at 71, looking exactly like a measurement, and saying nothing about
the fact that four of its ten pillars were silent this term and the six that reported were the six that always
report. Nobody who reads it can tell. Nothing about the artifact warns them. So each of the three requirements is
expressed as **structure rather than as procedure**: an exclusion the arithmetic performs rather than a caveat
somebody writes, a standing derived from evidence rather than claimed by an author, a fingerprint over exactly
what the value depends on and nothing else, a panel set the reader's own grants compose.

Nothing in `@knowget/executive-intelligence` imports Prisma, NestJS, an HTTP client, a model runtime, a provider
SDK or `fetch`; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and
`@knowget/events`. Two absences carry weight. **There is no clock**: a period is an integer the caller declares,
staleness is a distance between two of them, and no arithmetic here consults the date it runs on. **And this
contract recomputes nothing it cites** — it does not re-derive an attendance rate, re-score an assessment or
re-run a forecast; it records the figure the owning domain published and the record it came from. As with every
domain here, the design **begins with the pure engines**.

## Decision

1. **Eight pure engines are the computational core, built and tested first.** The **measurement engine**
   (`validateScale`, `clampOutcomeFor`, `normalizeMeasure`, `measure`) turns a domain's raw figure into a
   0–100 score on a declared scale, and is the only place polarity is interpreted. The **banding engine**
   (`bandFor`, `worstBand`, `bestBand`, `bandMovement`, `isBandFall`, `summarizeTrend`) turns scores into the
   five-band vocabulary and says which way a series is moving. The **weighting engine** (`validateWeights`,
   `redistribute`, `redistributedWeight`) is what makes a composite a composite. The **indexing engine**
   (`assessIndex`, `rollUpPillars`, `rankByDrag`, `isCitable`) is the Institutional Health Index itself. The
   **traceability engine** (`validateEvidence`, `auditTrace`) is the contract's third clause. The
   **reproducibility engine** (`fingerprintRun`, `reproduce`) is its second. The **composition engine**
   (`validatePanels`, `composeFor`) is its first. The **attention engine** (`isBreachBand`, `attentionKeyFor`,
   `raiseForIndex`, `raiseForPillar`, `raiseForKpi`, `rankAttention`) is what turns a period's arithmetic into
   something somebody is asked to do.

   Every engine is a function of its arguments and nothing else. **There is no clock**: `isReadingCurrent`
   compares two declared period ordinals rather than a timestamp against `now`, so a test never depends on the
   day it runs and two callers assessing the same period always agree about what was stale. `INDEX_PRECISION` is
   `6` and `WEIGHT_PRECISION` is `4`, and every derived value is rounded before it is stored — which is what
   makes the reproducibility check exact rather than approximate.

2. **A pillar that did not report is excluded, never zeroed. This is the single most consequential line in the
   contract.** A school whose wellbeing lead was on leave for a term did not have a wellbeing collapse, and a
   composite that treats absence as a score of nothing manufactures one — then the following term's recovery
   reads as a triumph, and both numbers are fiction. Excluded pillars appear as `PillarOmission`s carrying a
   reason (`no_input`, `kpi_coverage`, `unscoreable`, `not_weighted`), and their weight is **redistributed**
   across the pillars that did report rather than silently dragging the index toward zero.

   The **weight set drives the walk, not the inputs**. Every declared pillar is accounted for — as a contribution
   or as an omission — and an input for a pillar the definition never mentioned is set aside as `not_weighted`
   rather than folded in. An index that silently absorbed an extra pillar would stop being comparable to its own
   previous periods, which is the one property a health index has to keep.

3. **Coverage is reported rather than assumed, and an insufficient assessment computes but cannot be cited.**
   `MIN_PILLAR_COVERAGE` is `0.6` and `MIN_KPI_COVERAGE_PER_PILLAR` is `0.5`; `pillarCoverage` and
   `weightRedistributed` travel with the value permanently, so nobody has to reconstruct after the fact how much
   of the institution the number actually saw. An assessment below the floor **still computes** — it is useful,
   and suppressing it would only push people back to spreadsheets — but it is marked insufficient, and
   `isCitable` is false, so the aggregate refuses to finalize it and refuses to let a briefing be drafted from
   it. The number exists for the people fixing the coverage; it is not available to the people quoting it.

   Coverage is tested **before** the score is. A pillar that reported two of its nine indicators has a score, and
   that score may well be strange, but the useful thing to tell an administrator is that it barely reported.
   Complaining about the number a thin sample produced sends them to inspect an aggregation that is working
   correctly on the little it was given.

4. **The pillars are a closed set of ten, and the weights are bounded on both sides.** `HEALTH_PILLARS` are
   `academic_outcomes`, `learner_wellbeing`, `attendance_engagement`, `teaching_quality`, `workforce_capacity`,
   `financial_health`, `operational_continuity`, `family_partnership`, `admissions_growth` and
   `governance_compliance` — the contract's "~10 domains" resolved to a fixed vocabulary, because a pillar set a
   tenant could extend would make two institutions' indices incomparable while both were called the same thing.
   A definition need not weight all ten, but `MIN_DECLARED_PILLARS` (`⌈0.6 × 10⌉` = **6**) is the floor.

   `WEIGHT_TOTAL` is `1`, `MIN_PILLAR_WEIGHT` is `0.01` and **`MAX_PILLAR_WEIGHT` is `0.5`**. The ceiling is the
   interesting one: without it, a definition could weight one pillar at 0.95 and the other nine at rounding
   error, and the result would still be called an Institutional Health Index while measuring one thing. The
   floor does the mirrored job — a pillar carrying 0.001 is decoration, and decoration in a weight set is worse
   than omission because it makes coverage look better than it is.

5. **A reading's standing is derived from its weakest evidence and can never be declared.** `EVIDENCE_KINDS` are
   `domain_record`, `assessment_result`, `audit_finding`, `forecast_run`, `decision_record`,
   `knowledge_assertion` and `manual_return`; `EVIDENCE_STANDING` maps each to `measured`, `projected` or
   `attested`, and `weakestStanding` takes the softest, because a number is only as answerable as its weakest
   support — citing the register _and_ somebody's estimate does not make the estimate firmer.

   Standing is **not a field an author sets**. It travels with the reading into every pillar score and every
   index value that consumes it, which is what stops a green index built entirely on attested returns from
   reading identically to one built on the register. `EVIDENCE_REQUIRING_ATTESTOR` is exactly
   `["manual_return"]`: a manual return is somebody's figure or it is nobody's, while every other kind points at
   a record that already carries its own authorship — demanding an attestor there would record the person who
   ran the report rather than the person accountable for the number, which is a worse trace that looks like a
   better one.

6. **Evidence is a precondition of recording a reading, not a field on one.** `validateEvidence` reports all
   six `EVIDENCE_ISSUE_CODES` at once — `no_evidence`, `missing_source_domain`, `missing_source_ref`,
   `missing_attestor`, `attestor_not_required`, `duplicate_citation` — and a reading whose citations do not hold
   up is **not a poorly documented reading, it is not a reading**. `attestor_not_required` is a real failure
   rather than a tolerated extra: an attestor on a `domain_record` names somebody who did not produce the
   figure, and a trail that points at the wrong person is worse than one that points at nobody.

   Citations resolve through the `EvidenceRecordDirectory`, bound at the composition root across Assessment &
   Evaluation, Predictive Intelligence, Decision Intelligence and the knowledge graph's assertions by kind, and
   through the graph by `(sourceDomain, sourceRef)` for everything else — which is what P2-D25 is for rather
   than a convenient fallback. A citation the platform cannot resolve is refused at the moment it is made.

7. **Reproducibility is a fingerprint over exactly what the arithmetic reads, and there is no tolerance.**
   `fingerprintRun` canonicalizes the pinned inputs — the weight set and the pillar inputs, rounded to the
   package's precisions — and digests them to a `FINGERPRINT_LENGTH` (16) hex string. It covers **no period, no
   author, no timestamp, no status**, so a mismatch always means the inputs differ somewhere the value could
   depend on. That is what separates a reproduction from a coincidence: an index that comes out at 71.4 again
   from a different input set has _not_ been reproduced, and a comparison that only looked at values would have
   called it confirmed.

   `reproduce` re-runs through `assessIndex` — **the real engine, not a copy of it**, because a checker with its
   own arithmetic verifies the checker. And there is no tolerance band: not a small one, not a configurable one.
   Every derived value is rounded to `INDEX_PRECISION` before storage precisely so that identical can mean
   identical, and a tolerance on top of that would be nothing but a place for a real change to hide, which is
   the only thing a tolerance is ever used for once a system is under pressure. The same call answers the
   domain's second question: re-run against the pinned inputs and any disagreement means the record is wrong;
   re-run against today's inputs and `inputs_changed` is expected, and what matters then is the drift. One
   engine, because these are the same arithmetic asked at two moments, and two engines would eventually disagree
   about what "the same" meant.

   The digest is **FNV-1a and deliberately non-cryptographic**. It detects an input set that changed between two
   runs — an edited reading, a re-weighted definition, a pillar that quietly appeared — which is the failure a
   health index actually suffers. It is **not a tamper control and must never be used as one**: the pinned
   inputs themselves are the record, and a platform that treated a matching digest as proof of integrity would
   have built an authenticity guarantee out of a hash function chosen for being fast.

8. **A dashboard omits what the reader may not see; it never denies it.** `PANEL_VISIBILITY_OUTCOMES` is the
   one-member set `["omitted"]`, and that is the whole design. `composeFor` takes the reader's granted scopes
   and returns the panels those scopes reach — a withheld panel leaves no placeholder, no lock icon, no "you do
   not have access to Financial Health". A dashboard that showed the shape of what it was hiding would disclose
   the thing the scope exists to protect: that there is a financial-health figure this quarter worth looking at.
   A dashboard whose every panel is withheld composes to an **empty page**, which is a coherent thing to serve.

   `PANEL_SUBJECTS` is a **total map** over `PANEL_BINDINGS` rather than a switch, so adding a binding fails to
   compile until somebody has said what it is about — a new binding that silently defaulted to needing no
   subject would compose into an empty tile, which is the one outcome the engine exists to prevent.
   `MAX_PANELS_PER_DASHBOARD` is `40`, and the seven `PANEL_ISSUE_CODES` are the whole vocabulary of the check.

9. **The attention queue raises on absence as loudly as on failure.** `ATTENTION_REASONS` are `band_breach`,
   `band_fall`, `sustained_decline`, `target_miss`, `index_drop`, **`coverage_gap`**, **`evidence_stale`** and
   **`standing_weakened`**. The last three are the point: an engine that raised alarms only about bad numbers
   would treat "we stopped measuring safeguarding" as silence, and silence as health — which is the precise
   failure the coverage floors exist to make impossible. `SUSTAINED_DECLINE_PERIODS` is `3`, because two is
   noise in nearly every institutional series and four is late enough that the term is over before anyone is
   told; `MAX_READING_AGE_PERIODS` is `4`; `BREACH_FLOOR_BAND` is `healthy`.

   `attentionKeyFor` makes an item's identity a function of what it is about, so a sweep **restates** a finding
   that got worse rather than raising a second one — severity and observed quantity move, identity does not,
   because a problem that got worse is the same problem. Closure is by judgement and **never by deletion**: a
   finding acted on is resolved, one that should not have been raised is dismissed **with a compulsory reason**,
   and both stay on the record. The next period's sweep is how this contract checks its own advice, and it
   cannot corroborate or contradict a decision that was erased — which is also why a sweep leaves closed items
   untouched. `rankAttention` orders the queue loudest-first in the domain rather than at the caller, because an
   unordered queue is a list, and the one thing a queue owes whoever opens it is that the top of it is the thing
   to do next.

10. **A briefing pins its figure at drafting and is filtered by audience rather than composed down.** An
    `ExecutiveBriefing` copies the assessment's recorded index in rather than resolving it live. A board pack
    whose numbers were read back through the assessment would silently restate itself when that assessment was
    later invalidated — the minute would keep saying "as reported to the board" while displaying a figure the
    board never saw. `assessmentId` says which arithmetic it came from without making the document depend on
    that arithmetic still standing, and drafting is refused against an assessment that is not final.

    Reads are **filtered, not composed down**, which is the deliberate opposite of what dashboards do. A
    dashboard with its unreachable panels removed is a coherent page; a briefing with its unreachable findings
    stripped out would be an argument presented without the evidence it rests on — worse than being told the
    document is not for you. A document outside the reader's audience answers as **absent rather than
    forbidden**, because "there is a board briefing about this quarter that you may not read" is itself a
    disclosure about the institution's state. Nothing is deleted: a briefing the institution no longer stands
    behind is **withdrawn**, because the minute that cites it still has to resolve — to the document, and to the
    fact that it was taken back.

11. **One pure package, `@knowget/executive-intelligence`, seven aggregates.** `KpiDefinition` (the measurable
    thing, its scale, polarity, target and pillar; `draft → active → retired`, retirement keeping the readings
    and only closing the catalog). `KpiReading` (one period's figure with its evidence and derived standing;
    live or `withdrawn`). `HealthIndexDefinition` (the weight set an institution stands behind; `draft →
published → superseded | retired`). `HealthIndexAssessment` (one period's computed index with its
    contributions, omissions, coverage and fingerprint; `provisional → final | invalidated`). `Dashboard` (a
    declared panel set and the scopes each panel needs; `draft → published → archived`). `ExecutiveBriefing`
    (what the institution told its leadership, with the figure pinned; `drafting → issued → withdrawn`).
    `AttentionItem` (a finding on a period's queue; `open → acknowledged → resolved | dismissed`).

12. **No domain→domain package import; two directory ports instead.** `OrganizationDirectory` resolves the
    organization every KPI, index, dashboard and briefing hangs off (P2-D01-M01). `EvidenceRecordDirectory`
    resolves **what a citation actually points at**, and it is the contract's third clause made structural: an
    `assessment_result` through Assessment & Evaluation, a `forecast_run` through Predictive Intelligence, a
    `decision_record` through Decision Intelligence, a `knowledge_assertion` through the graph's assertions, and
    everything else through the **P2-D25 knowledge graph** by `(sourceDomain, sourceRef)`.

    An unresolvable citation answers `false` and the reading is refused. A directory that returned `true` for
    kinds it does not know would leave the guard running on every request and checking nothing on most of them,
    which is worse than no guard because it reads like one and would be trusted like one — and it would turn
    "evidence-traceable" into "shaped like a trace" across every reading in the domain while every other test
    still passed. The module's DI-graph spec therefore asserts **both directories bind**, not only the services.

13. **The API splits along authority, in five permission scopes.** `command:measure` gates recording,
    withdrawing and correcting readings — separate from everything else because a reading is the evidence every
    index above it stands on, and correcting one retroactively moves figures the institution has already
    reported. `command:manage` gates the catalog and the composition: defining KPIs, authoring and publishing
    index definitions, reweighting, declaring dashboards. `command:operate` gates the runtime that computes,
    finalizes and invalidates assessments and works the attention queue. **`command:brief` stands alone**:
    computing a score and telling a board about it are different acts — the first is arithmetic the platform can
    check, the second is a statement the institution answers for — and the ability to run an assessment is not
    the ability to report one under the institution's name. `command:read` is every read and is deliberately
    wide, because a health index nobody may inspect fails this contract as surely as one nobody can recompute.
    **69 endpoints across 7 controllers**, all permission-gated, every body zod-validated.

    Three deliberate asymmetries. `POST command/attention/sweep` answers **200 rather than 201**, because a
    sweep is idempotent by restatement and the second run of a period usually creates nothing. The briefing
    controller's author-side reads (`issued/:organizationId`, `by-assessment/:assessmentId`,
    `by-key/:briefingKey`, `:id`) are gated on `command:brief` rather than `command:read` despite writing
    nothing, because they bypass the audience filter and the map of who each document was addressed to is
    exactly what `listVisible` declines to hand out. And accountable identity — who acknowledged, resolved or
    dismissed a finding — is taken from the authenticated principal and **never read from a body anywhere in
    this domain**, because an accountability trail a caller could address to anybody is a field rather than a
    trail.

14. **Seven FORCE-RLS tables, and not one of them carries a soft-delete column.** No aggregate in this domain
    has a delete path, so there is no column to imply one: a KPI definition is retired, a reading is withdrawn,
    an index definition is superseded or retired, an assessment is invalidated, a dashboard is archived, a
    briefing is withdrawn, an attention item is resolved or dismissed. Every one of those is a **state the
    record keeps**, and declaring a `deleted_at` that no read filters would be worse than not having it. Three
    absolute uniques are DB-backed — KPI `(tenant, kpi_key)`, assessment `(tenant, index_key, period)`,
    dashboard `(tenant, dashboard_key)`, briefing `(tenant, briefing_key)`, attention `(tenant, assessment_id,
key)` — and **two status-scoped uniques are DB-backed as partial indexes**: one live reading per
    `(tenant, kpi_definition, period)` `WHERE withdrawn_at IS NULL`, and **one published definition per
    `(tenant, index_key)` `WHERE status = 'published'`**. The second is the notable one: "at most one published
    version of an index at a time" is the invariant that keeps a period's assessments comparable, and it is
    enforced by Postgres rather than by a service read.

15. **32 `command.*` events carry ids, keys, statuses, bands, standings, reason codes, coverage ratios and
    counts — never raw figures, never prose, never people.** A KPI's `name` and `description`, an index's and a
    dashboard's, a briefing's `title` and `narrative`, a withdrawal's reason, an invalidation's reason and an
    item's closure note all stay in the domain; so do `acknowledgedBy` and `closedBy`, because an event is a
    broadcast and a broadcast that names staff turns an operational feed into a surveillance feed.

    Three exclusions are specific to this contract. **A reading's raw value never travels** — the figure belongs
    to the domain that published it, this contract cites that domain and never recomputes its number, and an
    attendance rate arriving on two channels is exactly the duplication the platform exists to remove (the
    second copy is always the one that goes stale). The **normalized score does** travel, because it is this
    contract's own product and it is what a subscriber reacting to a movement actually needs. **A briefing's
    cited figure never travels**, because a briefing is the one record here that declares the scope a reader
    must hold, and putting its number on a broadcast channel would route around the single access control the
    record carries. **A weight set never travels**: a reweighting says the composition changed, which is the
    routing-relevant fact; what it changed to is a governance record, read deliberately by someone who will be
    asked to justify it.

## Consequences

- The platform now has **one definition of institutional health**, and the three requirements are structural
  rather than procedural: a pillar that did not report is excluded by the arithmetic rather than caveated in
  prose, a reading's standing is derived from its weakest citation rather than claimed by its author, the
  fingerprint covers exactly what the value depends on, and a dashboard's panel set is composed by the reader's
  own grants. Twenty-four domains' measurements roll up through this rather than into a spreadsheet.
- **A thin index says it is thin, and cannot be quoted.** Coverage travels with the value permanently, an
  assessment below the floor computes but `isCitable` is false, and finalization and briefing are both refused.
  The number stays available to the people fixing the coverage and unavailable to the people quoting it, which
  is the only version of "reproducible index" that survives contact with a board paper.
- **Absence is an alarm.** `coverage_gap`, `evidence_stale` and `standing_weakened` mean the queue reacts to an
  institution that stopped measuring, not only to one that measured something bad. This is the failure mode most
  executive dashboards have by construction, and closing it is what makes the ten-pillar index honest over a
  year rather than over a quarter.
- **Any figure can be re-derived, and a mismatch is diagnostic.** `reproduce` re-runs the real engine against
  pinned inputs with no tolerance band, and reports whether the record is wrong or the institution moved. The
  absence of a clock is what makes that answer stable; the absence of a tolerance is what stops it being
  negotiated.
- **Reporting is separated from computing**, at the permission layer and in the aggregate. `command:brief`
  stands alone, a briefing pins its figure at drafting, issued documents stop being revisable, and a withdrawn
  one keeps its whole text — so an institution can ask what it was told, what the arithmetic said, and what
  became of both, which are three different questions.
- **P2-D25 is load-bearing again.** Evidence citations outside the four directly-bound domains resolve through
  the graph by `(sourceDomain, sourceRef)`, which makes graph population a real operational prerequisite for
  KPIs measured out of those domains. That cost is intended: a KPI citing a record the institution cannot
  identify is a number attributed to nothing.
- **P2-D28's boundary held.** A `forecast_run` citation is admissible evidence and confers `projected` standing
  rather than `measured`; this contract does not project anything itself, and the standing vocabulary is how a
  forecast-backed KPI stays visibly different from a measured one all the way up into the index.
- The deferrals are recorded as **TD-49**: the KPI-key, dashboard-key, briefing-key and attention-key guards are
  check-then-act in the service (every one of those uniques is DB-backed and rejects `23505`, so the window is a
  friendlier error rather than a lost invariant), assessment computation and re-verification run on the caller's
  thread, and the ten-pillar vocabulary is the deliberate scope of this contract. None weakens an absolute
  invariant.

## Alternatives considered

- **Score a non-reporting pillar as zero.** Rejected, and it is the alternative that mattered most. It
  manufactures a collapse the institution did not have, then manufactures a recovery the following term, and
  both numbers look exactly like measurements. Exclusion with redistribution and a reported coverage ratio is
  the only treatment that leaves the artifact honest about what it saw.
- **Suppress an index that falls below the coverage floor.** Rejected — suppression pushes people back to
  spreadsheets, which is where the platform found them. Computing it, marking it insufficient, and refusing to
  let it be finalized or cited keeps it useful to the people who can fix the coverage and unavailable to the
  people who would quote it.
- **Let a tenant declare its own pillars.** Rejected — two institutions' indices would be incomparable while
  both were called an Institutional Health Index, and the comparison is most of the value. A closed ten with a
  six-pillar floor lets a definition emphasize without letting it redefine.
- **Drop the maximum pillar weight.** Rejected — a definition weighting one pillar at 0.95 would still be called
  a health index while measuring one thing, and it would be authored under exactly the pressure that makes it
  attractive. A ceiling of 0.5 costs a legitimate author nothing.
- **Let an author declare a reading's standing.** Rejected — standing exists to stop a green index built on
  attested returns from reading like one built on the register, and a declared standing is the first field an
  author under pressure would set to `measured`. Deriving it from the weakest citation removes the move.
- **Make evidence an optional field validated at finalization.** Rejected — the same failure as D27's grounds
  and D28's assumptions: an unevidenced reading would exist, be listed, be scored and occasionally be consumed
  by a path that forgot to check. Refusing at recording is the only version of "evidence-traceable" that is
  true.
- **Accept an attestor on any evidence kind.** Rejected — an attestor on a `domain_record` names the person who
  ran the report rather than the person accountable for the figure, which is a worse trace that reads like a
  better one. `attestor_not_required` is a real issue code for that reason.
- **Allow a tolerance on the reproducibility check.** Rejected — every derived value is already rounded to a
  declared precision so that identical can mean identical. A tolerance on top of that has exactly one use, which
  is to let a real change hide inside it once somebody wants it to.
- **Use a cryptographic digest for the fingerprint.** Rejected as the wrong shape of guarantee, not as too slow:
  the pinned inputs are the record and the digest is only the cheap way to notice they moved. Reaching for
  SHA-256 here would invite the digest to be treated as a tamper control, which it is not and must not become.
- **Have the reproduction check use its own arithmetic.** Rejected — a checker with its own copy of the
  arithmetic verifies the checker, and the two would drift within a release or two. `reproduce` calls
  `assessIndex`.
- **Show withheld dashboard panels as locked placeholders.** Rejected — the placeholder discloses the thing the
  scope protects: that there is a figure there this quarter. Omission with a single visibility outcome is the
  whole point, and an all-withheld dashboard composing to an empty page is a coherent answer rather than an
  error.
- **Filter a briefing's findings down instead of withholding the document.** Rejected — a briefing with its
  unreachable findings stripped is an argument without the evidence it rests on, which is worse than being told
  the document is not for you. Dashboards compose down; briefings filter. The asymmetry is deliberate.
- **Resolve a briefing's index figure live from its assessment.** Rejected — the document would silently restate
  itself when the assessment was invalidated, while still reading "as reported to the board". Pinning the figure
  and keeping `assessmentId` records both what was said and where it came from.
- **Reopen a closed attention item when a later sweep re-raises it.** Rejected — reopening deletes the evidence
  that a human looked, which is the only thing separating a queue from a stream of alerts. A restatement moves
  severity within an open item; a closed one stays closed and the next period's sweep is how the domain checks
  its own advice.
- **Make dismissal's reason optional, like a resolution's note.** Rejected — dismissing is the one closure that
  says the institution looked at what its own arithmetic produced and decided it did not matter, and the reason
  is the only feedback anyone tuning these engines will ever get. A queue of unexplained dismissals is
  indistinguishable from a queue nobody reads.
- **Fold `command:brief` into `command:operate`.** Rejected — computing a score and telling a board about it are
  different acts with different accountability, and one scope would make the operator who ran the assessment the
  person who reports it under the institution's name.
- **Publish the reading's raw value on the event bus.** Rejected — the figure belongs to the domain that
  published it, and a second copy on another channel is the duplication the platform exists to remove. The
  normalized score travels because it is this contract's own product; the raw figure is somebody else's record.
