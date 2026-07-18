import { generateKey } from "@knowget/security";
import { describe, expect, it } from "vitest";
import { LocalKmsClient } from "./kms-client";

describe("LocalKmsClient (envelope KMS)", () => {
  const kek = generateKey();

  it("round-trips wrapped key material", async () => {
    const kms = new LocalKmsClient(kek);
    const material = generateKey();

    const wrapped = await kms.wrap(material);
    expect(wrapped).not.toContain(material.toString("base64")); // ciphertext, not plaintext

    const unwrapped = await kms.unwrap(wrapped);
    expect(unwrapped.equals(material)).toBe(true);
  });

  it("fails to unwrap under a different KEK (authenticated encryption)", async () => {
    const wrapped = await new LocalKmsClient(kek).wrap(generateKey());
    await expect(new LocalKmsClient(generateKey()).unwrap(wrapped)).rejects.toThrow();
  });

  it("rejects a tampered ciphertext", async () => {
    const kms = new LocalKmsClient(kek);
    const wrapped = await kms.wrap(generateKey());
    const tampered = `${wrapped.slice(0, -1)}${wrapped.at(-1) === "A" ? "B" : "A"}`;
    await expect(kms.unwrap(tampered)).rejects.toThrow();
  });

  it("requires a 32-byte KEK", () => {
    expect(() => new LocalKmsClient(Buffer.alloc(16))).toThrow();
    expect(() => new LocalKmsClient(generateKey())).not.toThrow();
  });

  it("surfaces the key id for audit/rotation", () => {
    expect(new LocalKmsClient(kek, "kms://cmk/1").keyId).toBe("kms://cmk/1");
  });
});
