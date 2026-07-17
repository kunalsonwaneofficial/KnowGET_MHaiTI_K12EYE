/**
 * Baseline HTTP security headers applied by the platform's security middleware
 * (wired into the runtime in P1-M04). Values may be tightened per-environment.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-XSS-Protection": "0",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-DNS-Prefetch-Control": "off",
};
