// value objects + views
export * from "./admissions-value";
export * from "./admissions-view";
// aggregates
export * from "./marketing-campaign";
export * from "./lead";
export * from "./admission-cycle";
export * from "./application";
export * from "./admission-evaluation";
export * from "./offer";
export * from "./enrollment-confirmation";
export * from "./admissions-funnel-profile";
// pure engines (admission funnel + application-stage tally; intake capacity + rollup)
export * from "./funnel";
export * from "./intake";
// domain events
export * from "./admissions-events";
// application services
export * from "./marketing-campaign-service";
export * from "./lead-service";
export * from "./admission-cycle-service";
export * from "./application-service";
export * from "./admission-evaluation-service";
export * from "./offer-service";
export * from "./enrollment-confirmation-service";
export * from "./admissions-funnel-profile-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
