# Engineering Delivery Report — P3-D02

**Event Mesh, Streaming & Messaging** · Phase 3 (Enterprise Integration Engineering) · Program: Integration Spine (D01–D03)

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P3-D02 — Event Mesh, Streaming & Messaging                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Status**     | 🟡 Delivered — pending CI. `@knowget/event-mesh` typecheck/lint/format/build clean, **856 tests** (27 files); `apps/api` typecheck/lint/build clean + event mesh DI-graph spec (3 tests) in the **247-test** api suite. Full monorepo green (TD-12 on the Prisma build in-sandbox).                                                                                                                                                                                                          |
| **Depends on** | P3-D01 (API Gateway & Integration Fabric) — the external edge this backbone sits behind, and whose outbound-delivery path was recorded as waiting on it. Phase 1 `@knowget/events` in full: the in-process bus and the transactional outbox this contract governs rather than replaces. P2-D01-M01 (Organization) and P2-D01-M02 (Person) via directory ports. Phase 2 certification (`v0.3.0`), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). **Second contract of Phase 3**, second of the spine. |
| **Date**       | 2 January 2027                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Next**       | P3-D03 — Identity Federation & Single Sign-On (third and last spine contract)                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 1. Mission recap

Deliver the **event mesh** — the second spine contract, and the one the platform has been referring to since
Phase 1. The transactional outbox has been in `@knowget/events` since the kernel was built, and thirty-seven
contracts have published onto it. What none of them established is an account of _what the platform carries_:
which facts it is willing to name, what shape each of them takes, who is entitled to read them, on what channel
they leave, how long a body is kept, and whether history may be delivered a second time.

That is this contract, and the first thing to say about it is what it deliberately does not do. **It does not add
a second bus.** `@knowget/events` still owns fan-out and the outbox; `@knowget/jobs` still owns delivery mechanics
and the scheduler; `@knowget/reliability` still owns runtime retry, timeout and circuit execution;
`@knowget/security` still counts rate limits; `@knowget/gateway` still owns the external edge. A mesh that
re-implemented any of those would have given the platform two answers to _did this fact get delivered_, which is
worse than having none. This package holds the **account** of the traffic and not the traffic itself.

The design problem is that **an event backbone is the one part of a platform where the failure mode is silence.**
A broken route returns a 500 that somebody sees within the minute. A subscription whose filter quietly stops
matching returns nothing at all, and nothing at all is indistinguishable from _nothing happened_ — which, in a
school, is the difference between an attendance escalation that was never raised and an afternoon on which
everybody was present. Built carelessly, this domain would produce silence in a dozen ordinary ways: a binding
naming a broker nobody wired, a stream activated with no carrier, a consumer group registered twice so half the
work vanishes into a second reader, a checkpoint rewound during an incident so the lag figure that follows is an
artefact rather than a fact, a retention window shorter than the replay somebody is about to ask for. Every one
of those is a configuration that _looks_ correct and delivers nothing.

So the structure is aimed squarely at that: **make silence impossible to mistake for quiet.** A binding naming a
transport this build cannot speak is refused at declaration, while somebody is still looking at the
configuration, rather than discovered by whoever stopped receiving. Exactly one binding may carry a stream, so a
fact cannot leave twice by two backbones and cannot leave by none while two are declared. A checkpoint only moves
forward, and a reset is a separate attributed act with its own event, so a lag figure means what it says. A dead
letter is a row with a reason and an open/closed lifecycle rather than a line in a log. And a replay is a
**request with an approver who is not the requester**, rather than a script somebody ran on a Friday.

Four absences are load-bearing and were decided before anything was written. **There is no broker client** —
nothing here opens a socket, holds a producer or subscribes to anything, and the transport union is a vocabulary
rather than a capability claim. **There is no clock in the engines** — every retention verdict, replay window,
compatibility assessment and lag band takes the instant as an argument, so each is recomputable months later from
what was logged beside it. **There is no random source** — partition assignment is FNV-1a over the partition key,
which is the entire basis on which per-key ordering can be promised at all. **And there is no broker password** —
a binding names its credential by reference (`config`, `env`, `vault`, `secretstore`), so no Kafka or AMQP secret
can reach a database column in the first place. As with every domain here, the design begins with the pure
engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Eight pure, deterministic, **clock-free** engines built and tested first: **compatibility** (`validateSchemaFields` / `describeSchemaChanges` / `breakingChangeKinds` / `assessCompatibility` — whether a version is a safe successor under the mode its predecessor declared), **envelope** (`MANDATORY_ENVELOPE_FIELDS` / `completeEnvelope` — the fields every fact carries whatever else it says), **partitioning** (`hashPartitionKey` / `partitionFor` / `validatePartitioning` / `assignPartition` — which partition a key lands on, forever), **routing** (`FILTERABLE_ATTRIBUTES` / `validateFilter` / `matchesFilter` / `routeEnvelope` — whether a subscription wants this fact), **delivery** (`decideDelivery` / `isRetriableFailure` / `validateAttemptCeiling` / `lagBandFor` — deliver, filtered, duplicate, dead-letter or abandon), **retention** (`validateRetention` / `retentionExpiry` / `retentionCutoff` / `isRetained` / `assessRetention` — how long a body survives, as arithmetic), **replay** (`inspectReplayWindow` / `inspectReplayApproval` — whether history may be repeated, and the seven distinct reasons it may not), **lifecycle** (six `inspect*Transition` maps plus `inspectPublication` and `inspectEventTypeDeprecation` — every legal state move in the domain) |
| **Domain**      | `@knowget/event-mesh` — eight aggregates in three layers. _Vocabulary:_ `EventTypeDefinition` (what the platform is willing to say, versioned and immutable once published), `EventStream` (the channel, its partitioning and its retention). _Arrangement:_ `StreamBinding` (which backbone carries a stream, named by reference), `MeshSubscription` (who reads, under what filter and what delivery term). _Traffic:_ `MeshMessage` (the fact as recorded, with its sequence and its body or its digest), `SubscriptionCheckpoint` (how far a consumer has got, forward only), `DeadLetter` (what failed, why, and how it ended), `ReplayRequest` (history repeated, requested and approved by two different people). Eight application services on the platform event bus, **35 `mesh.*` events**, **81 typed errors**, 11 ports. **No Prisma, no NestJS, no broker client, no socket library, no `fetch`, no clock, no `Math.random`; payload-, credential- and prose-free events**                                                                                                                                                                                                                                                                                                                    |
| **Persistence** | Eight models in `schema.prisma` + one migration (`20270102000000_add_event_mesh`, 432 lines — the platform's 43rd), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **no table carries a soft-delete column and no repository declares a delete**; the one flat string array (`event_stream.event_type_keys`) as `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` per the house convention and **no GIN index on it** (evidence in §6); seven absolute uniques DB-backed plus **three partial uniques that hold rules rather than shapes** — one _active_ binding per stream, one _open_ dead letter per (subscription, message), and one _running_ replay per subscription                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **API**         | Eight Prisma/RLS repositories + three directory adapters + **eight permission-gated controllers / 82 endpoints** under `apps/api/src/domains/event-mesh`, split `mesh:read` (every read except a body) / `mesh:govern` (the vocabulary and the channels) / `mesh:deliver` (bindings and subscriptions) / `mesh:publish` (recording a fact, and nothing else) / `mesh:operate` (checkpoints, dead letters, forgetting and sweeping) / **`mesh:replay` (repeating history, and the only way to read a retained body)**; all bodies zod-validated; module wires 8 repos + 3 directories + 8 services and imports Organization and Person only; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 3. The rule, as structure

**A published event type cannot be edited, and a compatibility mode is enforced rather than recorded.** `revise`
refuses a published version outright, so the way to change a shape consumers are already reading is to publish
the next version beside it. That much matches the gateway. What this contract adds is that the declared mode is
not documentation: `assessCompatibility` compares a candidate against the highest published version under its
key and **publication is refused when the successor breaks the promise the predecessor made**. A `backward` event
type whose new version drops a required field does not publish with a warning; it does not publish. The
alternative — a mode field that describes an intention nobody checks — is the arrangement in which a registry
accumulates event types marked `full` that have been breaking consumers for two years, and the marking is what
made nobody look.

`:id/publication` exists so that this is reviewable rather than a leap. It reports which fields were added,
removed or retyped and whether that is compatible under the declared mode, and it **takes the instant as an
argument rather than reading a clock**, so the same question asked twice about the same version gets the same
answer and _would this have been publishable when we shipped it_ stays askable after an incident.

**Retention bounds replay by arithmetic rather than by policy.** `isReplayable` is true only for a stream
retaining `full` payloads: a stream keeping a digest cannot be replayed at all, and `inspectReplayWindow` refuses
with `payload_not_retained` rather than starting a run that delivers envelopes with nothing in them. The
ceilings are stated once and are not parameters — `MAX_REPLAY_WINDOW_SECONDS` is 2,678,400 (thirty-one days),
`MAX_REPLAY_MESSAGES` is 100,000, `MIN_RETENTION_SECONDS` is 3,600 and `MAX_RETENTION_SECONDS` is 31,622,400 —
and the seven refusal reasons stay seven distinct words because each names a different remedy: a window outside
retention is a decision that came too late, an inverted window is a typo, a window too wide is a request to
narrow, too many messages is a request to split, a payload not retained is a stream that was never going to
support this, an unreadable stream is a governance state, and an undeliverable subscription is a consumer that
is switched off. Collapsing them into `replay_refused` would produce a support conversation per refusal.

**A checkpoint only moves forward, and the mesh publishes no event when it does.** A committed position is a
number a consumer moves thousands of times a second; an event per commit would be the platform narrating its own
throughput onto the bus that carries its institutional facts. `mesh.checkpoint.reset` is therefore the **only**
checkpoint event there is — because a reset is the one checkpoint act that is a decision rather than progress,
and it is the act that makes every lag figure after it suspect unless somebody can see that it happened, who did
it and when.

**The mesh publishes thirty-five events and not one of them says a message was recorded.** This is the single
decision that keeps the domain from doubling every fact the platform holds. A mesh announcing each publication
would put every institutional event onto the bus twice — once as itself, and once as news that it happened — and
every consumer would then have to decide which of the two it was written against. What the mesh announces is
changes to _its own_ arrangement: a vocabulary published, a stream repartitioned, a binding retargeted, a
subscription refiltered, a body forgotten, a checkpoint reset, a dead letter opened or closed, a replay moving
through its seven states. `mesh.message.payload-forgotten` is the one message-level event, and it exists because
forgetting is the only thing that happens to a recorded fact that somebody downstream might need to know about.

**Exactly one binding may carry a stream, and a transport is checked before it is bound.** The partial unique
`stream_binding_active_key` holds the first rule in Postgres, so a fact cannot leave by two backbones at once and
arrive twice at a consumer counting on exactly-once. The second rule is held by the `TransportAdapterRegistry`
port: `DeclaredTransportRegistry` serves `in_process` and `outbox` and refuses the four brokers nothing in this
repository connects to. Unbound, every binding would activate, every stream would read as live, and nothing would
leave the process — the one failure in this domain that looks exactly like success.

## 4. Authority — six scopes, and why `mesh:publish` is alone and `mesh:replay` stands apart

`mesh:read` is the mesh's own account of itself — event types and their schemas, streams and their partitioning,
bindings, subscriptions and their filters, message headers, checkpoints and lag, dead letters and replays. Wide
on purpose, because an institution that cannot see which facts leave it, on what channel and to whom has no event
governance at all. Narrow in exactly one place: **it does not include a message body.** Knowing that an enrolment
was confirmed and being handed what was written about the learner are different permissions, and this is the one
domain where the second is available in bulk.

`mesh:govern` is the vocabulary and the channels: defining, revising, publishing, deprecating and retiring an
event type, and defining, repartitioning, re-retaining, accepting into, withdrawing from, activating, pausing and
retiring a stream. **Retention lives here rather than with the operators**, because how long institutional facts
are kept is a decision an institution makes once and answers for afterwards, not a dial an on-call rota turns.
`mesh:deliver` is the arrangement — bindings and subscriptions — and is kept apart from `mesh:govern` because a
binding to an outside broker is an **egress path**: the person who decides that attendance is a fact the platform
records is not automatically the person who decides that attendance leaves the building.

**`mesh:publish` is one operation and it is alone because of who holds it.** Every producing capability in the
platform needs it, which makes it the most widely issued key in this domain, and a key that widely issued must
not also carry the power to define a stream, rewire a transport or add a consumer. A publisher's blast radius
should be the facts it publishes. `mesh:operate` is the running mesh — opening, committing and resetting a
checkpoint, recording, replaying and discarding a dead letter, forgetting a body and sweeping a stream's
retention — none of which changes what the platform carries or where it goes.

**`mesh:replay` stands apart, and is the separation that matters most here.** It is the only act in the domain
that delivers facts a consumer has **already acted on**, and every consumer downstream was written to read a
stream forwards. The damage is not an error anybody sees; it is a projection left in a state no sequence of real
events could have produced. The retained-body read belongs with it rather than with `mesh:read` for the same
reason: the two honest reasons to open a stored payload are deciding whether a window is worth replaying and
working out why a consumer choked on it. Requesting and approving share the key deliberately — **the two-person
rule is enforced by the aggregate, which refuses an approver who is the requester**, so the control is a second
person rather than a second permission, and the approver is taken from the authenticated principal and never
from the body.

## 5. Every verdict is recomputable, and nothing is drawn from a random source

**A partition key lands on the same partition today and in a year.** `hashPartitionKey` is FNV-1a and
`partitionFor` is its modulus, so per-key ordering is a property anybody can recompute from the key and the
partition count rather than a claim about a broker's internal state. That is also why **repartitioning is a
governed act with its own event** (`mesh.stream.repartitioned`) rather than a rebalance: changing the count
changes where every future key lands, which means ordering _across_ the boundary is not preserved and somebody
has to have decided that on purpose. A mesh that assigned partitions randomly could promise ordering only for as
long as nobody looked.

**Delivery has five verdicts and they stay five different words.** `deliver`, `filtered`, `duplicate`,
`dead_letter` and `abandoned` each imply a different remedy: nothing, check the filter, nothing (the consumer
already has it), look at the consumer, and stop waiting. Collapsing `filtered` into a non-delivery is how an
operator spends an afternoon debugging a broker that is working perfectly, and collapsing `abandoned` into
`dead_letter` is how a delivery nobody intends to retry sits in a queue being retried. Retriable and terminal
failure reasons are two frozen lists (`RETRIABLE_FAILURE_REASONS`, `TERMINAL_FAILURE_REASONS`), so
`schema_incompatible` never enters a retry loop it cannot exit and `transport_unavailable` never gets abandoned
on its first bad minute.

**Retention is arithmetic on stated instants.** `retentionExpiry` and `retentionCutoff` are addition and
subtraction against an instant the caller supplies, `isRetained` is a comparison, and `assessRetention` reports
rather than deletes — the sweep is an act somebody takes under `mesh:operate` and never something the package
does on its own schedule. Two hazards are closed structurally: instants written to the range-compared column pass
through `fixedWidthInstant` on write **and** on the read bound, so an ISO string comparison cannot go wrong on a
millisecond field of a different width; and ordering uses the package's own `compareText` rather than
`localeCompare`, whose result would depend on the data centre's locale.

**Lag is a band as well as a number.** `lagBandFor` reports `current`, `behind` or `stalled`, because a raw
message count means nothing without knowing the stream's rate, and an operations view that shows only the number
is one where a consumer 400 messages behind on a busy stream and a consumer 400 messages behind on a quiet one
look identical. The band is derived from figures supplied to it, so it is recomputable from what was recorded
beside it.

**A dead letter is a record with a lifecycle, not a log line.** It carries which subscription failed on which
message and one of seven reasons; it is `open` until somebody closes it; and the two closures — `replayed` and
`discarded` — are different ends that both survive, because a consumer asking _did that ever get through_ is
owed an answer and the answer is sometimes _no, and here is who decided that_. The partial unique
`dead_letter_open_message_key` means one open record per (subscription, message), so a receiver failing the same
message forty times produces one row somebody can act on rather than forty nobody reads; `openFor` folds a repeat
failure into the existing open record instead of refusing it.

## 6. Quality gates

`@knowget/event-mesh`: typecheck / lint / format / build clean, **856 tests across 27 files** (eight engine
suites, eight aggregate suites, eight service suites, plus events, values and views) over 30 source files.
`apps/api`: typecheck / lint / build clean, event mesh DI-graph spec (**3 tests** — the eight controllers, the
eight exported service tokens, and the three ports) in the **247-test** api suite across 83 files. Full monorepo
green: build 75/75, and all 43 migrations replay from an empty schema to **241 tables**. Only
`prisma migrate deploy` and the `@knowget/database` integration test stay unrunnable in-sandbox (TD-12 — both
need the real Prisma engines CI downloads); the eight event mesh models were instead audited directly against the
live database. Repo-wide `pnpm format:check` clean.

Migration audited directly against Postgres after a full 43-migration replay: all eight tables `ENABLE` + `FORCE
ROW LEVEL SECURITY` under exactly one policy each, every one named `tenant_isolation` and carrying **both** a
USING and a WITH CHECK clause (fail-closed); **zero foreign keys**, **zero `deleted_at` columns** and **zero GIN
indexes** across the contract; 44 indexes present (36 declared plus eight primary keys), of which 18 are unique —
eight primary keys, seven absolute and **three partial**, each holding a rule rather than a shape:
`stream_binding_active_key` on `(tenant_id, stream_key) WHERE status = 'active'`, `dead_letter_open_message_key`
on `(tenant_id, subscription_id, message_id) WHERE status = 'open'`, and `replay_request_running_key` on
`(tenant_id, subscription_id) WHERE status = 'running'`.

All three deserve their reasoning stated, because in each case the rule would otherwise live only in service
code. **One active binding per stream** is what stops a fact leaving by two backbones and arriving twice at a
consumer that was promised exactly-once — the concurrency window that matters, since two operators activating
two bindings in the same second is exactly how that configuration arises. **One open dead letter per (subscription,
message)** is what turns a receiver failing the same message repeatedly into one actionable row rather than a
pile nobody reads. **One running replay per subscription** is the sharpest of the three: two concurrent replays
into one consumer would interleave two histories, and a projection rebuilt from an interleaving of two correct
orderings is in a state neither ordering could produce and no error would announce.

**The absent GIN index is the same finding as P3-D01's, not an omission.** `event_stream.event_type_keys` is
`TEXT[]` and the obvious index for a containment predicate on it is GIN. It would be unreachable: `arraycontains`
(`@>`) and `arrayoverlap` (`&&`) both have `proleakproof = f`, so under FORCE ROW LEVEL SECURITY a containment
test on a policy-protected table can never become an Index Cond and is always demoted to a post-security Filter.
Shipping one would be a performance claim no query plan could honour.

The DI-graph spec asserts the **three ports** bind, not only the services, and each carries a rule the package
states but cannot enforce alone. The organization directory is what makes the institution on an event type, a
stream, a binding and a subscription a node that exists — checked at those four points and inherited everywhere
after, so a silent bind failure would put a whole tree of traffic under an identifier resolving to nothing. The
person directory is what makes eight attributions name somebody real on records that outlive the incidents they
document. The transport registry is what stops a binding naming a backbone this build cannot speak — and unbound,
every binding would activate while nothing left the process.

## 7. Boundaries & debt

- **This mesh moves no bytes.** It holds the account of the traffic and executes none of it: `@knowget/events`
  owns the in-process bus and the transactional outbox, `@knowget/jobs` owns delivery mechanics and the
  scheduler, `@knowget/reliability` owns runtime retry, timeout and circuit execution, `@knowget/security` counts
  rate limits, and `@knowget/gateway` owns the external edge. A second implementation of any of those would have
  given the platform two answers to _did this fact get delivered_.
- **The transport registry serves two of six kinds, and honestly so.** `DeclaredTransportRegistry` serves
  `in_process` and `outbox`; `kafka`, `nats`, `redpanda` and `amqp` are a **vocabulary rather than a capability
  claim**, and a binding naming one is refused at declaration. That is the correct behaviour for a mesh with no
  broker client rather than a gap — a registry that accepted any kind would let an operator activate a stream
  that could never carry anything and find out from whoever stopped receiving.
- **Nothing here holds a broker credential.** A binding names its transport by reference through
  `TRANSPORT_REF_PROVIDERS` (`config`, `env`, `vault`, `secretstore`), so a Kafka or AMQP password cannot reach a
  database column at all, and no `mesh.*` event payload carries a reference either.
- **A message body is available in exactly one place under exactly one scope.** `mesh:read` covers every header,
  filter, checkpoint and lag figure in the domain and covers no payload; the retained body is `mesh:replay`.
- **No domain→domain package import** (ADR-0010); the organization node, the person and the transport registry
  all enter through three directory ports bound at the composition root, and **every port is a read**.
- **TD-53 (new).** Deferrals, none weakening an absolute invariant. (a) Ten **check-then-act** guards across
  seven services — the event type's `(key, version)`, the stream key, a binding's `(stream, transport)` and its
  active-carrier check, the subscription key and its consumer group, a checkpoint's `(subscription, partition)`,
  a message's event id and its sequence, and the running-replay check — so under genuinely concurrent creation
  two callers could each read the same name free. **Nine of the ten are DB-backed** and reject `23505`, and the
  two rules most exposed to concurrency are held by **partial unique indexes** rather than by service code (one
  active binding, one running replay). The one unbacked guard is `requireConsumerGroupFree`, a rule about two
  subscriptions on one stream that no single-row constraint expresses. `dead_letter` carries no throwing guard at
  all, its uniqueness being DB-only, with `openFor` folding a repeat failure into the open record. (b) **The
  engines run in-process on the caller's thread** — `routeEnvelope` walks a subscription's predicates per
  envelope and `assessCompatibility` re-derives a schema diff per publication check; both are bounded and pure,
  and caching the resolved filter set is `@knowget/cache` work behind the existing ports. (c) There is **no
  consumer runtime and no broker adapter**, which is why `mesh:operate` commits a checkpoint somebody else moved.
- **TD-01 (standing), and now bounded.** Event delivery is in-process and the 35 `mesh.*` events ride the same
  bus. What changes here is that the platform now has a **governed description** of the backbone TD-01 has been
  waiting for — streams, partitioning, retention, bindings, subscriptions, checkpoints, dead letters and replay —
  so the remaining work is an adapter behind `TransportAdapterRegistry` rather than a design.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via
  the offline path; the eight-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.

## 8. Outcome

The event mesh is complete, and the platform now has one account of what it carries and where it goes. The
computational core is pure, deterministic, clock-free and free of any random source (eight engines, eight
aggregates, **856 tests**, no I/O, no clock, no broker client, no `Math.random`). A published event type
**cannot be edited**, and the compatibility mode it declared is **enforced at publication rather than recorded**
against it. Retention **bounds replay by arithmetic** — a digest-retaining stream is refused with
`payload_not_retained` rather than replayed into empty envelopes — under four stated ceilings and seven distinct
refusal reasons. A checkpoint **only moves forward**, and the one checkpoint event in the domain is the reset,
because a reset is what makes every lag figure after it suspect. The mesh publishes **thirty-five events and not
one of them says a message was recorded**, so no institutional fact is announced twice. Exactly **one binding may
carry a stream**, held by Postgres; a transport this build cannot speak is refused at declaration rather than
discovered by whoever stopped receiving; and a broker credential is a **reference** that never reaches a column.
A replay is requested and approved by **two different people**, with the approver taken from the authenticated
principal and never from the body. All eight tables are FORCE-RLS tenant-isolated with **three partial uniques
holding rules Postgres now enforces**, and **none carries a soft-delete column** — a retired stream, a drained
binding, a discarded dead letter and a cancelled replay are all things the institution did.

Twenty-two increments, each verified and pushed. **The spine is two-thirds built; the next contract is P3-D03 —
Identity Federation & Single Sign-On.**

**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated
across the P2-D18…D30 boundaries, the Phase-2 close-out, P3-D01, or P3-D02.
