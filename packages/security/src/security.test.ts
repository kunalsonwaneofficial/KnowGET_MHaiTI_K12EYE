import { describe, expect, it } from "vitest";
import { constantTimeEquals, maskSecret } from "./crypto";
import { defaultPasswordPolicy, validatePassword } from "./password-policy";
import { SECURITY_HEADERS } from "./security-headers";

describe("password policy", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Str0ng!Passphrase").valid).toBe(true);
  });

  it("reports violations for a weak password", () => {
    const result = validatePassword("weak", defaultPasswordPolicy);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

describe("crypto helpers", () => {
  it("compares equal strings in constant time", () => {
    expect(constantTimeEquals("token-abc", "token-abc")).toBe(true);
    expect(constantTimeEquals("token-abc", "token-xyz")).toBe(false);
    expect(constantTimeEquals("short", "longer-value")).toBe(false);
  });

  it("masks secrets leaving a short suffix", () => {
    expect(maskSecret("supersecret", 4)).toBe("*******cret");
    expect(maskSecret("abc", 4)).toBe("***");
  });
});

describe("security headers", () => {
  it("includes hardening defaults", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });
});
