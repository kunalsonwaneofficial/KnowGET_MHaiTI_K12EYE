/** The actions an emergency contact is authorized to perform for a learner. */
export interface EmergencyAuthorizations {
  readonly pickup: boolean;
  readonly medical: boolean;
}

/** No authorized actions — the default for a new emergency contact. */
export const NO_EMERGENCY_AUTHORIZATIONS: EmergencyAuthorizations = {
  pickup: false,
  medical: false,
};
