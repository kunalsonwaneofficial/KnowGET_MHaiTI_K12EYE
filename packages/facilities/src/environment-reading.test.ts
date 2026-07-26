import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { readingView, recordReading } from "./environment-reading";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;
const spaceId = "44444444-4444-4444-4444-444444444444" as Uuid;
const sensorId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = (value = 22.5, unit: string | null = "°C") =>
  recordReading({
    tenantId,
    organizationId,
    buildingId,
    spaceId,
    sensorId,
    metric: "temperature",
    value,
    unit,
    recordedAt: "2026-07-01T09:00:00.000Z",
  });

describe("EnvironmentReading aggregate", () => {
  it("records a reading, preserving a floating-point value and normalizing a blank unit", () => {
    const r = make(22.5, "  ");
    expect(r.value).toBe(22.5);
    expect(r.metric).toBe("temperature");
    expect(r.unit).toBeNull();
    expect(r.recordedAt).toBe("2026-07-01T09:00:00.000Z");
  });

  it("rejects a non-finite value", () => {
    expect(() => make(Number.NaN)).toThrow(/finite/);
    expect(() => make(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it("structurally satisfies the comfort engine's reading view", () => {
    expect(readingView(make(19))).toEqual({ metric: "temperature", value: 19 });
  });
});
