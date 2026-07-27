/**
 * `@knowget/decision-intelligence` — Institutional Decision Intelligence, Workflow Orchestration & Autonomous
 * Operations (P2-D27), the third contract of the intelligence core.
 *
 * A pure domain package: no Prisma, no NestJS, no HTTP, no clock, no provider client. The adapters live at the
 * composition root (`apps/api`), and every engine here takes the moment it should judge against as an argument.
 */

// --- Value objects and engine views ----------------------------------------------
export * from "./decision-value";
export * from "./decision-view";

// --- Pure engines ----------------------------------------------------------------
export * from "./autonomy";
export * from "./evidence";
export * from "./orchestration";
export * from "./reversal";
export * from "./prioritization";
export * from "./metrics";

// --- Aggregates ------------------------------------------------------------------
export * from "./errors";
export * from "./recommendation";
export * from "./decision-record";
export * from "./workflow";
export * from "./workflow-instance";
