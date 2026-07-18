import { ConfigurationError } from "@knowget/exceptions";
import { generateKey, KeyRing } from "@knowget/security";
import type { KmsClient } from "./kms-client";

/**
 * How the JWT signing key is custodied (TD-11).
 *
 * - `plaintext` — the key comes from `SECURITY_JWT_SECRET` (or an ephemeral dev
 *   key). Historical default; the raw secret sits in the environment.
 * - `envelope` — the key is stored **wrapped** by a KMS/HSM key-encryption-key and
 *   unwrapped at boot, so the signing key is never held in plaintext at rest.
 */
export type KeyCustodyMode = "plaintext" | "envelope";

/** Read a 32-byte KEK from a base64-encoded secret. */
export function readKek(base64: string): Buffer {
  const kek = Buffer.from(base64, "base64");
  if (kek.length !== 32) {
    throw new ConfigurationError(
      "SECURITY_KMS_MASTER_KEY must be a base64-encoded 32-byte key (AES-256)",
    );
  }
  return kek;
}

/**
 * Unwrap the envelope-encrypted signing key via the KMS and seed a {@link KeyRing}
 * with it, so every downstream consumer (signer, guard, frozen engine) uses the
 * custodied material transparently.
 */
export async function resolveEnvelopeKeyRing(wrappedKey: string, kms: KmsClient): Promise<KeyRing> {
  const material = await kms.unwrap(wrappedKey);
  if (material.length === 0) {
    throw new ConfigurationError("Unwrapped signing key is empty");
  }
  return new KeyRing(material);
}

/**
 * Provisioning helper: generate a fresh signing key and wrap it under the KMS,
 * returning both the wrapped blob (store as `SECURITY_JWT_KEY_WRAPPED`) and the raw
 * material (for verification only — do not persist). Used by ops tooling and tests.
 */
export async function provisionEnvelopeKey(
  kms: KmsClient,
): Promise<{ readonly wrapped: string; readonly material: Buffer }> {
  const material = generateKey();
  const wrapped = await kms.wrap(material);
  return { wrapped, material };
}
