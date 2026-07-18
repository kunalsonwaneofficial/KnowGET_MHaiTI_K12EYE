import { generateKey, KeyRing } from "@knowget/security";
import { TokenError, verifyJwt } from "@knowget/tokens";
import { describe, expect, it } from "vitest";
import { HmacTokenSigner } from "./token-signer";

describe("HmacTokenSigner", () => {
  it("signs a token the frozen verifier and its own verify both accept", async () => {
    const keyRing = new KeyRing(generateKey());
    const signer = new HmacTokenSigner(keyRing);

    const token = await signer.sign(
      { sub: "u1", role: "admin" },
      { issuer: "knowget", expiresInMs: 60_000 },
    );

    expect((await signer.verify(token, { issuer: "knowget" })).sub).toBe("u1");
    expect(verifyJwt(token, { key: keyRing.current().material, issuer: "knowget" }).role).toBe(
      "admin",
    );
  });

  it("verifies tokens signed before a key rotation (overlap window)", async () => {
    const keyRing = new KeyRing(generateKey());
    const signer = new HmacTokenSigner(keyRing);

    const beforeRotation = await signer.sign({ sub: "u1" });
    keyRing.rotate(); // new current key; the prior version is retained
    const afterRotation = await signer.sign({ sub: "u2" });

    expect((await signer.verify(beforeRotation)).sub).toBe("u1"); // prior version
    expect((await signer.verify(afterRotation)).sub).toBe("u2"); // current version
  });

  it("rejects a token signed by an unrelated key", async () => {
    const signer = new HmacTokenSigner(new KeyRing(generateKey()));
    const foreign = new HmacTokenSigner(new KeyRing(generateKey()));
    await expect(signer.verify(await foreign.sign({ sub: "u1" }))).rejects.toBeInstanceOf(
      TokenError,
    );
  });

  it("rejects malformed tokens", async () => {
    const signer = new HmacTokenSigner(new KeyRing(generateKey()));
    await expect(signer.verify("not.a.jwt.token")).rejects.toBeInstanceOf(TokenError);
    await expect(signer.verify("nope")).rejects.toBeInstanceOf(TokenError);
  });

  it("honors expiry", async () => {
    const signer = new HmacTokenSigner(new KeyRing(generateKey()));
    const token = await signer.sign({ sub: "u1" }, { expiresInMs: 1000, now: 0 });
    await expect(signer.verify(token, { now: 2000 })).rejects.toBeInstanceOf(TokenError);
  });
});
