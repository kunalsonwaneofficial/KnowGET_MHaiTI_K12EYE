import { ConfigurationError } from "@knowget/exceptions";
import { decrypt, encrypt } from "@knowget/security";

/**
 * Envelope-encryption key custody port (TD-11). A key-encryption-key (KEK) held
 * by a KMS/HSM wraps (encrypts) the data key — here the JWT signing key — so the
 * signing key is never stored in plaintext. A cloud KMS (AWS KMS `Encrypt`/
 * `Decrypt`, GCP KMS, Azure Key Vault) or a PKCS#11 HSM implements this same port;
 * the composition root selects one without any caller change.
 */
export interface KmsClient {
  /** Identifier of the wrapping key (KEK) — surfaced for audit and rotation. */
  readonly keyId: string;
  /** Wrap (encrypt) plaintext key material under the KEK; returns opaque ciphertext. */
  wrap(plaintext: Buffer): Promise<string>;
  /** Unwrap (decrypt) a value produced by {@link wrap}. Throws if it was tampered with. */
  unwrap(ciphertext: string): Promise<Buffer>;
}

/** A KEK is a 32-byte (AES-256) key. */
const KEK_BYTES = 32;

/**
 * In-process KMS double: envelope-encrypts with a KEK held in the process (sourced
 * from a secret), using AES-256-GCM via the frozen crypto services. It models a
 * cloud KMS's Encrypt/Decrypt so the exact wrapped-key custody path is exercised
 * and verified in-sandbox; a real KMS/HSM adapter implements {@link KmsClient} and
 * drops in behind the same port. Key material round-trips through base64 because the
 * frozen `encrypt`/`decrypt` operate on UTF-8 strings.
 */
export class LocalKmsClient implements KmsClient {
  constructor(
    private readonly kek: Buffer,
    readonly keyId = "local",
  ) {
    if (kek.length !== KEK_BYTES) {
      throw new ConfigurationError(
        `KMS master key (KEK) must be ${KEK_BYTES} bytes; received ${kek.length}`,
      );
    }
  }

  async wrap(plaintext: Buffer): Promise<string> {
    return encrypt(plaintext.toString("base64"), this.kek);
  }

  async unwrap(ciphertext: string): Promise<Buffer> {
    return Buffer.from(decrypt(ciphertext, this.kek), "base64");
  }
}
