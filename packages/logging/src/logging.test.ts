import { describe, expect, it } from "vitest";
import { ConsoleLogger, createLogger } from "./console-logger";
import type { LogRecord } from "./logger";

const collector = () => {
  const records: LogRecord[] = [];
  return { records, sink: (record: LogRecord) => records.push(record) };
};

describe("ConsoleLogger", () => {
  it("emits structured records with level and message", () => {
    const { records, sink } = collector();
    const log = new ConsoleLogger({ level: "debug", sink });
    log.info("hello", { userId: "u1" });
    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe("info");
    expect(records[0]?.message).toBe("hello");
    expect(records[0]?.context).toEqual({ userId: "u1" });
    expect(records[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filters records below the configured level", () => {
    const { records, sink } = collector();
    const log = new ConsoleLogger({ level: "warn", sink });
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(records.map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("merges base context in child loggers", () => {
    const { records, sink } = collector();
    const log = createLogger({ level: "info", sink, base: { service: "api" } });
    log.child({ tenantId: "t1" }).info("scoped");
    expect(records[0]?.context).toEqual({ service: "api", tenantId: "t1" });
  });

  it("redacts sensitive keys", () => {
    const { records, sink } = collector();
    const log = new ConsoleLogger({ level: "info", sink });
    log.info("login", { password: "hunter2", user: "alice" });
    expect(records[0]?.context).toEqual({ password: "[REDACTED]", user: "alice" });
  });
});
