// value objects + views
export * from "./alumni-value";
export * from "./alumni-view";
// aggregates
export * from "./alumni-profile";
export * from "./alumni-chapter";
export * from "./chapter-membership";
export * from "./alumni-event";
export * from "./event-registration";
export * from "./mentorship-connection";
// pure engines (alumni engagement scoring + rollup; event/chapter participation + rollup)
export * from "./alumni-engagement";
export * from "./participation";
// domain events
export * from "./alumni-events";
// application services
export * from "./alumni-profile-service";
export * from "./alumni-chapter-service";
export * from "./chapter-membership-service";
export * from "./alumni-event-service";
export * from "./event-registration-service";
export * from "./mentorship-connection-service";
// ports (repositories + directories) and in-memory adapters
export * from "./ports";
// domain errors
export * from "./errors";
