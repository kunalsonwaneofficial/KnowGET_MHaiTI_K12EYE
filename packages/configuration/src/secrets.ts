import { ConfigurationError } from "@knowget/exceptions";

/**
 * Provider-independent access to secrets. The default reads from the
 * environment; P1-M04 can supply a KMS/HSM-backed implementation behind this
 * same interface without changing callers.
 */
export interface SecretsProvider {
  get(key: string): string | undefined;
  getOrThrow(key: string): string;
}

export class EnvSecretsProvider implements SecretsProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  get(key: string): string | undefined {
    return this.env[key];
  }

  getOrThrow(key: string): string {
    const value = this.env[key];
    if (value === undefined) {
      throw new ConfigurationError(`Missing required secret: ${key}`);
    }
    return value;
  }
}
