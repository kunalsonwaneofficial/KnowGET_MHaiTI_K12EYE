/** Dependency-injection tokens for Predictive Intelligence, Simulation & Strategic Planning (P2-D28). */

// Repositories (Prisma/RLS adapters over the predictive-intelligence ports).
export const PI_SERIES_REPOSITORY = Symbol("PI_SERIES_REPOSITORY");
export const PI_MODEL_REPOSITORY = Symbol("PI_MODEL_REPOSITORY");
export const PI_FORECAST_RUN_REPOSITORY = Symbol("PI_FORECAST_RUN_REPOSITORY");
export const PI_BACKTEST_REPOSITORY = Symbol("PI_BACKTEST_REPOSITORY");
export const PI_SCENARIO_REPOSITORY = Symbol("PI_SCENARIO_REPOSITORY");
export const PI_SIMULATION_RUN_REPOSITORY = Symbol("PI_SIMULATION_RUN_REPOSITORY");
export const PI_PLAN_REPOSITORY = Symbol("PI_PLAN_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02, and — for the subject
// a series is about — Student Lifecycle P2-D03 with the knowledge graph P2-D25 behind it).
export const PI_ORGANIZATION_DIRECTORY = Symbol("PI_ORGANIZATION_DIRECTORY");
export const PI_PERSON_DIRECTORY = Symbol("PI_PERSON_DIRECTORY");
export const PI_SUBJECT_DIRECTORY = Symbol("PI_SUBJECT_DIRECTORY");

// Application services.
export const PI_SERIES_SERVICE = Symbol("PI_SERIES_SERVICE");
export const PI_MODEL_SERVICE = Symbol("PI_MODEL_SERVICE");
export const PI_FORECAST_RUN_SERVICE = Symbol("PI_FORECAST_RUN_SERVICE");
export const PI_BACKTEST_SERVICE = Symbol("PI_BACKTEST_SERVICE");
export const PI_SCENARIO_SERVICE = Symbol("PI_SCENARIO_SERVICE");
export const PI_SIMULATION_RUN_SERVICE = Symbol("PI_SIMULATION_RUN_SERVICE");
export const PI_PLAN_SERVICE = Symbol("PI_PLAN_SERVICE");
