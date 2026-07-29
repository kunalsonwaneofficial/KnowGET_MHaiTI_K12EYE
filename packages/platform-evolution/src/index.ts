/**
 * `@knowget/platform-evolution` — the platform's institutional learning, governed change and continuous
 * improvement domain.
 *
 * Twenty-nine contracts came before this one and every one of them models the institution *operating*. This is
 * the only one that models the institution *changing* — which is the activity every other contract quietly
 * depends on and none of them owns. An institution that cannot record why it decided to do something
 * differently, who agreed, whether it worked, and what it learned, does not have a memory; it has a set of
 * current practices whose reasons left with the people who chose them, and it will rediscover the same lesson
 * every few years at full price.
 *
 * The contract's rule is that lessons feed institutional memory and evolution always requires human governance.
 * This package makes both clauses structural rather than procedural. A lesson is born `provisional` and becomes
 * `retained` only when a memory commitment resolves against the institutional knowledge graph (P2-D25), so a
 * retrospective that produced twelve insights and committed none of them reads as twelve unfinished records
 * rather than as a completed retrospective. And no initiative crosses a governance gate on arithmetic: each
 * change class names a count of distinct people who must agree, the smallest count is one rather than zero, no
 * decider may be the proposer, and any single refusal settles the gate — a majority that could outvote a
 * refusal would leave the institution with a record showing it was warned and proceeded.
 *
 * Four absences are deliberate and load-bearing. There is **no clock and no unseeded randomness**: a period is
 * an integer index into a grid the caller defines, so a maturity assessment reproduces exactly and a lesson's
 * review-due date is decidable without asking what today is. There is **no enactment**: an initiative reaches
 * `adopted` and stops — nothing here deploys, releases, schedules or flags, because a platform that could enact
 * its own conclusions is the one failure this contract exists to make impossible. There is **no
 * self-modification vocabulary**: nothing names a platform version, a configuration key, a schema or a model.
 * And there is **no role catalog or governance body**: authority is an opaque permission scope granted by the
 * identity contracts, and a quorum is a count of named people, because a decision record has to outlive the
 * committee being renamed.
 */

// --- Value objects ---------------------------------------------------------------

export * from "./evolution-value";

// --- Views -----------------------------------------------------------------------

export * from "./evolution-view";

// --- Engines ---------------------------------------------------------------------

export * from "./cadence";
export * from "./governance";
export * from "./intake";
export * from "./learning";
export * from "./lifecycle";
export * from "./lineage";
export * from "./maturity";
export * from "./realization";

// --- Errors ----------------------------------------------------------------------

export * from "./errors";

// --- Aggregates ------------------------------------------------------------------

export * from "./adoption-review";
export * from "./governance-decision";
export * from "./improvement-cycle";
export * from "./improvement-initiative";
export * from "./improvement-signal";
export * from "./lesson";
export * from "./maturity-assessment";

// --- Ports -----------------------------------------------------------------------

export * from "./ports";

// --- Events ----------------------------------------------------------------------

export * from "./evolution-events";
