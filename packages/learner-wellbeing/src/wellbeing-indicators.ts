/**
 * AI-ready wellbeing indicators. Every field is nullable — the profile exposes a
 * structured surface for the Institutional Intelligence program to consume; predictive
 * and autonomous recommendations belong to that program, not to this domain.
 */
export interface WellbeingIndicators {
  readonly wellbeingTrend: string | null;
  readonly behaviourPattern: string | null;
  readonly engagementLevel: string | null;
  readonly attendanceCorrelation: string | null;
  readonly academicSignal: string | null;
  readonly interventionEffectiveness: string | null;
}

/** The empty indicator set a new profile starts from. */
export const EMPTY_WELLBEING_INDICATORS: WellbeingIndicators = {
  wellbeingTrend: null,
  behaviourPattern: null,
  engagementLevel: null,
  attendanceCorrelation: null,
  academicSignal: null,
  interventionEffectiveness: null,
};

/** A named success metric on a learner's wellbeing profile (a 0..1 or scaled value). */
export interface SuccessMetric {
  readonly name: string;
  readonly value: number;
}
