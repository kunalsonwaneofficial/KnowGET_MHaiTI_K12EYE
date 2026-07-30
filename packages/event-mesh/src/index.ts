/**
 * `@knowget/event-mesh` — the governed spine every institutional fact travels along: what event types exist, in
 * what shape, on which stream, over which backbone, to whom, under what guarantee, and on whose authority any of
 * it is sent again.
 *
 * P1-M05 gave the platform an in-process event bus and a transactional outbox, and thirty-one contracts have been
 * publishing across them ever since. Those are mechanism. An outbox record knows that a publication is pending
 * and nothing else: not what the event type means, not what shape its payload is promised to have, not which
 * consumers are entitled to it, not where any of them has got to, not what failed, and not whether the thing may
 * be replayed. This package is the governance that mechanism was always missing, and it is careful to add exactly
 * that and not to restate a single thing `@knowget/events` already does. The bus keeps fanning out. The outbox
 * keeps relaying. What changes is that both are now describable, attributable and bounded.
 *
 * Six commitments are structural here rather than editorial.
 *
 * **A published event type is immutable.** A schema change against a published type is a new version beside it,
 * never an edit of it, because a consumer written against a shape is entitled to keep finding that shape. The
 * only editable schema in the package belongs to a `draft`.
 *
 * **Compatibility is enforced, not documented.** Every event type declares a {@link CompatibilityMode} and the
 * mesh refuses a version that violates it, naming the breaking changes it found. A registry that records a
 * compatibility promise without checking it is a registry that tells you which consumer broke *after* it broke.
 *
 * **A guarantee is a union member.** {@link DELIVERY_SEMANTICS} names three deliveries and the mesh knows which of
 * them obliges it to keep a deduplication ledger and which of them oblige it to retry. `exactly_once` is a
 * commitment the code can be held to, not a word in a data sheet.
 *
 * **Retention bounds replay.** A stream that declares it keeps no payload cannot be replayed with one — not by
 * policy but by arithmetic, because there is nothing to replay — and a replay window wider than the retention it
 * reads from is refused with the reason attached. This is what stops a mesh from quietly becoming an undeclared
 * archive of every fact the institution has ever recorded.
 *
 * **A position only moves forward.** A checkpoint that regresses is refused rather than accepted, because the
 * store is the only thing standing between a redeployed consumer and re-processing a month of enrolments.
 *
 * **A backbone is named by reference.** A binding holds a configuration handle such as `config:mesh.kafka.primary`
 * and never a connection string. A mesh is the one surface in the platform where a single leaked credential reads
 * every fact the institution has, so the value objects refuse the secret instead of trusting the caller.
 *
 * Four absences are equally deliberate. There is **no clock**: every instant a decision turns on — a lag band, a
 * retention sweep, a replay window, a deprecation deadline — arrives as an argument, which makes a verdict
 * reproducible from the record alone months later. There is **no unseeded randomness**: a message's partition is
 * an FNV-1a hash of its declared key, so the same key lands in the same partition on every node, in every
 * process, forever. There is **no I/O**: nothing here holds a broker client, opens a socket or writes a row — a
 * transport is a declaration and an adapter key, and whatever speaks the protocol lives at the composition root.
 * And there is **no payload this package was not told it may keep**: a stream declaring digest-only retention
 * carries a digest, and the type system will not let it carry more.
 *
 * The boundary with the rest of the platform is drawn on purpose. `@knowget/events` owns the bus and the
 * transactional outbox; this package governs them. `@knowget/jobs` owns delivery mechanics and scheduling; this
 * package decides what may be delivered and how many times it may be tried. `@knowget/reliability` owns runtime
 * retry, timeout and circuit execution; this package holds the attempt ceiling, not the executor.
 * `@knowget/gateway` owns the *external* surface, and its published event-type catalogue is a curated egress
 * allow-list rather than an index of what exists — a genuinely different question from the one this registry
 * answers, which is why no bridge is built between them. Device and sensor transports arrive at P3-D10 and reach
 * the mesh as bindings this package already describes.
 *
 * Domain events raised by this package carry ids, keys, versions, sequences, partitions, statuses, reason codes
 * and counts only. No payload, no digest, no transport reference and no filter value travels on the bus, because
 * the bus fans out to subscribers chosen for what they need to know rather than for what they are cleared to see.
 */

// --- Value objects ---------------------------------------------------------------

export * from "./mesh-value";

// --- Views -----------------------------------------------------------------------

export * from "./mesh-view";

// --- Engines ---------------------------------------------------------------------

export * from "./compatibility";
export * from "./delivery";
export * from "./envelope";
export * from "./lifecycle";
export * from "./partitioning";
export * from "./replay";
export * from "./retention";
export * from "./routing";

// --- Errors ----------------------------------------------------------------------

export * from "./errors";

// --- Aggregates ------------------------------------------------------------------

export * from "./dead-letter";
export * from "./event-stream";
export * from "./event-type-definition";
export * from "./mesh-message";
export * from "./mesh-subscription";
export * from "./replay-request";
export * from "./stream-binding";
export * from "./subscription-checkpoint";

// --- Ports -----------------------------------------------------------------------

export * from "./ports";

// --- Events ----------------------------------------------------------------------

export * from "./mesh-events";
