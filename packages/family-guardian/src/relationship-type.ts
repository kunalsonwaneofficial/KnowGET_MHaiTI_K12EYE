/**
 * The nature of a learner's link to a guardian. Independent of the guardian's own
 * {@link LegalAuthorityType}: a person may relate to a learner as, e.g., a grandparent
 * while holding court-appointed legal authority.
 */
export type StudentGuardianRelationshipType =
  | "biological_parent"
  | "adoptive_parent"
  | "legal_guardian"
  | "foster_parent"
  | "grandparent"
  | "sibling"
  | "court_appointed_guardian"
  | "institutional_guardian"
  | "emergency_contact"
  | "other";
