/**
 * A coarse wellbeing standing on one dimension, from thriving to serious concern. Used
 * across the physical, emotional, social and behavioural dimensions of the wellbeing
 * profile. This domain records the standing; it does not compute or diagnose it.
 */
export type WellbeingLevel = "thriving" | "stable" | "monitor" | "at_risk" | "concern";

/**
 * A learner's wellbeing standing across the four holistic dimensions. Every dimension
 * is nullable — the profile establishes the model; nothing here is auto-computed.
 */
export interface WellbeingDimensions {
  readonly physical: WellbeingLevel | null;
  readonly emotional: WellbeingLevel | null;
  readonly social: WellbeingLevel | null;
  readonly behavioural: WellbeingLevel | null;
}

/** The empty dimensions a new profile starts from. */
export const EMPTY_WELLBEING_DIMENSIONS: WellbeingDimensions = {
  physical: null,
  emotional: null,
  social: null,
  behavioural: null,
};
