import { loadConfig } from "@knowget/configuration";
import { z } from "zod";

/**
 * Security-related environment configuration, validated at startup. Secrets are
 * optional in development/test (ephemeral defaults are generated) but MUST be
 * provided in production — {@link resolveSecuritySecrets} enforces that
 * fail-closed rather than silently booting with a throwaway key.
 */
export const securityEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Which identity / principal→role stores back the live security layer.
   * `memory` (default) uses the in-memory bootstrap (dev/test/sandbox); `persisted`
   * wires the tenant-scoped Prisma-backed stores (identity accounts, membership
   * roles, role catalogue) and seeds a bootstrap admin (see PersistedSecurityModule).
   */
  SECURITY_STORE: z.enum(["memory", "persisted"]).default("memory"),
  /**
   * Signing-key custody (TD-11). `plaintext` (default) takes the key from
   * `SECURITY_JWT_SECRET` (or a dev ephemeral key); `envelope` unwraps a
   * KMS/HSM-wrapped key at boot so the signing key is never held in plaintext at
   * rest (requires `SECURITY_KMS_MASTER_KEY` + `SECURITY_JWT_KEY_WRAPPED`).
   */
  SECURITY_KEY_CUSTODY: z.enum(["plaintext", "envelope"]).default("plaintext"),
  /** Base64- or utf8-encoded HS256 signing secret (>= 32 bytes recommended). */
  SECURITY_JWT_SECRET: z.string().min(1).optional(),
  /** Envelope custody: base64-encoded 32-byte key-encryption-key for the (local) KMS. */
  SECURITY_KMS_MASTER_KEY: z.string().min(1).optional(),
  /** Envelope custody: the KMS-wrapped JWT signing key (see `provisionEnvelopeKey`). */
  SECURITY_JWT_KEY_WRAPPED: z.string().min(1).optional(),
  /** Bootstrap administrator identity, seeded on first boot. */
  SECURITY_BOOTSTRAP_EMAIL: z.string().email().optional(),
  SECURITY_BOOTSTRAP_PASSWORD: z.string().min(1).optional(),
  /** Tenant the bootstrap administrator is seeded into (required for `persisted`). */
  SECURITY_BOOTSTRAP_TENANT: z.string().uuid().optional(),
  /** Global per-client rate-limit budget. */
  SECURITY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  SECURITY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type SecurityEnv = z.infer<typeof securityEnvSchema>;

export function loadSecurityEnv(source?: Record<string, unknown>): SecurityEnv {
  return loadConfig(securityEnvSchema, source ? { source } : {});
}
