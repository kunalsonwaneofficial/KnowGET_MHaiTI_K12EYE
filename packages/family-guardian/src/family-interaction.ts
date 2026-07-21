import type { ISODateString } from "@knowget/types";

/** The kind of institutional interaction a family had. */
export type FamilyInteractionKind =
  "meeting" | "message" | "call" | "event_attendance" | "form_submission" | "visit" | "other";

/**
 * A single, immutable entry in a family's institutional interaction timeline — when it
 * happened, what kind, and a short summary. Appended, never edited.
 */
export interface FamilyInteraction {
  readonly at: ISODateString;
  readonly kind: FamilyInteractionKind;
  readonly summary: string;
}
