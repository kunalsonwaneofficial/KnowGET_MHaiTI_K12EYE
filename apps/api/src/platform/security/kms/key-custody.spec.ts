import { generateKey } from "@knowget/security";
import { verifyJwt } from "@knowget/tokens";
import { describe, expect, it } from "vitest";
import { HmacTokenSigner } from "../signing/token-signer";
import { LocalKmsClient } from "./kms-client";
import { provisionEnvelopeKey, readKek, resolveEnvelopeKeyRing } from "./key-custody";

describe("envelope key custody", () => {
  it("provisions, wraps and unwraps a signing key into a KeyRing", async () => {
    const kms = new LocalKmsClient(generateKey());
    const { wrapped, material } = await provisionEnvelopeKey(kms);

    const keyRing = await resolveEnvelopeKeyRing(wrapped, kms);
    expect(keyRing.current().material.equals(material)).toBe(true);
  });

  it("the wrapped blob does not expose the key material at rest", async () => {
    const kms = new LocalKmsClient(generateKey());
    const { wrapped, material } = await provisionEnvelopeKey(kms);
    expect(wrapped).not.toContain(material.toString("base64"));
  });

  it("readKek requires a base64-encoded 32-byte key", () => {
    expect(() => readKek(generateKey().toString("base64"))).not.toThrow();
    expect(() => readKek(Buffer.alloc(16).toString("base64"))).toThrow();
  });

  it("an envelope-seeded KeyRing signs tokens the frozen verifier accepts", async () => {
    const kms = new LocalKmsClient(generateKey());
    const { wrapped } = await provisionEnvelopeKey(kms);
    const keyRing = await resolveEnvelopeKeyRing(wrapped, kms);

    const token = await new HmacTokenSigner(keyRing).sign({ sub: "u1" }, { issuer: "knowget" });
    const claims = verifyJwt(token, { key: keyRing.current().material, issuer: "knowget" });
    expect(claims.sub).toBe("u1");
  });
});
