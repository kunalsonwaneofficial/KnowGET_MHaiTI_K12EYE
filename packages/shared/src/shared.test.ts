import { describe, expect, it } from "vitest";
import { assert, assertDefined } from "./assert";
import { isValidIso, nowIso, parseIso, toIso } from "./datetime";
import { isUuid, newCorrelationId, newUuid, toCorrelationId, toTenantId, toUuid } from "./id";
import { err, isErr, isOk, map, mapErr, ok, unwrap, unwrapOr } from "./result";
import { isBlank, slugify, truncate } from "./text";

describe("result", () => {
  it("constructs and narrows ok/err", () => {
    const good = ok(42);
    const bad = err(new Error("nope"));
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
  });

  it("maps success and error branches", () => {
    expect(unwrap(map(ok(2), (n) => n * 3))).toBe(6);
    const mapped = mapErr(err("boom"), (e) => `${e}!`);
    expect(isErr(mapped) && mapped.error).toBe("boom!");
  });

  it("unwrap throws on error, unwrapOr falls back", () => {
    expect(() => unwrap(err(new Error("x")))).toThrow("x");
    expect(unwrapOr(err("e"), 7)).toBe(7);
  });
});

describe("id", () => {
  it("generates valid unique uuids", () => {
    const a = newUuid();
    const b = newUuid();
    expect(a).not.toBe(b);
    expect(isUuid(a)).toBe(true);
    expect(isUuid(newCorrelationId())).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("brands trusted strings at boundaries", () => {
    expect(toUuid("id-1")).toBe("id-1");
    expect(toCorrelationId("corr-1")).toBe("corr-1");
    expect(toTenantId("tenant-1")).toBe("tenant-1");
  });
});

describe("datetime", () => {
  it("round-trips ISO strings", () => {
    const iso = nowIso();
    expect(isValidIso(iso)).toBe(true);
    const date = new Date("2026-01-02T03:04:05.000Z");
    expect(toIso(date)).toBe("2026-01-02T03:04:05.000Z");
    expect(parseIso(toIso(date)).getTime()).toBe(date.getTime());
  });
});

describe("text", () => {
  it("detects blank strings", () => {
    expect(isBlank("  ")).toBe(true);
    expect(isBlank("x")).toBe(false);
  });

  it("slugifies", () => {
    expect(slugify("Grade 8 — Mathematics!")).toBe("grade-8-mathematics");
  });

  it("truncates with ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("hi", 5)).toBe("hi");
  });
});

describe("assert", () => {
  it("throws on falsy conditions", () => {
    expect(() => assert(false, "bad")).toThrow("bad");
    expect(() => assertDefined(null)).toThrow();
    expect(() => assertDefined("ok")).not.toThrow();
  });
});
