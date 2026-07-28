/**
 * `@knowget/executive-intelligence` — the platform's executive intelligence, governance and institutional
 * command domain.
 *
 * Twenty-eight contracts came before this one, each recording what happened inside its own part of the
 * institution, and every one of them answered a question leadership never actually asks. Nobody asks how the
 * transport domain is doing. They ask whether the school is alright, and whether it was more alright last term,
 * and — when the answer is no — which part of it to go and look at first. That question has no owner in an
 * operational contract, which is why it has one here.
 *
 * The contract's rule is role-aware dashboards, a reproducible Institutional Health Index across ten
 * institutional domains, and evidence-traceable KPIs. This package makes each of those structural rather than
 * procedural wherever it can: a reading cannot be constructed without the evidence it stands on, the ten pillars
 * are fixed at the platform while their weighting is the institution's, the coverage floors are constants no
 * caller can lower, an index assessment pins every reading it consumed so it can be recomputed and the
 * recomputation compared, and composition removes what a viewer's scopes do not reach instead of blanking it in
 * place.
 *
 * Three absences are deliberate and load-bearing. There is **no clock**: a period is an integer index into a
 * grid the caller defines, so staleness is decidable and an assessment reproduces exactly. There is **no
 * renderer**: panels bind to data shapes and never to pictures, because how an institution's numbers are drawn
 * belongs to the presentation contract. There is **no role catalog**: role-awareness is expressed against
 * opaque permission scopes granted elsewhere, because an intelligence layer holding a second opinion about who
 * a principal is would discover the disagreement as a leak.
 */

// --- Value objects ---------------------------------------------------------------

export * from "./command-value";

// --- Views -----------------------------------------------------------------------

export * from "./command-view";

// --- Engines ---------------------------------------------------------------------

export * from "./attention";
export * from "./banding";
export * from "./composition";
export * from "./indexing";
export * from "./measurement";
export * from "./reproducibility";
export * from "./traceability";
export * from "./weighting";

// --- Aggregates ------------------------------------------------------------------

export * from "./errors";
export * from "./health-index-assessment";
export * from "./health-index-definition";
export * from "./kpi-definition";
export * from "./kpi-reading";
