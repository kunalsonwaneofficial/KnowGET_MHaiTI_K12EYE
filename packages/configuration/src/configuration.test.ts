import { ConfigurationError } from "@knowget/exceptions";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "./config";
import { StaticFeatureFlagService } from "./feature-flags";
import { EnvSecretsProvider } from "./secrets";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
});

describe("loadConfig", () => {
  it("parses and coerces a valid source", () => {
    const config = loadConfig(schema, { source: { NODE_ENV: "production", PORT: "8080" } });
    expect(config.NODE_ENV).toBe("production");
    expect(config.PORT).toBe(8080);
  });

  it("applies schema defaults", () => {
    const config = loadConfig(schema, { source: {} });
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(4000);
  });

  it("throws ConfigurationError with issue details on invalid input", () => {
    try {
      loadConfig(schema, { source: { PORT: "-5" } });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).details).toBeDefined();
    }
  });
});

describe("EnvSecretsProvider", () => {
  it("reads and requires secrets", () => {
    const provider = new EnvSecretsProvider({ API_KEY: "abc" });
    expect(provider.get("API_KEY")).toBe("abc");
    expect(provider.get("MISSING")).toBeUndefined();
    expect(() => provider.getOrThrow("MISSING")).toThrow(ConfigurationError);
  });
});

describe("StaticFeatureFlagService", () => {
  it("evaluates flags, defaulting unknown to false", () => {
    const flags = new StaticFeatureFlagService({ betaDashboard: true, legacyUi: false });
    expect(flags.isEnabled("betaDashboard")).toBe(true);
    expect(flags.isEnabled("legacyUi")).toBe(false);
    expect(flags.isEnabled("unknown")).toBe(false);
    expect(flags.all()).toEqual({ betaDashboard: true, legacyUi: false });
  });
});
