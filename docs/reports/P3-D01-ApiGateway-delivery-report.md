# Engineering Delivery Report — P3-D01

**API Gateway & Integration Fabric** · Phase 3 (Enterprise Integration Engineering) · Program: Integration Spine (D01–D03)

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P3-D01 — API Gateway & Integration Fabric                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Status**     | 🟡 Delivered — pending CI. `@knowget/gateway` typecheck/lint/format/build clean, **948 tests** (27 files); `apps/api` typecheck/lint/build clean + gateway DI-graph spec (3 tests) in the **244-test** api suite. Full monorepo green (TD-12 on the Prisma build in-sandbox).                                                                                                                                                                                                                                                                            |
| **Depends on** | Phase 2 certification (`v0.3.0`) in full — this contract decides what all thirty-six of those contracts look like from outside. P2-D01-M01 (Organization) and P2-D01-M02 (Person) via directory ports; **P2-D01-M05 (Universal Authorization)** — the roles register is what makes a route's required scope a name the platform actually issues; **P2-D26 (AI Operating System)** — its tool catalog is the register an internal target resolves against. P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). **First contract of Phase 3**, and first of its twelve. |
| **Date**       | 1 January 2027                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Next**       | P3-D02 — Event Mesh, Streaming & Messaging (second spine contract)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 1. Mission recap

Deliver the **integration fabric** — the first contract of Phase 3, and the one the phase plan makes structural
rather than conventional: the gateway, the event mesh (D02) and identity federation (D03) are the spine, and the
nine vendor-facing contracts that follow each arrive behind an adapter this fabric already describes.

Thirty-six contracts of Phase 2 came before it and every one of them models something the institution _does_.
This one models nothing the institution does. It decides what all of that work is allowed to look like from
outside: which capabilities an integrator can reach, under what contract, at what version, at what rate, with
what guarantee that calling twice charges once, and where the platform's own notifications go when something
happens that somebody else is waiting for.

One rule defines the contract: **expose capabilities, never implementation**. It sits under the rule the phase
plan attaches to all twelve of its contracts: **every external vendor sits behind an adapter; gateway, event mesh
and federation form the spine**.

The design problem is that **the external surface is the only part of a platform that cannot be refactored.**
Everything else here can be split, renamed, moved between services or rewritten, because the only thing that
depends on it is other code in this repository. The moment a path is published, an integrator writes it into a
system the institution does not own, cannot see and will not be told about, and from then on the platform's
freedom to change itself is bounded by a promise it made to somebody who is not in the room when the change is
proposed. Built carelessly, this domain would make that promise accidentally, in a hundred small places — a route
whose path names the module that answers it, an error that mentions a service, an event carrying a handler name, a
contract edited in place to fix a field — and the platform would discover, years later, that it cannot move a
capability without breaking four integrations it has no record of. So the rule is engineered as **structure rather
than as editorial discipline**.

Four absences are load-bearing and were decided before anything was written. **There is no clock** — every
instant a decision turns on enters as an argument, so a rate-limit window, a retry schedule, a deprecation notice
and an idempotency expiry are each decidable without asking what time it is, and each is recomputable months later
from what was logged beside it. **There is no unseeded randomness** — retry jitter is a hash of the delivery's own
identity. **There is no I/O** — nothing here holds an HTTP client, opens a socket or signs a request. **And there
is no secret** — a credential arriving as plaintext is refused by the value objects rather than stored, because a
gateway is precisely where a leaked one is worth the most. What the package does _not_ own matters as much: rate-limit
**counting** belongs to `@knowget/security`, delivery **mechanics** to `@knowget/jobs`, the transactional outbox to
`@knowget/events`, and runtime retry, timeout and circuit **execution** to `@knowget/reliability`. This package
holds the limit, not the counter; the schedule, not the timer; the subscription, not the socket; the posture, not
the executor. As with every domain here, the design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Eight pure, deterministic, **clock-free** engines built and tested first: **admission** (`admitRequest` — the one decision the gateway exists to make, composing the others rather than recomputing them), **quota** (`assessQuota` — a consumption figure against a policy, and when the allowance returns), **policy** (`policyApplies` / `resolvePolicy` / `UNLIMITED` — which numbers apply to a caller), **negotiation** (`compareContractVersions` / `latestServableVersion` / `negotiateVersion` — which version a caller is seated on), **lifecycle** (five `inspect*Transition` maps + `inspectServing` + `inspectDeprecation` — every legal state move in the domain, plus the notice floor), **routing** (`inspectExternalPath` / `resolveRoute` / `publishedMethods` — the contract's rule as arithmetic over paths), **circuit** (`inspectCircuit` — an endpoint's posture from what has been observed of it), **backoff** (`planBackoff` — when a failed delivery returns, and when it stops) |
| **Domain**      | `@knowget/gateway` — eight aggregates: `ApiConsumer` (who may call, under which scheme, with which scopes), `ApiContract` (what is promised, at which version, immutably once published), `CapabilityRoute` (the published address and the internal target it never discloses), `TrafficPolicy` (the limits, resolved by specificity), `IntegrationEndpoint` (an outbound address as protocol + adapter key + credential _reference_), `WebhookSubscription` (which curated facts go where), `OutboundDelivery` (every attempt, and how it ended), `IdempotencyRecord` (which guarded writes have already happened); eight application services on the platform event bus, **36 `gateway.*` events**, **71 typed errors**, 6 ports. **No Prisma, no NestJS, no HTTP client, no socket library, no provider SDK, no `fetch`, no clock, no `Math.random`; credential-, target-, free-text- and payload-free events**                                                                                          |
| **Persistence** | Eight models in `schema.prisma` + one migration (`20270101000000_add_gateway`, 448 lines — the platform's 42nd), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **no table carries a soft-delete column and no repository declares a delete**; flat string arrays as `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` per the house convention and **no GIN index on any of them** (evidence in §6); five absolute uniques DB-backed plus **three partial uniques that hold rules rather than shapes** — one live address per `(method, path)`, one _original_ delivery per `(subscription, event)`, and one active policy per `(scope, subject)` with `NULLS NOT DISTINCT` so a second `global` policy cannot slip past on NULL ≠ NULL                                                                                                                                                                                                                          |
| **API**         | Eight Prisma/RLS repositories + six directory adapters + **eight permission-gated controllers / 82 endpoints** under `apps/api/src/domains/gateway`, split `gateway:read` (every read) / `gateway:publish` (what the outside world can see) / **`gateway:admit` (admitting an outsider, standing apart)** / `gateway:integrate` (arranging outbound work) / `gateway:operate` (the operational rota); all bodies zod-validated; module wires 8 repos + 6 directories + 8 services and imports Organization, Person, Roles and Agent Orchestration; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                                                                                                           |

## 3. The rule, as structure

**A published contract cannot be edited, and the inconvenience is the feature.** Not to fix a field name, not to
tighten a validation, not to add a parameter everybody will obviously want. The document an integrator wrote code
against is the only thing standing between the platform refactoring itself and their code breaking at a moment
nobody chose — and an edit does not update their code, it makes their code wrong, silently. There is deliberately
**no flag for a small change**, because _small_ is a judgement made by the person making the change and
experienced by somebody else; the field that carried the judgement would become the field every change was
classified into. What replaces editing is versioning, and **two versions answering at once is the mechanism rather
than a defect to be minimised**. The specification is a handle (`specificationRef`) rather than a stored document
for the adjacent reason: a document inside the aggregate is a document somebody edits without moving the status.

**The internal target appears in no view, no event and no error.** `CapabilityRoute` holds `internalTarget`
because something must answer, and `toPublicRouteView` — the only function by which a route leaves the aggregate —
does not carry the field. Everything downstream (the resolver, the published catalogue, the error responses, a
future developer portal) is therefore _structurally_ unable to disclose what implements a capability rather than
merely well-behaved about it. The counterpart is that **retargeting is permitted while a route is live**:
`retargetCapabilityRoute` changes what answers without touching the path, the method, the version or the required
scope, so moving a capability to a new module or splitting it across two is invisible from outside. A gateway that
made retargeting hard would be a gateway that quietly taught its own engineers to publish implementation names,
because that is the path of least resistance when the alternative is a migration. The external surface — path,
required scope, whether repeat calls are protected — is editable while the route is a draft and frozen from the
moment it activates.

**The deprecation notice floor is ninety days and is not a parameter.** `MIN_DEPRECATION_NOTICE_DAYS` is 90 and
`inspectDeprecation` refuses anything shorter, with no field that could carry an exception. The pressure to
shorten a notice period is always real, always urgent and always comes from inside the institution; the cost
always lands on integrators who are not in the room when it is applied. Holding it up, **the default version is
the newest one that is not on notice** — not simply the newest, because a caller who never named a version has
expressed no opinion about migration, and seating them on a version already announced for sunset enrols them in a
deadline they did not agree to and will not read about. A **deprecated version is served when it is asked for by
name**, carrying its notice and sunset date on every response, because someone who pinned `v2` knows what they
pinned and refusing them early is the platform deciding their migration schedule. Ordering is **numeric runs
first, then code points** — `v2` before `v10`, which a lexical sort gets backwards — and never `localeCompare`,
whose result would depend on the data centre's locale.

**And the fabric's own notifications withhold four categories of field.** Of the 36 `gateway.*` events: **no
credential handle ever travels** — a consumer's and endpoint's `credentialRef` and a subscription's `secretRef`
are absent from every payload including the rotation events whose whole subject is that one of them changed,
because a handle is an address in the custody store and an address broadcast to every subscriber is an invitation
to go and ask. **No internal target ever travels**, so a route event names the capability, version, method and
published path — the four things an integrator already knows. **No free text travels**: a suspension reason is
somebody's account of why an integration was cut off and a delivery's `lastError` is a _third party's response
body_. **And no idempotency key or payload travels**, because the bus is not the ledger.

## 4. Authority — five scopes, and why `gateway:admit` stands apart from `gateway:integrate`

`gateway:read` is every read — the consumer register, the contract catalogue, routes, policies, endpoints,
subscriptions, the delivery record and the idempotency ledger — and is deliberately wide, because an institution
that cannot see what it has promised to whom has no integration governance to speak of. `gateway:publish` is the
acts that change what the outside world can see: defining, publishing, deprecating and sunsetting contracts, and
registering, retargeting and activating routes. `gateway:integrate` is arranging outbound work — endpoints and
subscriptions. `gateway:operate` is the operational rota: traffic policies, delivery replay and abandonment, the
endpoint quarantine sweep, and the ledger purge.

**`gateway:admit` stands apart, and is the separation that matters most here.** Registering a consumer, granting
its scopes, rotating its credential, suspending and retiring it all sit there. Admitting a caller and arranging an
integration are different acts: the first decides _who may reach the institution_ and the second only decides
where the institution's own notifications go. Bundling them would hand the ability to issue external access to
everybody who ever needed to add a webhook — which, in a school, is everybody who has ever integrated an
attendance kiosk or a fee gateway.

**Delivery mechanics are exposed nowhere.** `dispatch`, `schedule`, `recordSuccess`, `recordFailure`,
`recordOutcome`, `recordOutcomes`, `begin` and `complete` have no routes at all, and each controller's JSDoc argues
why: a route letting an operator mark a delivery delivered would let the record say the institution told somebody
something it never told them, which is precisely the claim that table exists to make unfalsifiable. The same
reasoning removes the bare tenant-wide list from the idempotency controller — the port carries none to expose,
because a table taking a row per guarded write does not materialise into a report anybody reads.

## 5. Every verdict is recomputable, and nothing is drawn from a random source

**Admission has a fixed order and the first failure wins: who you are, whether you may, whether the thing is
served, how big it is, how fast you are going.** Order is not presentation; it decides which of several true
statements the caller is told, and only one of them names a remedy they can act on. A suspended consumer also over
quota should hear that they are suspended, because waiting will not help them and calling their account manager
will. Two orderings inside that are load-bearing. **Authorisation is settled before existence** — scope is checked
before route status, so a caller without the scope is refused identically whether the route is active, still a
draft, or was retired years ago; the alternative is an enumeration oracle answered one request at a time, in which
`route_not_active` for one path and `scope_not_granted` for another leaks the shape of the platform to anybody with
a credential and a list of guesses. **And payload size is settled before quota**, because a body over the ceiling
will be refused on every retry, so a `throttle` would send the caller away to fail identically in a minute and
would spend their allowance on a request that was never going to be served. `deprecated` is reported on **every**
verdict including refusals, since the integrations most in need of the warning are the ones failing often enough
that somebody is reading the responses.

**Quota windows are fixed, realigned rather than restarted, and every quota refusal is a `throttle`.** A sliding
window is more accurate, costs a per-request history per consumer, and cannot be explained — _you may make a
hundred calls a minute_ is a sentence an integrator can design against. When a recorded window has elapsed the
request falls into a later window whose start is a whole number of periods after the recorded one, so a consumer
who went quiet for an afternoon cannot reset their window to a moment of their choosing. `deny` belongs to
admission and means the request will never be served in that form; `rate_limit_exceeded` on a minute or an hour is
a caller going too fast and `quota_exhausted` on a day or a month is a caller who has spent an allocation, because
a client told only that it was rejected retries a monthly quota every thirty seconds for three weeks. Which
numbers apply is decided by **specificity as a fact about the vocabulary rather than a comparator somebody wrote**:
`POLICY_SCOPES` is an ordered frozen array and `policySpecificity` is its index, so every scope has a distinct rank
and ties are impossible — a platform where two policies can both claim to be the applicable one is a platform
where a consumer's effective rate limit depends on row order.

**Retry backoff is a written table with derived jitter, and there is no random source in the package.**
`BACKOFF_BASE_SECONDS` is `[30, 120, 480, 1800, 3600, 3600]` and `MAX_DELIVERY_ATTEMPTS` is its length, so
lengthening the schedule is one edit that raises the allowance and supplies the new interval together rather than
two that can disagree; the last two steps deliberately stop doubling, because a pure exponential reaches useless
intervals faster than a receiver's maintenance window ends. Jitter is an FNV-1a hash of the delivery's identifier
**mixed with the attempt number** — mixing the attempt in re-draws the order at every step, where a constant
per-delivery offset would spread the first wave and then reproduce that same wave at identical relative offsets
forever. Deliveries spread because their identifiers differ, and any one delivery's whole schedule is recomputable
from its row months later. A platform that jittered randomly could tell an integrator their webhook was late and
could never tell them by how much it was supposed to be.

**The payload never reaches this package — only a digest of it does**, because telling two requests apart requires
only that they can be told apart, and a ledger holding request bodies is a second copy of every mutation the
institution has ever made sitting in a table nobody thinks of as sensitive. **The delivery mode is snapshotted at
schedule time**, so a consumer switching a subscription to at-most-once this afternoon is stating what they want
from future events rather than retroactively abandoning fourteen retries already in flight. **Dead-lettered and
abandoned are different ends and only one may be replayed** — the first ran out of attempts against a receiver
that stayed down, the second was given up on by a decision, and replaying an abandoned delivery would send, to
somebody who may have been offboarded, an event that was deliberately withheld; `replay` creates a **new** record
and leaves the original exactly as it failed, because the attempt history is what a consumer asking _did you ever
try_ is owed. **And health is observed while status is decided** — `applyCircuitVerdict` writes health, posture and
the failure counters and never touches `status`, so a burst of timeouts during a vendor's fifteen-minute incident
cannot silently take an integration out of service and leave the institution to find out a week later through the
work that did not happen. Quarantine (the platform's own conclusion after an hour of an open circuit) and
disablement (an operator's decision, for reasons the platform cannot see) stay different words on the record,
which is why the second carries a required reason and the first does not.

**One key in the package is deliberately not normalised.** Every other is folded to lowercase against the
platform's grammar; the idempotency key is preserved exactly as the caller wrote it, because a capability key is a
name the platform issues and an idempotency key is an opaque token the client generated — folding its case would
silently merge two keys the client believes are distinct, turning their correct code into a lost mutation.
`conflicted` is entered **only** from `in_flight`: a `completed` record is left exactly as it was, because its
result is bound to the fingerprint that produced it and the original caller's retry must still replay correctly,
so poisoning it would convert one caller's bug into a failure for somebody else's correct code. And a record past
`IDEMPOTENCY_RETENTION_SECONDS` (86,400) is treated as **absent** by inspection, so the purge can run late, run
twice, or not run for a month without changing one answer the ledger gives.

## 6. Quality gates

`@knowget/gateway`: typecheck / lint / format / build clean, **948 tests across 27 files** (eight engine suites,
eight aggregate suites, eight service suites, plus events, values and ports) over 30 source files. `apps/api`:
typecheck / lint / build clean, gateway DI-graph spec (**3 tests** — the eight controllers, the eight exported
service tokens, and the six ports) in the **244-test** api suite — 82 files, and with a live Redis, as in CI, the
three Redis-gated integration files run rather than skip, so the suite is **244/244 with no skips**. Full monorepo
green: typecheck 141/141 projects, lint 75/75, build 74/74, and all 42 migrations replay from an empty schema to
233 tables. Only `prisma migrate deploy` and the `@knowget/database` integration test stay unrunnable in-sandbox
(TD-12 — both need the real Prisma engines CI downloads); the eight gateway models were instead diffed
column-for-column against the live database, 8/8 matching with no drift. Repo-wide `pnpm format:check` clean.

Migration audited directly against Postgres after a full 42-migration replay to **233 tables**: all eight tables
`ENABLE` + `FORCE ROW LEVEL SECURITY` under exactly one policy each, every one of them named `tenant_isolation`
and carrying **both** a USING and a WITH CHECK clause (fail-closed); **zero foreign keys**, **zero `deleted_at`
columns** and **zero GIN indexes** across the contract; 56 indexes present (48 declared plus eight primary keys),
of which 16 are unique — five absolute and **three partial**, each holding a rule rather than a shape:
`capability_route_live_address_key` on `(tenant_id, method, external_path) WHERE status <> 'retired'`,
`outbound_delivery_original_event_key` on `(tenant_id, subscription_id, event_id) WHERE replay_of_delivery_id IS
NULL`, and `traffic_policy_active_scope_key` on `(tenant_id, scope, consumer_id, capability_key) NULLS NOT
DISTINCT WHERE active`.

Two of those three deserve their reasoning stated, because the shape is unusual. The delivery index is partial on
`replay_of_delivery_id IS NULL` so that **one original delivery per `(subscription, event)`** is held by Postgres
while replays are exempt — a replay is by definition a second row for the same event, and a total unique would
have made the remedy for a dead-lettered delivery impossible. The policy index uses **`NULLS NOT DISTINCT`**
because a `global` policy has NULL in both subject columns, and under the default NULL-distinct semantics two
global policies would both be accepted; the whole point of resolving by specificity is that exactly one policy can
claim each rank.

**The absent GIN index is a finding rather than an omission.** Granted scopes, published methods and subscribed
event types are all `TEXT[]`, and the obvious index for a containment predicate on them is GIN. It would be
unreachable: `arraycontains` (`@>`), `arrayoverlap` (`&&`) and `jsonb_contains` all have `proleakproof = f`, so
under FORCE ROW LEVEL SECURITY a containment test on a policy-protected table can **never** become an Index Cond
and is always demoted to a post-security Filter. The index would be dead in every index shape at every
cardinality, and shipping one would be a claim about performance that no query plan could ever honour. The only
sound GIN indexes in the schema remain the two on `service_search_document`, which carries no row-level security.

The DI-graph spec asserts the **six ports** bind, not only the services — and four of them carry a rule of the
contract rather than a convenience. The scope catalogue is what makes a route's required permission a name the
platform actually defines and a consumer's grant a subset of it; the capability target directory is what makes an
internal target resolve to something the platform knows how to invoke; the adapter registry is what stops an
endpoint naming a transport this build does not carry; the event-type catalogue is what keeps a subscription
inside the curated set the institution is willing to promise. A port that silently failed to bind would turn "the
scope exists", "the target is invocable", "the adapter is built" and "the event is published" into claims nothing
checked, while every guard in the package still appeared to pass.

## 7. Boundaries & debt

- **This fabric holds every limit and not one counter.** It computes verdicts from figures supplied to it and
  executes nothing: `@knowget/security` counts requests, `@knowget/jobs` performs delivery, `@knowget/events`
  holds the transactional outbox, and `@knowget/reliability` runs retries and timeouts. Every figure a decision
  turns on arrives as an argument, which is what makes a three-month-old verdict recomputable from what was logged
  beside it — and is also why four other packages are load-bearing at runtime.
- **Two or more versions of a capability will be live at once, permanently, and that is the design.** The platform
  carries the maintenance of every version it has not sunset, and the ninety-day floor means it carries each one
  for at least a quarter after deciding to stop. An institution running one version at a time is one that breaks
  its integrators every release.
- **The adapter manifest is empty in this build, and honestly so.** `ADAPTER_MANIFEST` is an empty `Map`, so every
  endpoint registration is currently refused for naming an adapter this build does not carry. That is the correct
  behaviour for a fabric with no adapters yet rather than a gap — the alternative, a registry that accepted any
  key, would let an operator configure an outbound integration that could never run and discover it when the
  events started piling up. The first real HTTPS adapter and the delivery worker are **forward dependencies**,
  recorded in TD-52, and they arrive with D04–D08's vendor contracts.
- **The event-type catalogue is curated at twenty-one institutional facts**, which is far fewer than the platform
  publishes. A subscription can only be taken out on an event the institution has decided to promise externally;
  payroll and payslip events are deliberately excluded. Widening the set is a decision with an audience, and
  making it a decision is the point.
- **This package validates no token, mints none and holds no key.** `AUTH_SCHEMES` records which scheme a consumer
  uses and nothing here verifies one — a gateway that grew its own would be the platform's second opinion about
  who somebody is. Identity federation and SSO are **P3-D03**; AI provider access is **P3-D09**; device and sensor
  transports are **P3-D10**.
- **No domain→domain package import** (ADR-0010); the organization node, the person, the scope catalogue, the
  capability target, the adapter registry and the event-type catalogue all enter through six directory ports bound
  at the composition root, and **every port is a read**.
- **TD-52 (new).** Deferrals, none weakening an absolute invariant. (a) Seven **check-then-act** guards across six
  services — the consumer key, the contract's `(capability, version)`, a route's `(contract, method)` and its
  `(method, external path)`, the endpoint key, the subscription key and a policy's `(scope, subject)` — so under
  genuinely concurrent creation two callers could each read the same name free. **Six of the seven are DB-backed**
  and reject `23505`, and the three rules that would actually matter under concurrency are held by **partial unique
  indexes** rather than by service code (one live external address, one original delivery per event, one active
  policy per rank). The one unbacked guard is `requireMethodFree` — one non-retired route per contract per method —
  which is a narrower statement than the address uniqueness Postgres already holds. `outbound_delivery` and
  `idempotency_record` carry **no service guard at all**, their uniqueness being DB-only, which is the stronger
  arrangement and the one the other six should converge on. (b) The **adapter registry and event-type catalogue are
  declarative**, so no HTTPS adapter or delivery worker exists yet. (c) `resolveRoute`, `admitRequest` and
  `inspectCircuit` run **in-process on the caller's thread**; all three are bounded, and queueing belongs with the
  outbox work in TD-01.
- **TD-05 re-targeted, not resolved.** The register named **P3-D01** as the point at which `@knowget/sdk` would
  grow past `health()`. That point has now arrived and passed: this contract built the fabric an SDK would speak
  _through_ — the contract catalogue, the versioning grammar, the admission verdicts — but shipped no client
  surface, because a typed SDK belongs with the developer-experience contract that owns its ergonomics. It now
  points at **P3-D12**, following the Phase-2 certification precedent that a register naming a milestone already
  past has stopped saying anything.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via the
  offline path; the eight-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 36 `gateway.*` events ride the same bus. Note the
  circularity worth naming: this contract's outbound deliveries are how institutional facts leave the platform,
  and they depend on an outbox whose streaming backbone is **P3-D02** — the next contract.

## 8. Outcome

The integration fabric is complete, and the platform can now be refactored behind its own promises. The
computational core is pure, deterministic, clock-free and free of any random source (eight engines, eight
aggregates, **948 tests**, no I/O, no clock, no secret, no `Math.random`). A published contract **cannot be
edited** and there is no flag for a small change; a deprecation carries at least **ninety days** and there is no
field that could request less; the **internal target appears in no view, event or error**, so a capability can be
moved, split or rewritten with one `retargetCapabilityRoute` call and no integrator learns that it happened.
Admission refuses in a **fixed order** with authorisation settled before existence — closing the enumeration
oracle — and payload size before quota, reporting `deprecated` even on refusals. Quota windows are **realigned
rather than restarted**, `throttle` and `deny` stay different words because they imply opposite remedies, and
policy specificity is an **index into a frozen array** rather than a comparator anybody can change. Retry backoff
is a **written table with FNV-1a jitter mixed with the attempt**, so a delivery's whole schedule is recomputable
from its row months later. Only a **digest** of a payload reaches the package; the delivery mode is snapshotted at
schedule; **dead-lettered and abandoned** are different ends and only the first may be replayed, as a new record
beside the original; health is observed while **status is decided by a person**. The caller's idempotency key is
preserved exactly as written, `conflicted` is entered only from `in_flight`, and expiry is read rather than
enforced. All eight tables are FORCE-RLS tenant-isolated with **three partial uniques holding rules Postgres now
enforces**, and **none carries a soft-delete column** — a consumer that was retired, a contract that was sunset
and a delivery that was abandoned are all things the institution did, and the record of them is the point.

Fourteen increments, each verified and pushed. **This opens Phase 3; the next contract is P3-D02 — Event Mesh,
Streaming & Messaging, which the outbound-delivery path is already waiting on.**

**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated
across the P2-D18…D30 boundaries, the Phase-2 close-out, or P3-D01.
