import { hmacVerify, type KeyRing } from "@knowget/security";
import { type JwtClaims, signJwt, TokenError, verifyJwt } from "@knowget/tokens";

export interface TokenClaims {
  readonly sub: string;
  readonly [key: string]: unknown;
}

export interface TokenSignOptions {
  readonly expiresInMs?: number;
  readonly issuer?: string;
  /** Epoch milliseconds override (for deterministic tests). */
  readonly now?: number;
}

export interface TokenVerifyOptions {
  readonly issuer?: string;
  readonly now?: number;
}

/**
 * Async token signer/verifier seam (TD-11). The default is HMAC (HS256) over the
 * frozen {@link KeyRing}; an asymmetric KMS/HSM signer (RS256) implements the same
 * port so a deployment can move signing into a KMS — where the private key never
 * leaves the device — without changing issuance or verification callers. Async
 * because a KMS `Sign` call is a network round-trip.
 */
export interface TokenSigner {
  readonly alg: string;
  sign(claims: TokenClaims, options?: TokenSignOptions): Promise<string>;
  verify(token: string, options?: TokenVerifyOptions): Promise<JwtClaims>;
}

/**
 * HS256 signer over the frozen {@link KeyRing}. Signs with the current key; verifies
 * against the current key **and any retained prior version**, so tokens signed
 * before a rotation keep verifying through the overlap window — resolving TD-11's
 * single-current-key verification limit. No frozen change: it composes the frozen
 * `signJwt`/`verifyJwt` and constant-time `hmacVerify`.
 */
export class HmacTokenSigner implements TokenSigner {
  readonly alg = "HS256";

  constructor(private readonly keyRing: KeyRing) {}

  async sign(claims: TokenClaims, options: TokenSignOptions = {}): Promise<string> {
    return signJwt(claims, {
      key: this.keyRing.current().material,
      ...(options.expiresInMs !== undefined ? { expiresInMs: options.expiresInMs } : {}),
      ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  }

  async verify(token: string, options: TokenVerifyOptions = {}): Promise<JwtClaims> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new TokenError("Malformed token");
    }
    const [header, payload, signature] = parts as [string, string, string];
    const signingInput = `${header}.${payload}`;
    // Newest version first: find the key that actually signed this token, then run
    // the full frozen verification (expiry, not-before, issuer) with it.
    for (const version of [...this.keyRing.versions()].reverse()) {
      const key = this.keyRing.get(version)?.material;
      if (key && hmacVerify(signingInput, signature, key)) {
        return verifyJwt(token, {
          key,
          ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
          ...(options.now !== undefined ? { now: options.now } : {}),
        });
      }
    }
    throw new TokenError("Invalid token signature");
  }
}
