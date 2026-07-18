import { createSign, generateKeyPairSync } from "node:crypto";

/**
 * A KMS/HSM that holds an asymmetric private key and signs on request; the private
 * key never leaves the device. A cloud KMS `Sign` API (AWS KMS, GCP KMS, Azure Key
 * Vault) or a PKCS#11 HSM implements this port. Verification is done locally with
 * the public key (JWKS-style), so it needs no KMS round-trip.
 */
export interface KmsSigner {
  readonly alg: "RS256";
  readonly keyId: string;
  /** Sign the JWT signing-input; returns a base64url signature. */
  sign(signingInput: string): Promise<string>;
  /** PEM-encoded public key, for local verification / JWKS publication. */
  publicKeyPem(): string;
}

/**
 * In-process software-key double for {@link KmsSigner} (dev/sandbox): an RSA-2048
 * keypair generated in memory, signing with RSASSA-PKCS1-v1_5 + SHA-256 (RS256).
 * It models a KMS's Sign / GetPublicKey so the asymmetric JWT path is fully
 * exercised and verified in-sandbox; a real KMS/HSM adapter implements the same
 * port and drops in without touching the JWT layer. Only the public key is
 * exportable — the private key stays inside the instance.
 */
export class LocalKmsSigner implements KmsSigner {
  readonly alg = "RS256";

  private constructor(
    private readonly privateKey: string,
    private readonly publicKey: string,
    readonly keyId: string,
  ) {}

  /** Generate a fresh in-memory RSA keypair (models KMS key creation). */
  static generate(keyId = "local-rsa"): LocalKmsSigner {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return new LocalKmsSigner(privateKey, publicKey, keyId);
  }

  /** Load an existing keypair (e.g. imported into the KMS), modeling a managed key. */
  static fromPem(privateKeyPem: string, publicKeyPem: string, keyId = "local-rsa"): LocalKmsSigner {
    return new LocalKmsSigner(privateKeyPem, publicKeyPem, keyId);
  }

  async sign(signingInput: string): Promise<string> {
    return createSign("RSA-SHA256").update(signingInput).sign(this.privateKey, "base64url");
  }

  publicKeyPem(): string {
    return this.publicKey;
  }
}
