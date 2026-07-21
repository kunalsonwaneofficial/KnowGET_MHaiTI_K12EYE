/**
 * Identity-verification standing of a guardian, tracked independently of the guardian
 * lifecycle status: `unverified` on registration, `pending` once submitted, then a
 * terminal `verified` or `rejected` (which may be resubmitted).
 */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
