/**
 * The kind of governance calendar event. Meetings carry minutes and attendance;
 * compliance deadlines and regulatory events track obligations; reviews and board
 * activities record scheduled governance work.
 */
export type GovernanceEventType =
  "meeting" | "compliance_deadline" | "board_activity" | "regulatory_event" | "review";

export const GOVERNANCE_EVENT_TYPES: readonly GovernanceEventType[] = [
  "meeting",
  "compliance_deadline",
  "board_activity",
  "regulatory_event",
  "review",
];

/** Type guard for a {@link GovernanceEventType}. */
export const isGovernanceEventType = (value: string): value is GovernanceEventType =>
  (GOVERNANCE_EVENT_TYPES as readonly string[]).includes(value);
