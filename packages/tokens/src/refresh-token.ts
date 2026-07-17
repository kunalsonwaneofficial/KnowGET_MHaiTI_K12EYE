import { createHash } from "node:crypto";
import { constantTimeEquals, secureToken } from "@knowget/security";

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

export interface IssuedRefreshToken {
  /** Opaque token returned to the client. */
  readonly token: string;
  /** SHA-256 hash stored server-side (never store the raw token). */
  readonly tokenHash: string;
  /** Token family — rotating a refresh token keeps the family; reuse revokes it. */
  readonly familyId: string;
  readonly expiresAt: number;
}

export interface IssueRefreshTokenOptions {
  readonly ttlMs: number;
  readonly familyId?: string;
  readonly now?: number;
}

/** Issue a high-entropy opaque refresh token plus its stored hash. */
export function issueRefreshToken(options: IssueRefreshTokenOptions): IssuedRefreshToken {
  const token = secureToken(48);
  const now = options.now ?? Date.now();
  return {
    token,
    tokenHash: sha256Hex(token),
    familyId: options.familyId ?? secureToken(16),
    expiresAt: now + options.ttlMs,
  };
}

/** Constant-time check that a presented token matches a stored hash. */
export function refreshTokenMatches(token: string, tokenHash: string): boolean {
  return constantTimeEquals(sha256Hex(token), tokenHash);
}
