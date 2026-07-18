/**
 * The kinds of institutional governance body. A tenant's governance is expressed
 * as a hierarchy of these — e.g. a Board of Trustees at the apex, with a School
 * Management Committee and an Academic Council beneath it. `other` accommodates
 * governance models not captured by the standard set (the model supports multiple
 * governance structures without redesign).
 */
export type GovernanceBodyType =
  | "board_of_trustees"
  | "governing_council"
  | "school_management_committee"
  | "academic_council"
  | "finance_committee"
  | "executive_committee"
  | "other";

export const GOVERNANCE_BODY_TYPES: readonly GovernanceBodyType[] = [
  "board_of_trustees",
  "governing_council",
  "school_management_committee",
  "academic_council",
  "finance_committee",
  "executive_committee",
  "other",
];

/** Type guard for a {@link GovernanceBodyType}. */
export const isGovernanceBodyType = (value: string): value is GovernanceBodyType =>
  (GOVERNANCE_BODY_TYPES as readonly string[]).includes(value);
