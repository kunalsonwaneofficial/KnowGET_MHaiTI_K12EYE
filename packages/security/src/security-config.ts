import { defaultPasswordPolicy, type PasswordPolicy } from "./password-policy";

export interface SessionPolicy {
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  readonly maxConcurrentSessions: number;
}

export interface TokenPolicy {
  readonly accessTokenTtlMs: number;
  readonly refreshTokenTtlMs: number;
  readonly issuer: string;
}

export interface LoginPolicy {
  readonly maxFailedAttempts: number;
  readonly lockoutDurationMs: number;
}

/** Centralized security policy configuration. */
export interface SecurityConfig {
  readonly password: PasswordPolicy;
  readonly session: SessionPolicy;
  readonly token: TokenPolicy;
  readonly login: LoginPolicy;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Enterprise-sensible defaults; overridden via configuration per environment. */
export const defaultSecurityConfig: SecurityConfig = {
  password: defaultPasswordPolicy,
  session: {
    idleTimeoutMs: 30 * MINUTE,
    absoluteTimeoutMs: 12 * HOUR,
    maxConcurrentSessions: 5,
  },
  token: {
    accessTokenTtlMs: 15 * MINUTE,
    refreshTokenTtlMs: 7 * DAY,
    issuer: "knowget-mhaiti",
  },
  login: {
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * MINUTE,
  },
};
