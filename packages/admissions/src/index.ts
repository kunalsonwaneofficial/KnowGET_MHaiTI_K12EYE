// value objects + views
export * from "./admissions-value";
export * from "./admissions-view";
// aggregates
export * from "./marketing-campaign";
export * from "./lead";
// pure engines (admission funnel + application-stage tally; intake capacity + rollup)
export * from "./funnel";
export * from "./intake";
// domain events
export * from "./admissions-events";
// application services
export * from "./marketing-campaign-service";
export * from "./lead-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
