import type { ISODateString, Uuid } from "@knowget/types";

/** The assessed risk of a safeguarding concern. */
export type SafeguardingRiskLevel = "low" | "medium" | "high" | "critical";

/**
 * The investigation workflow state of a safeguarding case. Escalation is a first-class
 * status so oversight can see, at a glance, which concerns have been raised to a higher
 * authority; a resolved case is terminal and immutable.
 */
export type SafeguardingCaseStatus = "reported" | "under_investigation" | "escalated" | "resolved";

/** A dated incident report filed against a safeguarding case, by a Person. Append-only. */
export interface SafeguardingIncidentReport {
  readonly id: Uuid;
  readonly description: string;
  readonly reportedBy: Uuid;
  readonly occurredOn: string;
  readonly reportedAt: ISODateString;
}

/**
 * An escalation of a safeguarding case to a higher authority or external body. The
 * escalation trail is append-only and is the backbone of case traceability — every
 * escalation records who raised it, to whom, and why.
 */
export interface SafeguardingEscalation {
  readonly id: Uuid;
  readonly escalatedTo: string;
  readonly reason: string;
  readonly escalatedBy: Uuid;
  readonly escalatedAt: ISODateString;
}

/** Coordination with an external agency (e.g. social services, police). Append-only. */
export interface ExternalAgencyInvolvement {
  readonly id: Uuid;
  readonly agency: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly involvedAt: ISODateString;
}
