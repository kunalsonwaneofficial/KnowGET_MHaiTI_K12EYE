/**
 * `@knowget/predictive-intelligence` — the platform's forecasting, simulation and strategic-planning domain.
 *
 * Twenty-four operational domains deferred their predictive capability to this contract rather than each growing
 * a private forecaster, and that decision is the whole reason this package exists. A cash-flow projection in the
 * financial domain, an attrition risk in the workforce domain and a demand forecast in the transport domain are
 * the same claim about the future wearing three different labels: a number, a range around it, the assumptions
 * that produced it, and enough recorded input to produce it again. One vocabulary for that claim is what lets
 * leadership compare them, an auditor check them, and the knowledge graph relate them.
 *
 * The contract's rule is that every forecast must carry confidence intervals, assumptions, uncertainty, and be
 * reproducible and versioned. This package makes that structural rather than procedural wherever it can: a
 * forecast point cannot be constructed without its intervals, the required confidence level cannot be omitted
 * from a set of them, the horizon ceiling is a constant rather than a caller's choice, and every derived figure
 * is rounded to a fixed precision so that "the same inputs give the same answer" is a property somebody can test
 * rather than a promise somebody made.
 *
 * Two absences are deliberate and load-bearing. There is **no clock**: a period is an integer index into a grid
 * the caller defines, and a label is display text this package never parses. There is **no random source**: every
 * method is closed-form arithmetic over the pinned observations, so a run reproduces exactly rather than
 * approximately. Neither is an omission to be filled in later — they are what make the fourth rule true.
 */

// --- Value objects ---------------------------------------------------------------

export * from "./forecast-value";

// --- Views -----------------------------------------------------------------------

export * from "./forecast-view";

// --- Pure engines ----------------------------------------------------------------

export * from "./series";
export * from "./projection";
export * from "./uncertainty";
export * from "./assumptions";
export * from "./reproducibility";
export * from "./accuracy";
export * from "./simulation";
export * from "./planning";
