# 51. Event Mesh, Streaming & Messaging: one package, eight aggregates, eight pure engines, a published event type that cannot be edited, a compatibility mode the registry enforces rather than records, a backbone named by reference so that no broker password can reach a database column, retention that bounds replay by arithmetic rather than by policy, a consumer position that only moves forward, and a governance layer that restates nothing the Phase-1 outbox already does

- **Status:** Accepted
- **Date:** 2027-01-02
- **Contract:** P3-D02 (Event Mesh, Streaming & Messaging)

## Context

P3-D02 is **the second contract of Phase 3 — Enterprise Integration Engineering**, and it is the second of the
three the phase plan treats as structural rather than incidental. The gateway (P3-D01) decided what the
platform's capabilities look like from outside. This contract decides what its _facts_ look like as they move —
between its own domains, out to systems the institution does not own, and back into the intelligence core that
reasons over them. Identity federation (P3-D03) completes the spine, and the nine vendor-facing contracts that
follow each arrive behind an adapter one of the three already describes.

One rule the phase attaches to all twelve of its contracts governs here as it did there:

> **Every external vendor sits behind an adapter; gateway, event mesh and federation form the spine.**

And the contract's own scope names what has to exist: a **schema registry**, **selectable delivery semantics**
(at-most-once, at-least-once, exactly-once), a **transactional outbox**, **dead-letter and replay**, and a
**mandatory event envelope** carrying event, correlation, causation, trace, tenant and aggregate identity,
versions and UTC timestamps.

The complication is that most of that already exists in some form. **P1-M05 built the platform an in-process
event bus and a transactional outbox, and thirty-one contracts have been publishing across them ever since.**
`@knowget/events` fans out and relays; `@knowget/types` defines `DomainEvent` and `EventMetadata`; every domain
from student lifecycle to platform evolution emits well-named versioned events through that machinery today. A
contract that arrived here and rebuilt any of it would be the worst possible outcome: two buses, two outboxes,
two definitions of what an event is, and a migration nobody asked for across thirty-one domains that were
working.

So the first decision was a boundary study rather than a design, and it found the gap precisely. **An outbox
record knows that a publication is pending and nothing else.** It does not know what the event type means, what
shape its payload is promised to have, which consumers are entitled to it, where any of them has got to, what
failed, or whether the thing may be sent again. `OutboxRecord` carries an id, an event, two timestamps and an
attempt count; `OutboxStore` enqueues, lists pending, marks processed and marks failed. There is no tenant on
it, no stream, no schema, no subscription, no dead letter and no replay. That is not a deficiency — it is what
mechanism looks like when it is built correctly and kept small. What the platform has never had is the
**governance** around it, and that is exactly and only what this contract adds.

The design problem is that **a mesh is the one place in a platform where the cost of a change is paid by
somebody who was not in the room when it was made.** Everywhere else, a breaking change breaks the caller in the
same repository, at build time, in front of the person responsible. Here, a field renamed in an event payload
compiles cleanly, deploys cleanly, passes its own tests, and surfaces three weeks later as a reconciliation
failure in a finance integration whose owner has never heard of the team that made the change. A consumer group
silently rewound re-processes a month of enrolments. A stream nobody declared a retention for becomes an
undeclared permanent archive of every fact the institution holds about its children. A broker password pasted
into a configuration field becomes the single credential that reads everything. None of these is caught by
review, because each of them looks correct in the diff that causes it.

So the governance is engineered as **structure rather than as editorial discipline**. A published event type is
immutable and its compatibility mode is checked rather than recorded. Retention bounds replay arithmetically, so
a stream that keeps no payload cannot be replayed with one and nobody has to remember the policy. A checkpoint
that regresses is refused by the store rather than accepted and regretted. And a binding holds a _reference_ to
its backbone's settings, so the value objects refuse a connection secret instead of trusting the caller not to
send one.

Nothing in `@knowget/event-mesh` imports Prisma, NestJS, a broker client, a socket library or a serialization
framework; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and
`@knowget/events`. Four absences are deliberate and load-bearing. **There is no clock** — every instant a
decision turns on enters as an argument, so a lag band, a retention sweep, a replay window and a deprecation
deadline are each decidable without asking what time it is, and each is recomputable months later from what was
logged beside it. **There is no unseeded randomness** — a message's partition is an FNV-1a hash of its declared
key, so the same key lands in the same partition on every node, in every process, forever, which is the whole
content of an ordering guarantee. **There is no I/O** — nothing here holds a broker client, opens a socket or
writes a row; a transport is a declaration and an adapter key, and whatever speaks the protocol lives at the
composition root. **And there is no payload this package was not told it may keep** — a stream declaring
digest-only retention carries a digest, and the type system will not let it carry more.

What this package does not own matters as much as what it does. `@knowget/events` owns the bus and the
transactional outbox; this package governs them. `@knowget/jobs` owns delivery mechanics and scheduling; this
package decides what may be delivered and how many times it may be tried. `@knowget/reliability` owns runtime
retry, timeout and circuit execution; this package holds the attempt ceiling, not the executor.
`@knowget/security` counts rate limits. `@knowget/gateway` owns the _external_ surface. Device and sensor
transports arrive at P3-D10 and reach the mesh as bindings this package already describes; AI provider access is
P3-D09; governed data products are P3-D11. As with every domain here, the design **begins with the pure
engines**.

## Decision

1. **Eight pure engines are the computational core, built and tested before anything that stores a row.** The
   **envelope engine** completes a `DomainEvent` into a mesh envelope and refuses one missing what the mesh
   mandates. The **compatibility engine** (`assessCompatibility`) reads a proposed schema against its
   predecessor under a declared mode and names the breaking changes it found. The **partitioning engine** places
   a message by hashing its declared key. The **routing engine** decides which subscriptions a message reaches.
   The **delivery engine** (`assessDelivery`, `inspectLag`) turns a subscription's state and an observed
   position into a verdict and a lag band. The **retention engine** decides what a stream may still be asked
   for. The **replay engine** (`planReplay`) decides whether a window may be read again and refuses with a
   reason. The **lifecycle engine** is every legal state move across the domain's five status unions.

2. **`@knowget/events` is mechanism, this package is governance, and not one line of the mechanism is
   restated.** The bus keeps fanning out and the outbox keeps relaying, unchanged, with `outbox` retained as a
   first-class `TransportKind` so that the machinery thirty-one contracts already publish through is a
   _supported backbone of the mesh_ rather than a legacy path to be migrated off. What changes is that both are
   now describable, attributable and bounded. There is deliberately **no second outbox, no second bus and no
   compatibility shim**, because the alternative — a mesh that owns its own queue — would have meant either two
   sources of truth about what is pending or a migration across every domain in the platform to buy nothing.

3. **The mandatory envelope completes a `DomainEvent` rather than changing `EventMetadata`.** The contract calls
   for event, correlation, causation, trace, tenant and aggregate identity on every message, and today's
   `EventMetadata` carries an event id, an occurrence instant, a version and _optional_ tenant and correlation
   ids, with no trace id and no aggregate reference. Tightening that type is the obvious move and it is
   rejected: it is emitted against by thirty-six contracts, and making two optional fields required would break
   every one of them at once for the benefit of a package none of them import yet. Instead the mesh defines its
   own envelope that a `DomainEvent` is _completed into_ at the mesh boundary, and `IncompleteEnvelopeError`
   names the field that was missing. The strictness lands where the mesh can enforce it, at the moment of
   publication into a governed stream, and no existing publisher is disturbed.

4. **The gateway's published event-type catalogue is not this registry, and no bridge is built between them.**
   `PublishedEventTypeCatalogue` in the gateway's adapters holds twenty-one institutional facts in a
   tenant-independent `ReadonlySet` and its own documentation argues that this is a curation rather than an
   index — the set of events the platform has _decided to promise externally_, deliberately excluding payroll
   and payslip facts. The mesh's registry answers a different question: every event type any tenant has
   declared, in every version, with its schema and its compatibility promise. Wiring the first to the second
   would silently convert an egress allow-list into an index of everything that exists, which is the failure the
   gateway's curation was built to prevent. They stay separate, and this paragraph exists so that the next
   engineer to notice the apparent duplication finds the reason rather than the opportunity.

5. **A published event type is immutable, and the only editable schema in the package belongs to a draft.**
   `isEventTypeSchemaEditable` is true for `draft` and nothing else. A schema change against a published type is
   a new version standing beside it, never an edit of it, because a consumer written against a shape is entitled
   to keep finding that shape. `EventTypeSchemaFrozenError` names the id and the status that froze it. There is
   deliberately **no flag for a small change**, for the reason the gateway gives about contracts: _small_ is a
   judgement made by the person making the change and experienced by somebody else.

6. **Compatibility is enforced rather than documented, and the refusal names the breaking changes.** Every event
   type declares a `CompatibilityMode` — `backward` (the default), `forward`, `full` or `none` — and the mesh
   refuses a version that violates it. `SchemaIncompatibleError` carries the event type, the version, the mode
   and a list of the specific breaking changes found, because a registry that records a compatibility promise
   without checking it is a registry that tells you which consumer broke _after_ it broke, and one that refuses
   without saying why teaches its users to set the mode to `none`.

7. **Versions are sequential from one, per event type, and a gap is refused.** `FIRST_EVENT_TYPE_VERSION` is 1,
   `NonSequentialEventTypeVersionError` carries the expected and the given number, and
   `DuplicateEventTypeVersionError` closes the other side. Sequential integers rather than semantic versions is
   a deliberate narrowing: a semantic version invites the publisher to classify their own change as a patch, and
   the classification is precisely the judgement decision 6 exists to take away from them.

8. **The deprecation notice floor is ninety days, matching the gateway's, and retirement cannot precede
   deprecation.** `MIN_DEPRECATION_NOTICE_DAYS` is 90 with no field that could carry an exception;
   `RetirementBeforeDeprecationError` refuses a schedule that runs backwards; `EventTypeNotDeprecatedError`
   refuses a retirement that skipped the notice. A consumer of an event type is in the same position as an
   integrator holding an API contract — outside the institution's release conversation — so it gets the same
   floor rather than a shorter one justified by the events being "internal".

9. **A delivery guarantee is a union member with obligations the code can be held to.**
   `DELIVERY_SEMANTICS` names `at_most_once`, `at_least_once` (the default) and `exactly_once`, and two
   predicates make the consequences structural: `requiresDeduplication` is true only for `exactly_once`, and
   `requiresRetry` is true for everything except `at_most_once`. `exactly_once` therefore _obliges_ the platform
   to keep a deduplication ledger rather than describing an aspiration, and `at_most_once` structurally cannot
   acquire a retry policy. The attempt ceiling is bounded at 1..10 with a default of 5, held here and executed
   by `@knowget/reliability`.

10. **Ordering is declared per stream, and global order means exactly one partition — by arithmetic, not by
    convention.** `ORDERING_GUARANTEES` is `none`, `partition` (the default) and `global`;
    `GLOBAL_ORDER_PARTITION_COUNT` is 1; and `GlobalOrderRequiresSinglePartitionError` refuses a stream that
    claims global order across many partitions. A platform that let those two settings disagree would be a
    platform promising total order and delivering it only until traffic arrived. Partition counts are bounded
    1..64 with a default of 8, and `MissingPartitionKeyPathError` refuses a partitioned stream that never said
    what to partition _by_.

11. **A partition is an FNV-1a hash of the declared key, and there is no random source anywhere in the
    package.** The same key lands in the same partition on every node, in every process, on every replay,
    forever — which is the entire content of a per-key ordering guarantee, and it is not something a random or
    round-robin placement can offer at any level of care. This also keeps the platform-wide certified property
    that no non-test package source file calls `Math.random()`.

12. **Retention bounds replay by arithmetic, and the default keeps a digest rather than a payload.**
    `PAYLOAD_RETENTIONS` is `none`, `digest` (the default) and `full`; `isReplayable` is true only for `full`;
    and `PayloadNotRetainedError` refuses a replay that would need a payload the stream declared it does not
    keep. Retention itself is bounded from one hour to 366 days with a thirty-day default. Defaulting to
    `digest` rather than `full` is the load-bearing choice: a mesh whose comfortable default retained every
    payload would become an undeclared permanent archive of every fact the institution holds, assembled by
    nobody's decision, and the first time anyone examined it the retention question would be years overdue.

13. **A checkpoint moves forward only, and never past the stream's head.**
    `CheckpointRegressionError` refuses a proposed position behind the committed one and
    `CheckpointAheadOfStreamError` refuses one beyond what the stream has produced. `UNCOMMITTED_POSITION` is 0
    and `FIRST_SEQUENCE` is 1, so "nothing consumed yet" is representable without a nullable column. The store
    is the only thing standing between a redeployed consumer with a stale offset and the re-processing of a
    month of enrolments, so the refusal lives there rather than in an operational runbook.

14. **A binding names its backbone by reference, `config` heads the providers, and `kms` is deliberately
    absent.** A `StreamBinding` holds a handle such as `config:mesh.kafka.primary` that must satisfy
    `isTransportReference`, and `PlaintextTransportCredentialError` refuses anything that looks like the
    settings themselves — a value with no recognised provider prefix, a value containing whitespace (a pasted
    `sasl.jaas.config` line, a PEM block, a properties fragment), or a value containing `://` (a URL, which in
    this field is either a credential in the authority or an endpoint in the wrong column). The error names the
    field and the accepted providers and **withholds the value**, because a validation message is a log line.
    `TRANSPORT_REF_PROVIDERS` leads with `config` — which the gateway's equivalent union does not have —
    because a bootstrap server list, a topic prefix and a client id are configuration rather than secrets, and a
    platform that made an operator put a hostname in a vault to satisfy a validator would get a vault full of
    hostnames and a validator nobody trusts. `kms` is omitted because a key-management service returns keys and
    a binding does not want a key; naming it would invite somebody to store a broker password as a KMS key and
    discover at the composition root that nothing can construct a transport from it.

15. **One binding carries a stream at a time, draining is a state rather than a pause, and a binding cannot
    retire undrained.** `BINDING_STATUSES` is `declared`, `active`, `draining`, `retired`;
    `BindingAlreadyActiveError` names the transport already carrying the stream; and `BindingNotDrainedError`
    refuses a retirement while undelivered messages remain, carrying the count. This is what makes the
    contract's promise of swapping in a dedicated streaming backbone _without changing publishers or consumers_
    an operation rather than an aspiration: declare the new binding, activate it, drain the old one, retire it.

16. **A transport this build does not carry is refused by name, with the available set attached.**
    `TRANSPORT_KINDS` names `in_process`, `outbox`, `kafka`, `nats`, `redpanda` and `amqp` because those are the
    backbones the platform intends to describe, and `TransportNotAvailableError` refuses a binding to one this
    build cannot actually speak, listing what it can. This follows the gateway's `ADAPTER_MANIFEST` precedent
    exactly: an honestly empty registry that refuses is better than a permissive one that lets an operator
    configure a stream which could never carry a message and discover it when the backlog is noticed.

17. **A subscription filter is a bounded predicate list over declared attributes, evaluated by the routing
    engine.** `FILTER_OPERATORS` is `equals`, `not_equals`, `in`, `prefix`, `present` and `absent`;
    `operatorTakesValues` makes the arity structural so `present` cannot arrive with values or `equals` without
    them; the list is capped at sixteen predicates of at most thirty-two values each; and
    `UnknownFilterAttributeError` refuses an attribute the event type never declared, listing the ones it did.
    A filter language with a free-form expression grammar would be a second query planner in a package that has
    no database, and an unbounded predicate list is a denial-of-service vector attached to a routing decision
    taken on every message.

18. **A dead letter carries a reason from a closed vocabulary and settles exactly once.**
    `DEAD_LETTER_REASONS` names seven causes — consumer error, payload rejected, timeout, attempts exhausted,
    schema unknown, schema incompatible, transport unavailable — and a dead letter moves from `open` to
    `replayed` or `discarded` and no further. A closed vocabulary is what makes "why is this queue growing" a
    query rather than an investigation; free text alongside it is bounded at 8..1024 characters and is
    deliberately not a substitute for the code.

19. **Replay is requested, approved by somebody other than the requester, and refused with a reason from a
    closed vocabulary.** `SelfApprovedReplayError` refuses an approval by the person who asked, and
    `ReplayNotApprovedError` refuses execution of a request nobody approved. Replay is the one operation in the
    mesh that can re-deliver a month of institutional facts to a live consumer, and the seven
    `REPLAY_REFUSAL_REASONS` — window outside retention, window inverted, window too wide, too many messages,
    payload not retained, stream not readable, subscription not deliverable — mean a refusal is a fact the
    requester can act on rather than a wall. Windows are capped at 31 days and 100,000 messages, both inside
    the widest retention, so a replay cannot be authorised for a range the stream can no longer answer.

20. **Guards that indicate a programming error are consolidated into one non-operational error.**
    `InvalidMeshCountError` carries a name, a value and the requirement it failed, is `INTERNAL_ERROR` / 500 and
    is marked `isOperational: false`. The gateway spread this across four classes; one is enough, because the
    audience for all four was a stack trace rather than a caller. Engine guards are **raised rather than
    clamped**, on the argument that a negative message count silently corrected to zero produces a lag band that
    is wrong in a direction nobody will notice.

21. **Keys are the gateway's keys, and instants are made fixed-width before they are compared.**
    `MAX_KEY_LENGTH` is 128 and the pattern is the same lower-case dotted form the gateway uses, so an operator
    moving between the two surfaces learns one rule. `fixedWidthInstant` normalises an ISO instant through
    `parseIso`/`toIso` on write and on every read bound, which is what keeps lexical comparison in the database
    agreeing with chronological order — the defect P3-D01 found and fixed in its own repositories, adopted here
    as a named export rather than rediscovered.

22. **Eight aggregates carry the domain.** `EventTypeDefinition` (a versioned schema under a compatibility
    promise), `EventStream` (what a stream accepts, how it partitions, how long it keeps it),
    `StreamBinding` (which backbone carries a stream, by reference), `MeshSubscription` (who consumes it, under
    which guarantee, through which filter), `SubscriptionCheckpoint` (where a consumer group has got to, per
    partition), `MeshMessage` (an envelope that has been accepted, immutable once written), `DeadLetter` (what
    failed and why) and `ReplayRequest` (on whose authority any of it is sent again). Each is tenant-scoped
    under FORCE RLS; the mesh is the surface where a cross-tenant read would be worth the most, so tenancy is
    not a convention here but the first column.

23. **Domain events raised by this package carry ids, keys, versions, sequences, partitions, statuses, reason
    codes and counts only.** No payload, no digest, no transport reference and no filter value travels on the
    bus. The bus fans out to subscribers chosen for what they need to know rather than for what they are
    cleared to see, and the mesh of all places should not be the package that forgets this.

## Consequences

- **The platform's existing event machinery keeps working unchanged, and gains governance around it.** No
  publisher is edited, no consumer is migrated, `EventMetadata` is untouched and `outbox` is a supported
  transport rather than a deprecated path. The cost is that the mesh's strictness applies at _its_ boundary
  rather than universally: a domain still publishing straight onto the in-process bus is outside the registry's
  reach, and bringing it inside is a declaration somebody makes rather than something this contract forces.
- **Two or more versions of an event type will be live at once, permanently, and that is the design.** The
  ninety-day floor means the platform carries each retiring version for at least a quarter after deciding to
  stop, and the registry will accumulate versions nobody publishes any more. A registry that stayed small would
  be one that edited published types.
- **Defaulting retention to `digest` means the common case is not replayable, and operators will hit that.**
  `PayloadNotRetainedError` will be raised against streams whose owners assumed replay was available, and the
  fix is a deliberate change to `full` retention on a specific stream by somebody who has thought about what
  they are choosing to keep. That conversation happening at declaration time is the entire point; it happening
  at incident time would be too late in the direction that matters.
- **The compatibility check is only as good as the schema it is given.** A `SchemaField` list of names, types
  and requiredness catches renames, removals, type changes and newly-required fields, which is the large
  majority of what breaks consumers. It does not catch a semantic change under a stable shape — a field whose
  units changed from paise to rupees passes every check here. That limitation is honest and structural rather
  than a gap to be closed later by a richer schema language, which would be a second type system.
- **Refusing a checkpoint regression will occasionally block a legitimate operational rewind.** A consumer that
  genuinely needs to re-read is served by a `ReplayRequest`, which is approved by a second person and bounded by
  retention, rather than by writing a smaller number into a position column. The path is longer on purpose,
  because the two operations are indistinguishable at the column and only one of them is ever intended.
- **Requiring a second approver for replay will be friction for a single-administrator institution**, where the
  same person raises and approves. It is retained because a replay can re-deliver a month of financial and
  attendance facts into a live integration, and the failure it prevents is the one where a well-meaning
  administrator under pressure does it at 2 a.m. and discovers the fan-out afterwards.
- **The transport catalogue names six backbones and this build carries the two that need no broker.**
  `in_process` and `outbox` are real; `kafka`, `nats`, `redpanda` and `amqp` are declarations that
  `TransportNotAvailableError` refuses until an adapter exists at the composition root. That is the correct
  behaviour for a mesh with no broker deployed rather than a gap, and it is the same honesty the gateway's empty
  adapter manifest chose.
- **The mesh holds no broker client, no timer, no counter and no secret, so several packages are load-bearing at
  runtime.** `@knowget/events` relays, `@knowget/jobs` schedules and delivers, `@knowget/reliability` executes
  retries and timeouts, and the composition root resolves every transport reference. The mesh's verdicts are
  computed from figures those packages supply, and every one arrives as an argument — which is what makes a
  three-month-old verdict recomputable from what was logged beside it.
- **No bridge exists between the gateway's published event-type catalogue and this registry, and somebody will
  eventually propose building one.** Decision 4 is written at length so that the proposal is evaluated against
  the reason rather than against the apparent redundancy.

## Alternatives considered

- **Extend `@knowget/events` in place instead of adding a governance package.** Rejected, and this was the first
  question asked. `@knowget/events` is imported by every domain in the platform; growing it a schema registry, a
  subscription model, dead letters and replay would make thirty-one packages depend on all of it to use any of
  it, and would put tenancy into a package that is deliberately untenanted because the bus is a process-local
  mechanism. A sibling package that governs is a strictly smaller change with a strictly clearer boundary.
- **Tighten `EventMetadata` so that tenant, correlation and trace ids are required platform-wide.** Rejected —
  it is the technically cleanest answer and it breaks thirty-six contracts at once for the benefit of a package
  none of them import yet. The mesh envelope completing a `DomainEvent` at the mesh boundary gets the same
  enforcement where it can be enforced, and leaves the migration to be made deliberately, per domain, later.
- **Build a second outbox owned by the mesh, so that governance and mechanism live together.** Rejected — two
  outboxes means two answers to "what is pending", and the reconciliation between them becomes a permanent
  operational task invented by an architectural preference.
- **Have the mesh registry feed the gateway's published event-type catalogue.** Rejected — the gateway's set is
  a curation of what the institution promises externally, and sourcing it from an index of everything declared
  would convert an allow-list into a leak with no code change visible at the site of the failure.
- **Allow a published event type's schema to be edited for additive, backward-compatible changes.** Rejected for
  the reason the gateway rejects it for contracts: the field carrying the _backward-compatible_ judgement
  becomes the field every change is classified into, and the person classifying is never the person who pays.
  A new version costs a row.
- **Use semantic versions for event types instead of sequential integers.** Rejected — a semantic version asks
  the publisher to classify their own change, which is exactly the judgement the enforced compatibility check
  exists to remove. A sequence number carries no claim, so the claim has to be computed.
- **Make the compatibility mode advisory, recording the promise without checking it.** Rejected — that is the
  design of a registry that identifies the broken consumer after they break, which is the failure this contract
  was commissioned to prevent.
- **Default the compatibility mode to `none` so that early-stage teams are not slowed down.** Rejected — a
  default is what most types will carry forever, and `backward` is the mode a consumer can actually rely on.
  `none` remains available and requires somebody to choose it.
- **Make the deprecation notice period configurable per stream or per tenant.** Rejected — a configurable floor
  is not a floor, and the pressure to shorten it comes from inside the institution while the cost lands on a
  consumer outside it.
- **Give event types a shorter notice floor than API contracts, on the grounds that events are internal.**
  Rejected — an event consumer is in the same position as an integrator: outside the release conversation. The
  word _internal_ here describes the transport, not the audience.
- **Allow global ordering across multiple partitions, with ordering reconstructed downstream at read time.**
  Rejected — that is a promise the mesh cannot keep and the consumer cannot verify. One partition is slow and
  honest; the alternative is fast until the day it matters.
- **Place messages round-robin, or randomly, for even partition load.** Rejected — even load is worth less than
  a per-key ordering guarantee, and a hash of the declared key gives adequate spread for the price. It also
  keeps the certified no-`Math.random()` property intact and makes a replay place messages exactly where the
  original run did.
- **Default payload retention to `full` so that replay is available when it is needed.** Rejected — a mesh whose
  default retained every payload becomes an undeclared permanent archive of institutional facts about children,
  assembled by nobody's decision. `digest` is the default that makes retention a choice.
- **Store payloads outside the retention declaration, in an object store the mesh does not model.** Rejected —
  a retention rule that governs one copy of the data and not the other is not a retention rule.
- **Allow an operational override to rewind a checkpoint.** Rejected — a rewind and a bug are the same write to
  the same column. Replay exists, is bounded by retention and is approved by a second person, which is what an
  intentional rewind should cost.
- **Let a checkpoint be nullable to represent "nothing consumed".** Rejected — `UNCOMMITTED_POSITION` at 0 with
  `FIRST_SEQUENCE` at 1 says the same thing without adding a null branch to every comparison in the delivery
  engine.
- **Store a broker connection string on the binding, encrypted at rest.** Rejected, and firmly. Encryption at
  rest protects a stolen disk; it does not protect a credential from every query, backup, log line, support
  export and read-replica the column reaches. A reference resolved at the composition root means the secret is
  never in the row to begin with.
- **Restrict transport references to `vault` and `secretstore` only, refusing `config`.** Rejected — most of a
  binding's settings genuinely are configuration, and a validator that demanded a vault entry for a bootstrap
  server list would produce a vault full of hostnames and an operator who routes around the validator.
- **Include `kms` among the reference providers, for symmetry with the gateway's credential providers.**
  Rejected — a key-management service returns keys and a binding needs transport settings. The symmetry would be
  cosmetic and the misuse it invites is discovered at the composition root, at deployment time.
- **Let a binding be swapped in place rather than declared, activated and drained.** Rejected — an in-place swap
  is a moment when a message is in neither transport, and the contract's promise of changing the backbone
  without touching publishers or consumers depends on there being no such moment.
- **Accept a binding to any transport kind and fail at delivery time.** Rejected — that is a configuration the
  operator believes is working, discovered when the backlog is noticed. Refusing at declaration with the
  available set attached is the same information a week earlier.
- **Support a full expression language for subscription filters.** Rejected — a free-form grammar is a second
  query planner in a package with no database, and it is evaluated on every message. Six operators over declared
  attributes covers routing; anything beyond it is a consumer-side concern.
- **Leave filter predicate and value lists unbounded.** Rejected — an unbounded list attached to a per-message
  routing decision is a denial-of-service vector that a tenant can configure for themselves by accident.
- **Let dead-letter reasons be free text.** Rejected — the question a dead-letter queue exists to answer is
  "why is this growing", and free text makes that an investigation instead of a query. Bounded prose sits
  alongside the code rather than replacing it.
- **Let dead letters be reopened after being discarded.** Rejected — a settled dead letter is a decision
  somebody recorded, and reopening it silently converts the record into a working state. A new replay request
  is the honest route back.
- **Allow a requester to approve their own replay when they hold the approval scope.** Rejected — the scope says
  what a person may do, not that a single person should do both halves of an operation that can re-deliver a
  month of financial facts. The friction is the control.
- **Bound replay by message count alone, rather than by window and count and retention.** Rejected — a count
  bounds the volume and says nothing about whether the data is still there. All three bounds refuse different
  mistakes.
- **Return a boolean from the replay planner instead of a refusal reason.** Rejected — a refused replay with no
  reason produces a support conversation and then a workaround. Seven named reasons produce a fix.
- **Clamp invalid engine inputs to their nearest valid value instead of raising.** Rejected — a negative
  message count clamped to zero yields a lag band that is wrong in the reassuring direction, which is the worst
  available outcome. A 500 marked non-operational is the honest response to a caller error inside the platform.
- **Keep the gateway's four separate non-operational guard classes for symmetry.** Rejected — the audience for
  all four is a stack trace. One error carrying the name, the value and the requirement conveys the same thing
  with a quarter of the surface.
- **Give the mesh its own key format, tuned to stream and topic naming.** Rejected — an operator who learns one
  key rule for the gateway and a second for the mesh will get one of them wrong. The shared 128-character
  lower-case dotted form is worth more than a marginally better fit.
- **Compare ISO instants as stored, without normalising to fixed width.** Rejected — P3-D01 found this defect
  the hard way, in CI. `fixedWidthInstant` applied on write and on every read bound is the fix, promoted to a
  named export so the next domain does not rediscover it.
- **Let the mesh's domain events carry the message payload, so subscribers need not fetch it.** Rejected — the
  bus fans out to subscribers chosen for what they need to know, and a mesh that put payloads on its own
  governance events would defeat every retention and filtering decision above it.
- **Model transports as a plugin interface inside the package, so adapters can register themselves.** Rejected —
  that puts I/O concerns and a lifecycle into a pure domain package. A transport kind plus an availability set
  supplied by the composition root keeps the domain decidable and testable without a broker.
- **Defer the whole contract until a broker is actually deployed.** Rejected — the governance is what takes
  months to get right and the adapter is what takes days. Building the schema registry, the compatibility rules
  and the replay controls before any traffic depends on them is the only order in which they can be changed
  cheaply.
