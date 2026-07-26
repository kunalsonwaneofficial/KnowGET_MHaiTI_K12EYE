// value objects + views
export * from "./engagement-value";
export * from "./engagement-view";
// aggregates
export * from "./audience";
export * from "./announcement";
export * from "./acknowledgement";
export * from "./message-thread";
// pure engines (announcement reach + engagement rollup; survey tally + response rate)
export * from "./engagement";
export * from "./survey-tally";
// domain events
export * from "./engagement-events";
// application services
export * from "./audience-service";
export * from "./announcement-service";
export * from "./acknowledgement-service";
export * from "./message-thread-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
