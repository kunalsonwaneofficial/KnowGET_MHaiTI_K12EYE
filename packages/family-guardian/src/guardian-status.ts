/**
 * The lifecycle of a guardian record: a newly-registered guardian is `pending` until
 * activated, may be `suspended` and reinstated, and is `archived` when retired.
 * `archived` is terminal.
 */
export type GuardianStatus = "pending" | "active" | "suspended" | "archived";
