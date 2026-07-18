import { generateKey } from "@knowget/security";
import { describe, expect, it } from "vitest";
import { provisionEnvelopeKey } from "./kms/key-custody";
import { LocalKmsClient } from "./kms/kms-client";
import { loadSecurityEnv } from "./security.env";
import { buildSecurityGraph } from "./security.providers";

describe("buildSecurityGraph — signing-key custody (TD-11)", () => {
  it("plaintext custody (default) seeds the key ring from SECURITY_JWT_SECRET", async () => {
    const graph = await buildSecurityGraph(
      loadSecurityEnv({ SECURITY_JWT_SECRET: "a-development-signing-secret-key!!" }),
    );
    expect(graph.keyRing.current().material.toString("utf8")).toBe(
      "a-development-signing-secret-key!!",
    );
  });

  it("envelope custody unwraps a KMS-wrapped key into the key ring", async () => {
    const kek = generateKey();
    const { wrapped, material } = await provisionEnvelopeKey(new LocalKmsClient(kek));

    const graph = await buildSecurityGraph(
      loadSecurityEnv({
        SECURITY_KEY_CUSTODY: "envelope",
        SECURITY_KMS_MASTER_KEY: kek.toString("base64"),
        SECURITY_JWT_KEY_WRAPPED: wrapped,
      }),
    );
    expect(graph.keyRing.current().material.equals(material)).toBe(true);
  });

  it("envelope custody fails closed without the KEK and wrapped key", async () => {
    await expect(
      buildSecurityGraph(loadSecurityEnv({ SECURITY_KEY_CUSTODY: "envelope" })),
    ).rejects.toThrow();
  });
});
