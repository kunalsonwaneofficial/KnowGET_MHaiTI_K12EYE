/**
 * An educational stage an academic program sits at. Covers the standard K-12 ladder plus
 * post-secondary diploma, vocational and a `custom` escape hatch for institution-specific
 * programs — so the platform models any supported academic structure without code changes.
 */
export type ProgramStage =
  | "pre_primary"
  | "primary"
  | "middle"
  | "secondary"
  | "higher_secondary"
  | "diploma"
  | "vocational"
  | "custom";

/** The lifecycle of an academic program. */
export type ProgramStatus = "active" | "archived";
