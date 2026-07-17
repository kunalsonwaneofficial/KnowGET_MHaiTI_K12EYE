import { PlatformError } from "@knowget/exceptions";
import { hmacSign, hmacVerify } from "@knowget/security";

/** Raised for any token validation failure (maps to HTTP 401). */
export class TokenError extends PlatformError {
  constructor(message: string) {
    super(message, { code: "VALIDATION_ERROR", httpStatus: 401, isOperational: true });
  }
}

export interface JwtClaims {
  readonly sub: string;
  readonly iss?: string;
  readonly iat?: number;
  readonly exp?: number;
  readonly nbf?: number;
  readonly [key: string]: unknown;
}

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const decodeSegment = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

export interface SignJwtOptions {
  readonly key: Buffer;
  readonly expiresInMs?: number;
  readonly issuer?: string;
  /** Epoch milliseconds override (for deterministic tests). */
  readonly now?: number;
}

/** Issue an HS256 JWT. */
export function signJwt(
  claims: { sub: string } & Record<string, unknown>,
  options: SignJwtOptions,
): string {
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const payload: JwtClaims = {
    ...claims,
    iat: nowSeconds,
    ...(options.issuer ? { iss: options.issuer } : {}),
    ...(options.expiresInMs ? { exp: nowSeconds + Math.floor(options.expiresInMs / 1000) } : {}),
  };
  const signingInput = `${encodeSegment({ alg: "HS256", typ: "JWT" })}.${encodeSegment(payload)}`;
  return `${signingInput}.${hmacSign(signingInput, options.key)}`;
}

export interface VerifyJwtOptions {
  readonly key: Buffer;
  readonly issuer?: string;
  readonly now?: number;
}

/** Verify an HS256 JWT (signature, expiry, not-before, issuer) and return its claims. */
export function verifyJwt(token: string, options: VerifyJwtOptions): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TokenError("Malformed token");
  }
  const [header, payload, signature] = parts as [string, string, string];
  if (!hmacVerify(`${header}.${payload}`, signature, options.key)) {
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
