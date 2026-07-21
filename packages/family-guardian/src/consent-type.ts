/** The category of an institutional consent. */
export type ConsentType =
  "academic" | "medical" | "media" | "excursion" | "technology" | "data_privacy";

/** Whether a consent record grants or withdraws consent. */
export type ConsentDecision = "granted" | "withdrawn";
