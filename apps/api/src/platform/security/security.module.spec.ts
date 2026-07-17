import "reflect-metadata";
import { AuthenticationError } from "@knowget/authentication";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { SecurityController } from "./security.controller";
import { SecurityModule } from "./security.module";

// The dev-default bootstrap identity seeded by buildSecurityGraph when no
// SECURITY_BOOTSTRAP_* env is set (non-production).
const DEV_EMAIL = "admin@knowget.local";
const DEV_PASSWORD = "ChangeMe!Bootstrap1";

describe("SecurityModule (integration)", () => {
  it("compiles the full DI graph including the global guard stack", async () => {
    // compile() resolves every provider — the async security-graph factory, the
    // derived engine/key/resolver providers, and all three APP_GUARDs. Any
    // unresolvable dependency (e.g. a mis-wired guard) makes this reject.
    const moduleRef = await Test.createTestingModule({ imports: [SecurityModule] }).compile();
    expect(moduleRef.get(SecurityController)).toBeInstanceOf(SecurityController);
    await moduleRef.close();
  });

  it("authenticates the seeded bootstrap administrator end to end", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SecurityModule] }).compile();
    const controller = moduleRef.get(SecurityController);
    const result = await controller.login({ email: DEV_EMAIL, password: DEV_PASSWORD });
    expect(result.tokenType).toBe("Bearer");
    expect(result.accessToken.split(".")).toHaveLength(3);
    expect(result.refreshToken.length).toBeGreaterThan(0);
    expect(result.expiresInMs).toBeGreaterThan(0);
    await moduleRef.close();
  });

  it("rejects invalid credentials", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SecurityModule] }).compile();
    const controller = moduleRef.get(SecurityController);
    await expect(
      controller.login({ email: DEV_EMAIL, password: "wrong-password" }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    await moduleRef.close();
  });

  it("rejects a malformed login payload", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SecurityModule] }).compile();
    const controller = moduleRef.get(SecurityController);
    await expect(controller.login({ email: "not-an-email" })).rejects.toThrow();
    await moduleRef.close();
  });
});
