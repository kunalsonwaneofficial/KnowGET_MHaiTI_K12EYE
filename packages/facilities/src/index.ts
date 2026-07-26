// value objects + views
export * from "./facilities-value";
export * from "./facilities-view";
// aggregates
export * from "./building";
export * from "./space";
// pure engines (building condition + campus rollup + service status; comfort index)
export * from "./condition";
export * from "./comfort";
// domain events
export * from "./facilities-events";
// application services
export * from "./building-service";
export * from "./space-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
