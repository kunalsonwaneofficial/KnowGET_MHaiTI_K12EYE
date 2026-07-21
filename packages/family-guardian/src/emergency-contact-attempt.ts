import type { ISODateString } from "@knowget/types";

/** The outcome of an attempt to reach an emergency contact. */
export type EmergencyContactOutcome = "reached" | "no_answer" | "left_message" | "unreachable";

/**
 * A single, immutable entry in an emergency contact's history — when the institution
 * tried to reach them and what happened. Appended, never edited.
 */
export interface EmergencyContactAttempt {
  readonly at: ISODateString;
  readonly outcome: EmergencyContactOutcome;
  readonly note: string | null;
}
