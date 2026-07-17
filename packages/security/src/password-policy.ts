/** Configurable password strength policy. */
export interface PasswordPolicy {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireDigit: boolean;
  readonly requireSymbol: boolean;
}

/** Enterprise-sensible default policy (refined via config in P1-M04). */
export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
};

export interface PasswordValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

/** Validate a password against a policy, returning any violations. */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = defaultPasswordPolicy,
): PasswordValidationResult {
  const violations: string[] = [];
  if (password.length < policy.minLength) {
    violations.push(`must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    violations.push("must contain an uppercase letter");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    violations.push("must contain a lowercase letter");
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    violations.push("must contain a digit");
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    violations.push("must contain a symbol");
  }
  return { valid: violations.length === 0, violations };
}
