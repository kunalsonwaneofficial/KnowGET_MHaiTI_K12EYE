// value objects + views
export * from "./facilities-value";
export * from "./facilities-view";
// aggregates
export * from "./building";
export * from "./space";
export * from "./facility-system";
export * from "./sensor";
export * from "./environment-reading";
export * from "./maintenance-order";
export * from "./comfort-policy";
export * from "./facility-profile";
// pure engines (building condition + campus rollup + service status; comfort index)
export * from "./condition";
export * from "./comfort";
// domain events
export * from "./facilities-events";
// application services
export * from "./building-service";
export * from "./space-service";
export * from "./facility-system-service";
export * from "./sensor-service";
export * from "./environment-reading-service";
export * from "./maintenance-order-service";
export * from "./comfort-policy-service";
export * from "./facility-profile-service";
export * from "./comfort-assessment-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
