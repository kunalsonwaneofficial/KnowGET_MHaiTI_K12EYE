import { TokenError } from "@knowget/tokens";
import { describe, expect, it } from "vitest";
import { AsymmetricTokenSigner } from "./asymmetric-token-signer";
import { LocalKmsSigner } from "./kms-signer";

const headerOf = (token: string): { alg: string; typ: string } =>
  JSON.parse(Buffer.from(token.split(".")[0] as string, "base64url").toString("utf8"));

describe("AsymmetricTokenSigner (RS256 via KMS signer)", () => {
  it("signs and verifies an RS256 token", async () => {
    const signer = new AsymmetricTokenSigner(LocalKmsSigner.generate());
    expect(signer.alg).toBe("RS256");

    const token = await signer.sign(
      { sub: "u1", role: "admin" },
      { issuer: "knowget", expiresInMs: 60_000 },
    );
    expect(headerOf(token).alg).toBe("RS256");

    const claims = await signer.verify(token, { issuer: "knowget" });
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("admin");
  });

  it("rejects a token signed by a different key (public-key mismatch)", async () => {
    const a = new AsymmetricTokenSigner(LocalKmsSigner.generate());
    const b = new AsymmetricTokenSigner(LocalKmsSigner.generate());
    await expect(b.verify(await a.sign({ sub: "u1" }))).rejects.toBeInstanceOf(TokenError);
  });

  it("rejects a tampered payload", async () => {
    const signer = new AsymmetricTokenSigner(LocalKmsSigner.generate());
    const [header, , signature] = (await signer.sign({ sub: "u1" })).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", iat: 0 })).toString("base64url");
    await expect(signer.verify(`${header}.${forged}.${signature}`)).rejects.toBeInstanceOf(
      TokenError,
    );
  });

  it("honors expiry and issuer", async () => {
    const signer = new AsymmetricTokenSigner(LocalKmsSigner.generate());
    const expired = await signer.sign({ sub: "u1" }, { expiresInMs: 1000, now: 0 });
    await expect(signer.verify(expired, { now: 5000 })).rejects.toBeInstanceOf(TokenError);

    const token = await signer.sign({ sub: "u1" }, { issuer: "a" });
    await expect(signer.verify(token, { issuer: "b" })).rejects.toBeInstanceOf(TokenError);
  });

  it("exposes only the public key (the private key stays in the signer)", () => {
    const pem = LocalKmsSigner.generate().publicKeyPem();
    expect(pem).toContain("BEGIN PUBLIC KEY");
    expect(pem).not.toContain("PRIVATE KEY");
  });
});
