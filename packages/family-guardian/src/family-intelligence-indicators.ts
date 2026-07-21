/** A coarse assessment of how engaged a family is with the institution. */
export type EngagementLevel = "high" | "moderate" | "low" | "disengaged";

/** How responsive a family is to institutional communication. */
export type ResponsivenessLevel = "responsive" | "slow" | "unresponsive";

/** A family's standing on its institutional consent obligations. */
export type ConsentComplianceLevel = "compliant" | "partial" | "non_compliant";

/**
 * AI-ready family indicators. Every field is nullable — the profile establishes the
 * model and integration points for future family-engagement analytics, but nothing
 * here is computed by this domain (prediction is deferred to the Institutional
 * Intelligence program). `participationRate` is a 0..1 summary of participation
 * history.
 */
export interface FamilyIntelligenceIndicators {
  readonly engagementLevel: EngagementLevel | null;
  readonly communicationResponsiveness: ResponsivenessLevel | null;
  readonly participationRate: number | null;
  readonly consentCompliance: ConsentComplianceLevel | null;
}

/** The empty indicator set a new profile starts from. */
export const EMPTY_FAMILY_INDICATORS: FamilyIntelligenceIndicators = {
  engagementLevel: null,
  communicationResponsiveness: null,
  participationRate: null,
  consentCompliance: null,
};
