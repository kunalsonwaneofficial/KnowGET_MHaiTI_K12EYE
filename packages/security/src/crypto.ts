import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison to avoid timing side-channels when comparing
 * secrets/tokens. Length mismatch returns false. P1-M04 builds full
 * cryptographic services on this foundation.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Mask all but the last `visible` characters of a secret for safe display. */
export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(value.length - visible)}${value.slice(-visible)}`;
}
