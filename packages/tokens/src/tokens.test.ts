import { generateKey } from "@knowget/security";
import { describe, expect, it } from "vitest";
import { signJwt, TokenError, verifyJwt } from "./jwt";
import { issueRefreshToken, refreshTokenMatches } from "./refresh-token";
import { RevocationRegistry } from "./revocation";

const KEY = generateKey();
const T0 = 1_700_000_000_000;

describe("JWT (HS256)", () => {
  it("signs and verifies claims", () => {
    const token = signJwt(
      { sub: "u1", role: "admin" },
      { key: KEY, issuer: "knowget", expiresInMs: 60_000, now: T0 },
    );
    const claims = verifyJwt(token, { key: KEY, issuer: "knowget", now: T0 + 1000 });
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("admin");
    expect(claims.iss).toBe("knowget");
  });

  it("rejects an expired token", () => {
    const token = signJwt({ sub: "u1" }, { key: KEY, expiresInMs: 1000, now: T0 });
    expect(() => verifyJwt(token, { key: KEY, now: T0 + 2000 })).toThrow(TokenError);
  });

  it("rejects a tampered signature", () => {
    const token = signJwt({ sub: "u1" }, { key: KEY, now: T0 });
    expect(() => verifyJwt(`${token}x`, { key: KEY, now: T0 })).toThrow("signature");
  });

  it("rejects the wrong issuer", () => {
    const token = signJwt({ sub: "u1" }, { key: KEY, issuer: "a", now: T0 });
    expect(() => verifyJwt(token, { key: KEY, issuer: "b", now: T0 })).toThrow("issuer");
  });

  it("rejects verification with a different key", () => {
    const token = signJwt({ sub: "u1" }, { key: KEY, now: T0 });
    expect(() => verifyJwt(token, { key: generateKey(), now: T0 })).toThrow(TokenError);
  });
});

describe("refresh tokens", () => {
  it("issues an opaque token and matches by hash", () => {
    const issued = issueRefreshToken({ ttlMs: 1000, now: T0 });
    expect(issued.tokenHash).not.toBe(issued.token);
    expect(issued.expiresAt).toBe(T0 + 1000);
    expect(refreshTokenMatches(issued.token, issued.tokenHash)).toBe(true);
    expect(refreshTokenMatches("wrong", issued.tokenHash)).toBe(false);
  });
});

describe("RevocationRegistry", () => {
  it("revokes tokens and families", () => {
    const registry = new RevocationRegistry();
    registry.revokeToken("t1");
    registry.revokeFamily("fam1");
    expect(registry.isRevoked("t1")).toBe(true);
    expect(registry.isRevoked("t2", "fam1")).toBe(true);
    expect(registry.isRevoked("t2", "fam2")).toBe(false);
  });
});
