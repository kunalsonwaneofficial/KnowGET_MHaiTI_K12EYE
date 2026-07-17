import { describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  generateKey,
  hashPassword,
  hmacSign,
  hmacVerify,
  secureToken,
  verifyPassword,
} from "./crypto-services";
import { KeyRing } from "./key-ring";
import { SecurityAuditLogger } from "./security-audit";

describe("password hashing (scrypt)", () => {
  it("hashes and verifies", () => {
    const hash = hashPassword("Str0ng!Passphrase");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Str0ng!Passphrase", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("is salted (distinct hashes for the same input)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("AES-256-GCM encryption", () => {
  it("round-trips plaintext", () => {
    const key = generateKey();
    const ciphertext = encrypt("secret data", key);
    expect(ciphertext).not.toContain("secret");
    expect(decrypt(ciphertext, key)).toBe("secret data");
  });

  it("fails to decrypt with the wrong key", () => {
    const ciphertext = encrypt("x", generateKey());
    expect(() => decrypt(ciphertext, generateKey())).toThrow();
  });
});

describe("HMAC", () => {
  it("signs and verifies, rejecting tampering", () => {
    const key = generateKey();
    const signature = hmacSign("payload", key);
    expect(hmacVerify("payload", signature, key)).toBe(true);
    expect(hmacVerify("tampered", signature, key)).toBe(false);
  });
});

describe("secureToken", () => {
  it("generates unique tokens", () => {
    expect(secureToken()).not.toBe(secureToken());
  });
});

describe("KeyRing", () => {
  it("rotates and retains previous versions", () => {
    const ring = new KeyRing();
    const v1 = ring.current().version;
    const rotated = ring.rotate();
    expect(rotated.version).toBe(v1 + 1);
    expect(ring.current().version).toBe(v1 + 1);
    expect(ring.get(v1)).toBeDefined();
    expect(ring.versions()).toHaveLength(2);
  });
});

describe("SecurityAuditLogger", () => {
  it("records a tamper-evident hash chain", () => {
    const log = new SecurityAuditLogger();
    log.record({ type: "authentication.succeeded", actorId: "u1" });
    log.record({ type: "session.created", actorId: "u1" });
    expect(log.all()).toHaveLength(2);
    expect(log.verifyChain()).toBe(true);
  });

  it("detects tampering with a recorded event", () => {
    const log = new SecurityAuditLogger();
    log.record({ type: "authentication.failed", actorId: "u1" });
    (log.all()[0] as { type: string }).type = "authentication.succeeded";
    expect(log.verifyChain()).toBe(false);
  });
});
