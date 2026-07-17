/** Feature-flag evaluation service. */
export interface FeatureFlagService {
  isEnabled(flag: string): boolean;
  all(): Readonly<Record<string, boolean>>;
}

/**
 * Static, config-driven feature flags. Sufficient for the platform core;
 * dynamic/targeted flags can replace this behind the same interface later.
 */
export class StaticFeatureFlagService implements FeatureFlagService {
  private readonly flags: Record<string, boolean>;

  constructor(flags: Record<string, boolean> = {}) {
    this.flags = { ...flags };
  }

  isEnabled(flag: string): boolean {
    return this.flags[flag] === true;
  }

  all(): Readonly<Record<string, boolean>> {
    return { ...this.flags };
  }
}
