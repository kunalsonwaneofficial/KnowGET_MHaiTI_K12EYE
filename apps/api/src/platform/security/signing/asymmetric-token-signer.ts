import { createVerify } from "node:crypto";
import { type JwtClaims, TokenError } from "@knowget/tokens";
import type { KmsSigner } from "./kms-signer";
import type {
  TokenClaims,
  TokenSignOptions,
  TokenSigner,
  TokenVerifyOptions,
} from "./token-signer";

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const decodeSegment = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

/**
 * Asymmetric {@link TokenSigner} (RS256): assembles the JWT and delegates the
 * signature to a {@link KmsSigner}, so the private key stays in the KMS/HSM;
 * verification runs locally against the KMS's public key. The claim envelope (iat,
 * iss, exp in seconds) mirrors the frozen HS256 `signJwt` — only the algorithm and
 * key custody differ (the frozen signer is HS256-only, so RS256 cannot reuse it).
 * Built and verified in-sandbox via the local software-key double; a cloud-KMS
 * `KmsSigner` adapter activates it in production without any caller change.
 */
export class AsymmetricTokenSigner implements TokenSigner {
  constructor(private readonly kms: KmsSigner) {}

  get alg(): string {
    return this.kms.alg;
  }

  async sign(claims: TokenClaims, options: TokenSignOptions = {}): Promise<string> {
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
    const payload: JwtClaims = {
      ...claims,
      iat: nowSeconds,
      ...(options.issuer ? { iss: options.issuer } : {}),
      ...(options.expiresInMs ? { exp: nowSeconds + Math.floor(options.expiresInMs / 1000) } : {}),
    };
    const signingInput = `${encodeSegment({ alg: this.kms.alg, typ: "JWT" })}.${encodeSegment(payload)}`;
    const signature = await this.kms.sign(signingInput);
    return `${signingInput}.${signature}`;
  }

  async verify(token: string, options: TokenVerifyOptions = {}): Promise<JwtClaims> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new TokenError("Malformed token");
    }
    const [header, payload, signature] = parts as [string, string, string];
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(this.kms.publicKeyPem(), Buffer.from(signature, "base64url"));
    if (!verified) {
      throw new TokenError("Invalid token signature");
    }
    const claims = decodeSegment(payload) as JwtClaims;
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
    if (typeof claims.exp === "number" && nowSeconds >= claims.exp) {
      throw new TokenError("Token expired");
    }
    if (typeof claims.nbf === "number" && nowSeconds < claims.nbf) {
      throw new TokenError("Token not yet valid");
    }
    if (options.issuer && claims.iss !== options.issuer) {
      throw new TokenError("Invalid token issuer");
    }
    return claims;
  }
}
