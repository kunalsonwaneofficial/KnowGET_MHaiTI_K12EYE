/**
 * The responsibilities and authorizations a guardian holds for a specific learner,
 * each independently managed. Legal, educational and financial responsibility are
 * distinct; pickup and medical authorization are separate grants. Legal responsibility
 * requires the guardian to hold legal authority (validated by the service).
 */
export interface ResponsibilityProfile {
  readonly legal: boolean;
  readonly educational: boolean;
  readonly financial: boolean;
  readonly pickupAuthorized: boolean;
  readonly medicalAuthorized: boolean;
}

/** No responsibilities or authorizations — the default at link time. */
export const NO_RESPONSIBILITIES: ResponsibilityProfile = {
  legal: false,
  educational: false,
  financial: false,
  pickupAuthorized: false,
  medicalAuthorized: false,
};
