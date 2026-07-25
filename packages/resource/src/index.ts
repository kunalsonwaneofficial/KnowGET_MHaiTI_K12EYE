// money core + value objects + views
export * from "./money";
export * from "./resource-value";
export * from "./resource-view";
// aggregates
export * from "./supplier";
export * from "./inventory-item";
// pure engines (stock balance, depreciation)
export * from "./stock-position";
export * from "./depreciation";
// domain events
export * from "./resource-events";
// application services
export * from "./supplier-service";
export * from "./inventory-item-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
