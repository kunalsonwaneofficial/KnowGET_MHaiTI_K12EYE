import type { ISODateString, Uuid } from "@knowget/types";

/** The severity of a medical alert or allergy. */
export type MedicalAlertSeverity = "info" | "caution" | "critical";

/** A recorded allergy: the substance, the reaction and its severity. */
export interface Allergy {
  readonly substance: string;
  readonly reaction: string | null;
  readonly severity: MedicalAlertSeverity;
}

/** A chronic medical condition on a learner's health record. */
export interface ChronicCondition {
  readonly name: string;
  readonly notes: string | null;
}

/** An immunization on record. */
export interface Immunization {
  readonly vaccine: string;
  readonly administeredOn: string | null;
}

/** A medication — active until discontinued. */
export interface Medication {
  readonly name: string;
  readonly dosage: string | null;
  readonly active: boolean;
}

/**
 * A raised medical alert — a standing flag (e.g. anaphylaxis risk) that the emergency
 * and duty-of-care surfaces read. Identified by id so it can be cleared.
 */
export interface MedicalAlert {
  readonly id: Uuid;
  readonly label: string;
  readonly severity: MedicalAlertSeverity;
  readonly raisedAt: ISODateString;
}
