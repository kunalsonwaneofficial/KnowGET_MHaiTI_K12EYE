/**
 * The basis of a guardian's legal authority over a learner. `none` denotes a
 * designated contact (for example an emergency contact) who holds no legal authority.
 * Legal responsibility on a student–guardian relationship requires an authority other
 * than `none`.
 */
export type LegalAuthorityType =
  | "biological_parent"
  | "adoptive_parent"
  | "legal_guardian"
  | "foster_parent"
  | "grandparent"
  | "sibling_guardian"
  | "court_appointed"
  | "institutional"
  | "none";
