# 50. API Gateway & Integration Fabric: one package, eight aggregates, eight pure engines, a published contract that cannot be edited, an internal target that appears in no view, event or error, retry jitter derived from a delivery's own identity rather than drawn from a random source, and a fabric that holds every limit and not one counter

- **Status:** Accepted
- **Date:** 2027-01-01
- **Contract:** P3-D01 (API Gateway & Integration Fabric)

## Context

P3-D01 is **the first contract of Phase 3 — Enterprise Integration Engineering**, and it comes first because
the phase plan makes it structural rather than conventional: the gateway, the event mesh (P3-D02) and identity
federation (P3-D03) are the spine, and the nine vendor-facing contracts that follow each arrive behind an
adapter this fabric already describes. It stands on the certified `v0.3.0` baseline — the frozen Phase-1 core,
the seven-milestone identity and organization foundation, the full operational base **D01–D24**, and the
intelligence core **D25–D30**.

Thirty contracts of Phase 2 came before it and every one of them models something the institution _does_. This
one models nothing the institution does. It decides what all of that work is allowed to look like from outside:
which capabilities an integrator can reach, under what contract, at what rate, with what guarantee that calling
twice charges once, and where the platform's own notifications go when something happens that somebody else is
waiting for.

One rule defines the contract:

> **Expose capabilities, never implementation.**

And it sits under the rule the phase plan attaches to all twelve of its contracts:

> **Every external vendor sits behind an adapter; gateway, event mesh and federation form the spine.**

The design problem is that **the external surface is the only part of a platform that cannot be refactored.**
Everything else here can be split, renamed, moved between services or rewritten, because the only thing that
depends on it is other code in this repository. The moment a path is published, an integrator writes it into a
system the institution does not own, cannot see and will not be told about, and from then on the platform's
freedom to change itself is bounded by a promise it made to somebody who is not in the room when the change is
proposed. A gateway built carelessly makes that promise accidentally, in a hundred small places — a route whose
path names the module that answers it, an error that mentions a service, an event carrying a handler name, a
contract edited in place to fix a field — and then the platform discovers, years later, that it cannot move a
capability without breaking four integrations it has no record of.

So the rule is engineered as **structure rather than as editorial discipline**. A published contract is
immutable, and the mechanism for changing a capability is a new version beside the old one. A route holds an
internal target because something has to answer, and the only function that produces an outward-facing view
does not carry the field — so the resolver, the catalogue, the errors and the events downstream of it are
_unable_ to disclose what implements a capability rather than merely well-behaved about it. And every external
system the platform calls is named by an adapter key rather than by a vendor, so ending a contract with a
payment provider is one field on one row rather than a migration of everything that referred to them by name.

Nothing in `@knowget/gateway` imports Prisma, NestJS, an HTTP client, a socket library or a provider SDK; its
only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and `@knowget/events`. Four
absences are deliberate and load-bearing. **There is no clock** — every instant a decision turns on enters as
an argument, so a rate-limit window, a retry schedule, a deprecation notice and an idempotency expiry are each
decidable without asking what time it is, and each is recomputable months later from what was logged beside it.
**There is no unseeded randomness** — retry jitter is a hash of the delivery's own identity, which spreads a
thundering herd exactly as well as a random source and reproduces the schedule a support conversation is
actually about. **There is no I/O** — nothing here holds an HTTP client, opens a socket or signs a request; an
endpoint is a protocol, an adapter key and a credential _reference_. **And there is no secret** — a credential
arriving as plaintext is refused by the value objects rather than stored, because a gateway is precisely where
a leaked one is worth the most.

What this package does not own matters as much as what it does, and the boundaries were drawn before anything
was written. Rate-limit **counting** belongs to `@knowget/security`, delivery **mechanics** to `@knowget/jobs`,
the transactional outbox to `@knowget/events`, and runtime retry, timeout and circuit **execution** to
`@knowget/reliability`. This package holds the limit, not the counter; the schedule, not the timer; the
subscription, not the socket; the posture, not the executor. Identity federation (P3-D03), AI provider access
(P3-D09) and device transports (P3-D10) are contracts of their own later in this phase. As with every domain
here, the design **begins with the pure engines**.

## Decision

1. **Eight pure engines are the computational core, built and tested first.** The **admission engine**
   (`admitRequest`) is the one decision the gateway exists to make and composes the others rather than
   recomputing them. The **quota engine** (`assessQuota`) reads a consumption figure against a policy and says
   when the allowance returns. The **policy engine** (`policyApplies`, `resolvePolicy`, `UNLIMITED`) picks the
   numbers that apply to a caller. The **negotiation engine** (`compareContractVersions`,
   `latestServableVersion`, `negotiateVersion`) decides which version a caller is seated on. The **lifecycle
   engine** (five `inspect*Transition` maps, `inspectServing`, `inspectDeprecation`) is every legal state move
   in the domain plus the notice floor. The **routing engine** (`inspectExternalPath`, `resolveRoute`,
   `publishedMethods`) is the contract's rule as arithmetic over paths. The **circuit engine**
   (`inspectCircuit`) decides an endpoint's posture from what has been observed of it. The **backoff engine**
   (`planBackoff`) says when a failed delivery returns, and when it stops.

2. **A published contract cannot be edited, and the inconvenience is the feature.** Not to fix a field name,
   not to tighten a validation, not to add a parameter everybody will obviously want. The document an integrator
   wrote code against is the only thing standing between the platform refactoring itself and their code breaking
   at a moment nobody chose — and an edit does not update their code, it makes their code wrong, silently. There
   is deliberately **no flag for a small change**, because _small_ is a judgement made by the person making the
   change and experienced by somebody else. What replaces editing is versioning: a change to a published
   capability is a new contract at a new version, and two versions answering at once is the mechanism rather
   than a defect to be minimised.

3. **The deprecation notice floor is ninety days and is not a parameter.** `MIN_DEPRECATION_NOTICE_DAYS` is 90
   and `inspectDeprecation` refuses anything shorter, with no field that could carry an exception. The pressure
   to shorten a notice period is always real, always urgent and always comes from inside the institution; the
   cost always lands on integrators who are not in the room when it is applied.

4. **The internal target appears in no view, no event and no error.** `CapabilityRoute` holds
   `internalTarget` because something must answer, and `toPublicRouteView` — the only function by which a route
   leaves the aggregate — does not carry it. Everything downstream (the resolver, the published catalogue, the
   error responses, the developer portal) is therefore _structurally_ unable to disclose what implements a
   capability. The specification is a handle (`specificationRef`) rather than a stored document for the adjacent
   reason: a document inside the aggregate is a document somebody edits without moving the status.

5. **Retargeting is permitted while a route is live, and the external surface freezes when it activates.**
   `retargetCapabilityRoute` changes what answers without touching the path, the method, the version or the
   required scope, so moving a capability to a new module or splitting it across two is invisible from outside.
   The path, the required scope and whether repeat calls are protected are editable while the route is a draft
   and none of them afterwards. A gateway that made retargeting hard would be a gateway that quietly taught its
   own engineers to publish implementation names, because that is the path of least resistance when the
   alternative is a migration.

6. **The capability, version and style are copied from the contract onto the route on purpose.** Every inbound
   call resolves against those three fields, and a resolution needing a second read to learn them would put a
   join on the hot path of every request the platform serves. The copy cannot drift, because none of the three
   is revisable on the contract either — a contract may change its title and its specification handle, never
   what it is or which version it is.

7. **The default version is the newest one that is not on notice.** Not simply the newest: a caller who never
   named a version has expressed no opinion about migration, and seating them on a version already announced for
   sunset enrols them in a deadline they did not agree to and will not read about. Only when every servable
   version is on notice does the default fall back to the newest of those. A **deprecated version is served
   when it is asked for by name**, carrying its notice and sunset date on every response, because someone who
   pinned `v2` knows what they pinned and refusing them early is the platform deciding their migration schedule.
   Ordering is **numeric runs first, then code points** — `v2` before `v10`, which a lexical sort gets backwards
   — and never `localeCompare`, whose result would depend on the data centre's locale.

8. **Admission has a fixed order and the first failure wins: who you are, whether you may, whether the thing
   is served, how big it is, how fast you are going.** Order is not presentation; it decides which of several
   true statements the caller is told, and only one of them names a remedy they can act on. A suspended consumer
   also over quota should hear that they are suspended, because waiting will not help them and calling their
   account manager will.

9. **Authorisation is settled before existence, and payload size before quota.** Scope is checked before route
   status, so a caller without the scope is refused identically whether the route is active, still a draft, or
   was retired years ago — the alternative is an enumeration oracle answered one request at a time, in which
   `route_not_active` for one path and `scope_not_granted` for another leaks the shape of the platform to
   anybody with a credential and a list of guesses. Payload size is checked before quota because a body over the
   ceiling will be refused on every retry, so a `throttle` would send the caller away to fail identically in a
   minute, and would spend their allowance on a request that was never going to be served. **`deprecated` is
   reported on every verdict including refusals**, since the integrations most in need of the warning are the
   ones failing often enough that somebody is reading the responses.

10. **Quota windows are fixed, realigned rather than restarted, and every quota refusal is a `throttle`.** A
    sliding window is more accurate, costs a per-request history per consumer, and cannot be explained — _you
    may make a hundred calls a minute_ is a sentence an integrator can design against. When a recorded window
    has elapsed the request falls into a later window whose start is a whole number of periods after the
    recorded one, so a consumer who went quiet for an afternoon cannot reset their window to a moment of their
    choosing. `deny` belongs to admission and means the request will never be served in that form;
    `rate_limit_exceeded` on a minute or an hour is a caller going too fast and `quota_exhausted` on a day or a
    month is a caller who has spent an allocation, because a client told only that it was rejected retries a
    monthly quota every thirty seconds for three weeks.

11. **Policy specificity is a fact about the vocabulary rather than a comparator somebody wrote.**
    `POLICY_SCOPES` is an ordered frozen array — `global`, `capability`, `consumer`, `consumer_capability` — and
    `policySpecificity` is its index, so every scope has a distinct rank and ties are impossible. A platform
    where two policies can both claim to be the applicable one is a platform where a consumer's effective rate
    limit depends on row order. A policy's **scope and subject are one fact checked as one** (a `consumer` policy
    naming nobody and a `global` policy naming somebody are both refused), a policy that **sets nothing** is
    refused because an all-null row satisfies every audit and constrains nothing, half a rate limit is refused
    for the same reason, and a policy is **active the moment it is defined** — nothing external can see one, so
    a two-step activation buys nothing and its failure mode is that the protection an operator believes they
    configured is not in force.

12. **The credential is a reference and never the credential, and the refusal does not echo the value.**
    Registration and rotation both refuse anything that is not a handle over `CREDENTIAL_PROVIDERS` (`vault`,
    `kms`, `env`, `secretstore`), and the error deliberately omits the rejected string: by the time it is
    refused it may well be a live key, and echoing it would write it to the log the check exists to keep it out
    of. The same stance covers an endpoint's `credentialRef` and a subscription's `secretRef`. `AUTH_SCHEMES`
    records which scheme a consumer uses and this package never validates a token, mints one or holds a key —
    a gateway that grew its own would be the platform's second opinion about who somebody is.

13. **Scopes are checked for grammar here and for existence at the composition root.** A grant naming a scope
    the platform does not issue is worse than granting nothing, because it looks granted while every downstream
    check compares against a string no route will ever require. But whether a scope exists is a question about
    the platform's catalogue rather than about this consumer, so the aggregate enforces that a grant names at
    least one well-formed scope and the `ScopeCatalogue` port — backed by the roles register at the composition
    root — resolves them. The fabric enforces scopes it does not own.

14. **Health is observed; status is decided.** `applyCircuitVerdict` writes health, posture and the failure
    counters and never touches `status`: an endpoint stops being called only when a person or an explicit
    quarantine says so. The alternative is a fabric in which a burst of timeouts during a vendor's
    fifteen-minute incident silently takes an integration out of service and the institution finds out a week
    later through the work that did not happen. **Quarantine and disablement are kept apart** — quarantine is
    the platform's own conclusion after `CIRCUIT_QUARANTINE_AFTER_SECONDS` (3,600) of an open circuit,
    disablement is an operator's decision for reasons the platform cannot see — which is why a disablement
    carries a required reason and a quarantine does not: the reason for a quarantine is the posture, health and
    failure count already on the record.

15. **The circuit is decided at the endpoint, over every subscription sharing it.**
    `CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD` (5), `CIRCUIT_MIN_OBSERVATIONS` (20), `CIRCUIT_FAILURE_RATIO` (0.5),
    `CIRCUIT_DEGRADED_RATIO` (0.1), `CIRCUIT_PROBE_AFTER_SECONDS` (60) and `CIRCUIT_HALF_OPEN_SUCCESSES` (3) are
    constants rather than per-endpoint configuration. A subscription keeps a consecutive-failure run so an
    operator can see which ones are struggling, and it never changes its own status: a receiver that is down is
    down for all of them, and five subscriptions to one dead address should not each discover that separately.

16. **Retry backoff is a written table with derived jitter, and there is no random source in the package.**
    `BACKOFF_BASE_SECONDS` is `[30, 120, 480, 1800, 3600, 3600]` and `MAX_DELIVERY_ATTEMPTS` is its length, so
    lengthening the schedule is one edit that raises the allowance and supplies the new interval together rather
    than two that can disagree. The last two steps deliberately stop doubling, because a pure exponential
    reaches useless intervals faster than a receiver's maintenance window ends. Jitter (`BACKOFF_JITTER_RATIO`
    0.2) is an FNV-1a hash of the delivery's identifier **mixed with the attempt number** — mixing the attempt
    in re-draws the order at every step, where a constant per-delivery offset would spread the first wave and
    then reproduce that same wave at identical relative offsets forever. Deliveries spread because their
    identifiers differ, and any one delivery's whole schedule is recomputable from its row months later. A
    platform that jittered randomly could tell an integrator their webhook was late and could never tell them
    by how much it was supposed to be.

17. **The payload never reaches this package — only a digest of it does.** A delivery carries a fingerprint and
    an idempotency record carries a request digest, because telling two requests apart requires only that they
    can be told apart, and a ledger holding request bodies is a second copy of every mutation the institution
    has ever made sitting in a table nobody thinks of as sensitive. The body lives with the outbox that produced
    it under that data's own retention, and is fetched at dispatch time. **The delivery mode is snapshotted at
    schedule time**, so a consumer switching a subscription to at-most-once this afternoon is stating what they
    want from future events rather than retroactively abandoning fourteen retries already in flight.

18. **Dead-lettered and abandoned are different ends, and only one of them may be replayed.** A dead-lettered
    delivery ran out of attempts against a receiver that stayed down, and the ordinary remedy is to fix the
    receiver and replay it. An abandoned delivery was given up on by a decision — a revoked subscription, an
    event the institution stopped wanting sent — and replaying it would deliver, to somebody who may have been
    offboarded, an event that was deliberately withheld. `replay` creates a **new** record aimed at wherever the
    subscription now points and leaves the original exactly as it failed, because the attempt history is what a
    consumer asking _did you ever try_ is owed. `abandon` requires a reason because nothing else records one:
    dead-lettered is the platform saying it could not get through, abandoned is a person saying to stop trying.

19. **The idempotency key is the caller's and is preserved as they wrote it; `conflicted` is entered only from
    `in_flight`; and expiry is read rather than enforced.** Every other key in the package is normalised to
    lowercase against the platform's grammar and this one is deliberately neither — a capability key is a name
    the platform issues, an idempotency key is an opaque token the client generated, and folding its case would
    silently merge two keys the client believes are distinct, turning their correct code into a lost mutation.
    When a key is reused with a different digest, a `completed` record is left exactly as it was (its result is
    bound to the fingerprint that produced it, and the original caller's retry still replays correctly) while an
    `in_flight` record is marked `conflicted` and its completion refused, because two different requests are now
    outstanding under one key and whichever finishes first would complete a record the other caller reads as
    theirs. A record past `IDEMPOTENCY_RETENTION_SECONDS` (86,400) is treated as **absent** by inspection, so
    the purge can run late, run twice, or not run for a month without changing one answer the ledger gives.

20. **Six directory ports, no domain→domain package import** (ADR-0010), **and every port is a read.**
    `OrganizationDirectory` and `PersonDirectory` anchor the tenant's structure and its named owners.
    `ScopeCatalogue` makes a route's required permission a name the platform actually defines and a consumer's
    grant a subset of it. `CapabilityTargetDirectory` makes an internal target resolve to something the platform
    knows how to invoke, and is bound to the P2-D26 agent tool catalogue — the platform's existing register of
    things it can be asked to do. `AdapterRegistry` stops an endpoint naming a transport this build does not
    carry, and `EventTypeCatalogue` keeps a subscription inside the curated set of twenty-one institutional
    facts the institution is willing to promise. The last two are **declarative rather than discovered**: the
    manifest is an honest empty `Map` in this build and the catalogue a frozen set, because a registry that
    scanned for adapters would report whatever happened to be loaded.

21. **Five scopes gate 82 endpoints across eight controllers, and `gateway:admit` stands apart from
    `gateway:integrate`.** `gateway:read` is every read. `gateway:publish` is the acts that change what the
    outside world can see — defining, publishing, deprecating and sunsetting contracts, registering, retargeting
    and activating routes. `gateway:admit` is admitting an outsider: registering a consumer, granting its scopes,
    rotating its credential, suspending and retiring it. `gateway:integrate` is arranging outbound work —
    endpoints and subscriptions. `gateway:operate` is the operational rota: traffic policies, delivery replay and
    abandonment, and the ledger purge. Admitting a caller and arranging an integration are separated because the
    first decides _who may reach the institution_ and the second only decides where the institution's own
    notifications go; bundling them would hand the ability to issue external access to everybody who needed to
    add a webhook. **Delivery mechanics are exposed nowhere**: `dispatch`, `schedule`, `recordSuccess`,
    `recordFailure`, `recordOutcome(s)`, `begin` and `complete` have no routes, because a route letting an
    operator mark a delivery delivered would let the record say the institution told somebody something it never
    told them, which is the one thing that table exists to prevent.

22. **Eight FORCE-RLS tables, forty-eight indexes, three of the uniques partial, no foreign keys, and flat
    string arrays as `TEXT[]` rather than JSONB.** `api_consumer`, `api_contract`, `capability_route`,
    `traffic_policy`, `integration_endpoint`, `webhook_subscription`, `outbound_delivery` and
    `idempotency_record` each `ENABLE` + `FORCE ROW LEVEL SECURITY` under exactly one `tenant_isolation` policy
    (USING + WITH CHECK, fail-closed). Five of the uniques are absolute and **three are partial, because in each
    case a total unique would forbid something the domain has to allow**: `capability_route_live_address_key` on
    `(tenant_id, method, external_path) WHERE status <> 'retired'`, so a public address can be reissued once the
    route holding it is retired; `outbound_delivery_original_event_key` on `(tenant_id, subscription_id,
event_id) WHERE replay_of_delivery_id IS NULL`, so the original send of an event to a subscription stays
    once-only while replaying a dead-lettered delivery remains possible at all; and
    `traffic_policy_active_scope_key` on `(tenant_id, scope, consumer_id, capability_key) NULLS NOT DISTINCT
WHERE active`, where `NULLS NOT DISTINCT` is load-bearing rather than decorative — a `global` policy carries
    NULL in both subject columns, and default NULL-distinct semantics would let two of them stand at once and
    make resolution depend on insertion order. Granted scopes, published methods and subscribed event types are
    `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` per the house convention, and there is **no GIN index on any of
    them** — `arraycontains`, `arrayoverlap` and `jsonb_contains` are all non-leakproof, so under FORCE RLS a
    containment test on a policy-protected table can never become an Index Cond and is always demoted to a
    post-security Filter, which makes such an index unreachable at any cardinality in any index shape rather
    than merely unused.

23. **Thirty-six `gateway.*` events, with four categories of field held back.** **No credential handle ever
    travels** — a consumer's and endpoint's `credentialRef` and a subscription's `secretRef` are absent from
    every payload including the rotation events whose whole subject is that one of them changed, because a
    handle is an address in the custody store and an address broadcast to every subscriber is an invitation to
    go and ask. **No internal target ever travels**, so a route event names the capability, version, method and
    published path — the four things an integrator already knows — and says nothing about what is behind them.
    **No free text travels**: a suspension reason is somebody's account of why an integration was cut off and a
    delivery's `lastError` is a _third party's response body_, neither of which the platform should fan out to
    subscribers chosen for what they need to know rather than for what they are cleared to see. **And no
    idempotency key or payload travels**, because the bus is not the ledger.

## Consequences

- **The platform can now be refactored behind its own promises, and the promise is enforced by the type
  system rather than by review.** A capability can be moved, split or rewritten with one `retargetCapabilityRoute`
  call and no integrator learns that it happened, because no view, event or error in the domain has a field that
  could tell them.
- **Two or more versions of a capability will be live at once, permanently, and that is the design.** An
  institution running one version at a time is one that breaks its integrators every release. The cost is real:
  the platform carries the maintenance of every version it has not sunset, and the ninety-day floor means it
  carries each one for at least a quarter after deciding to stop.
- **The ninety-day notice floor will be inconvenient at exactly the moment it matters.** There is no expedited
  path and no field that could carry a request for one, which is stronger than a policy saying not to ask.
- **The fabric holds no counter, no timer, no socket and no secret, so four other packages are load-bearing at
  runtime.** `@knowget/security` counts, `@knowget/jobs` delivers, `@knowget/events` holds the outbox and
  `@knowget/reliability` executes retries and timeouts. The gateway's verdicts are computed from figures those
  packages supply, and every one of them arrives as an argument — which is what makes a three-month-old verdict
  recomputable from what was logged beside it.
- **The adapter manifest is empty in this build, and honestly so.** `ADAPTER_MANIFEST` is an empty `Map`, so
  every endpoint registration is currently refused for naming an adapter this build does not carry. That is the
  correct behaviour for a fabric with no adapters yet rather than a gap: the first real HTTPS adapter and the
  delivery worker are forward dependencies, recorded as TD-52, and the alternative — a registry that accepted
  any key — would let an operator configure an outbound integration that could never run and discover it when
  the events started piling up.
- **The event-type catalogue is curated at twenty-one institutional facts, which is far fewer than the platform
  publishes.** A subscription can only be taken out on an event the institution has decided to promise
  externally; payroll and payslip events are deliberately excluded. Widening the set is a decision with an
  audience, and making it a decision is the point.
- **`gateway:admit` being separate from `gateway:integrate` will feel like friction for small teams**, where the
  same person does both. It is retained because issuing external access to the institution and adding a webhook
  to an already-verified endpoint have different consequences when they go wrong, and a single scope hands the
  first out with the second.
- **The deferrals are recorded as TD-52** and none weakens an absolute invariant: the key-uniqueness guards are
  check-then-act in the services behind DB-backed uniques that reject `23505`, the adapter manifest and event-type
  catalogue are declarative, and no HTTPS adapter or delivery worker exists yet.

## Alternatives considered

- **Allow a published contract to be edited for small, backward-compatible changes.** Rejected, and this is the
  alternative that mattered most. _Backward-compatible_ is a judgement made by the person making the change and
  experienced by somebody whose code is already written; the field that carries the judgement becomes the field
  every change is classified into. A new version costs the platform a row and costs the integrator nothing.
- **Publish the internal target on the route view, for the developer portal's benefit.** Rejected — the portal is
  exactly the audience that must not have it, because a documented target is a target integrations will start
  addressing, and the first time one is moved the platform discovers a dependency it never agreed to.
- **Make the deprecation notice period configurable per contract or per tenant.** Rejected — a configurable floor
  is not a floor. The pressure to shorten it comes from inside the institution and the cost lands outside, which
  is the exact shape of decision a constant exists to remove from the conversation.
- **Default an unversioned caller to the newest version.** Rejected — a caller who named no version has expressed
  no opinion about migration, and seating them on a version already on notice enrols them in a deadline they
  never agreed to and will not read about. The newest version _not on notice_ is the only default that does not
  quietly create work for somebody else.
- **Refuse a request for a deprecated version.** Rejected — someone who pinned `v2` knows what they pinned, and
  refusing them is the platform choosing their migration date. Carrying the notice on every response tells them
  on every call, which reaches people an email does not.
- **Sort versions lexically.** Rejected — `v10` sorts before `v2`, so the tenth version of a capability becomes
  unreachable as a default on the day it is published and nobody notices until an integrator asks why the newest
  version is not the one they get. `localeCompare` was rejected separately: a default version that depended on
  the server's locale would sort differently in two data centres and reproduce in neither.
- **Report every applicable refusal on an admission verdict, not just the first.** Rejected — a caller needs the
  one statement that names a remedy they can act on, and a list invites a client library to retry against the
  most encouraging entry. A suspended consumer who is also over quota should hear that they are suspended.
- **Check route existence before scope.** Rejected — it is an enumeration oracle. Distinguishable refusals for
  "no such route" and "not your scope" let anybody with a credential map the platform's surface one request at a
  time, and the information is worth more to an attacker than the clarity is worth to a legitimate caller.
- **Check quota before payload size.** Rejected — an oversized body fails identically on every retry, so a
  `throttle` sends the caller away to fail the same way in a minute, and it spends their allowance on a request
  that was never going to be served.
- **Use a sliding rate-limit window.** Rejected — it is more accurate, costs a per-request history per consumer,
  and cannot be explained to an integrator in a sentence they can design against. The known cost of fixed windows
  is the boundary burst, and the burst allowance exists so an operator can price it in deliberately rather than
  discover it.
- **Restart an elapsed quota window from the current instant.** Rejected — it lets a consumer who paused reset
  their window to a moment of their choosing, which is a rate limit that anybody who reads the documentation can
  decline to be bound by. Realigning to a whole number of periods keeps the original phase.
- **Return a single `rejected` outcome instead of separating `throttle` and `deny`.** Rejected — they imply
  opposite remedies. Retrying works for the first and is wrong for the second, and one outcome leaves every client
  library retrying both, including a monthly quota, every thirty seconds, for three weeks.
- **Resolve competing policies with a comparator function.** Rejected — specificity has to be a fact about the
  vocabulary rather than a function somebody can change, or a consumer's effective rate limit becomes a property
  of row order. An ordered frozen array gives every scope a distinct rank and makes ties impossible.
- **Tolerate an all-null traffic policy, or a policy whose scope and subject disagree.** Rejected — both are rows
  that appear in every listing, satisfy every audit that checks a policy exists, and constrain nothing. A resolver
  that skipped incoherent rows would turn a data-entry mistake into a silent absence of protection discovered when
  the traffic arrived.
- **Let the circuit breaker change an endpoint's status.** Rejected — a burst of timeouts during a vendor's
  fifteen-minute incident would silently take an integration out of service, and the institution would find out a
  week later through the work that did not happen. Health is observed and status is decided by a person.
- **Merge quarantine and disablement into one `off` status.** Rejected — an operator would be left with a list in
  which the endpoints they switched off and the ones the fabric gave up on are indistinguishable, which is the
  difference between a record of decisions and a list of unresolved failures.
- **Decide the circuit per subscription rather than per endpoint.** Rejected — a receiver that is down is down for
  every subscription pointing at it, and five subscriptions each discovering that separately means five times the
  retries against a system that is already struggling.
- **Draw retry jitter from a random source.** Rejected — it spreads the herd exactly as well and makes the
  schedule unreproducible, so the platform could tell an integrator their webhook was late and never tell them by
  how much it was supposed to be. A hash of the delivery's identity mixed with the attempt gives the same spread
  and a schedule recomputable from the row months later.
- **Hash the delivery identifier alone, without the attempt.** Rejected — a constant per-delivery offset spreads
  the first wave and then reproduces that same wave, in the same order, at the same relative offsets, at every
  subsequent step. The herd is reshuffled once and never again.
- **Store the event payload on the delivery record, and the request body on the idempotency record.** Rejected —
  it would put a second copy of every mutation and every outbound fact the institution has made into two tables
  that support staff read all day. A digest tells two requests apart, which is all either module needs.
- **Read the delivery mode from the subscription at attempt time.** Rejected — a consumer switching to
  at-most-once this afternoon would retroactively abandon retries already in flight, and one switching the other
  way would get six attempts at something the platform promised to try once. The mode is snapshotted at schedule.
- **Allow an abandoned delivery to be replayed.** Rejected — an abandoned delivery was withheld by a decision, and
  replaying it would deliver an event to somebody who may have been offboarded. Collapsing the two endings puts
  things nobody may ever send into the queue of things somebody is about to send.
- **Mutate the original record on replay.** Rejected — it erases the failure the replay exists because of, and the
  attempt history is what a consumer asking _did you ever try_ is owed. The replay is a new record and both stand.
- **Normalise the idempotency key like every other key in the package.** Rejected — it is an opaque token the
  client generated, not a name the platform issues. Folding case silently merges two keys a client believes are
  distinct, which turns their correct code into a lost mutation.
- **Poison a `completed` record on an idempotency conflict, for symmetry with `in_flight`.** Rejected — tidier to
  describe and worse to live with: a completed record's result is bound to the fingerprint that produced it, so
  refusing the conflicting request and leaving the record alone keeps the innocent original caller's retry
  working. Poisoning it converts one caller's bug into a failure for somebody else's correct code.
- **Delete expired idempotency records as part of inspection.** Rejected — expiry is a read, so the purge is pure
  housekeeping that can run late, twice, or not at all for a month without changing one answer the ledger gives.
  Coupling correctness to a sweep having run is how a ledger acquires a maintenance window.
- **Discover adapters at startup instead of declaring them.** Rejected — a scanning registry reports whatever
  happened to be loaded, so the guard that stops an endpoint naming a transport this build does not carry becomes
  a guard against the previous deployment. An empty declared manifest that refuses everything is the honest state
  of a fabric with no adapters yet.
- **Let a subscription name any event the platform publishes.** Rejected — the set of facts an institution is
  willing to promise externally is smaller than the set it records, and payroll and payslip events are the clear
  case. Curation makes widening the surface a decision with an audience rather than a consequence of adding an
  event somewhere else.
- **Add a GIN index on granted scopes, published methods or subscribed event types.** Rejected on evidence: the
  containment operators are not leakproof, so under FORCE RLS such a predicate can never become an Index Cond and
  is always demoted to a post-security Filter. The index is unreachable in every index shape at every cardinality,
  and shipping one would be a claim about performance that no plan could ever honour.
- **Fold `gateway:admit` into `gateway:integrate`.** Rejected — admitting an external caller to the institution
  and pointing an already-verified endpoint at one more event are different acts with different consequences, and
  one scope hands out the first to everybody who needs the second.
- **Expose the delivery mechanics — dispatch, attempt, record-outcome — as routes.** Rejected — a route that let
  an operator mark a delivery delivered would let the record say the institution told somebody something it never
  told them, which is precisely what the table exists to make unfalsifiable.
- **Publish credential handles, internal targets, error bodies and idempotency keys on the event bus.** Rejected —
  a handle is an address in the custody store, a target is the platform's own service topology, a `lastError` is a
  third party's response body, and a key is the ledger's index. The bus fans out to subscribers chosen for what
  they need to know rather than for what they are cleared to see.
