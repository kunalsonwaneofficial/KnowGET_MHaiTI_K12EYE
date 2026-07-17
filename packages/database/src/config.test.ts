import { describe, expect, it } from "vitest";
import { buildConnectionString, redactConnectionString, type DatabaseConfig } from "./config";

const config: DatabaseConfig = {
  host: "localhost",
  port: 5432,
  user: "knowget",
  password: "s3cr3t",
  database: "knowget_mhaiti",
  schema: "public",
};

describe("database config", () => {
  it("builds a connection string with schema", () => {
    expect(buildConnectionString(config)).toBe(
      "postgresql://knowget:s3cr3t@localhost:5432/knowget_mhaiti?schema=public",
    );
  });

  it("adds sslmode when ssl is enabled", () => {
    expect(buildConnectionString({ ...config, schema: undefined, ssl: true })).toBe(
      "postgresql://knowget:s3cr3t@localhost:5432/knowget_mhaiti?sslmode=require",
    );
  });

  it("redacts the password for logging", () => {
    const url = buildConnectionString(config);
    expect(redactConnectionString(url)).toBe(
      "postgresql://knowget:[REDACTED]@localhost:5432/knowget_mhaiti?schema=public",
    );
  });
});
