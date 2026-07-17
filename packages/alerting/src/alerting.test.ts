import { describe, expect, it, vi } from "vitest";
import type { Alert, AlertRule } from "./alert";
import { breaches } from "./alert";
import { AlertManager } from "./manager";

const rules: AlertRule[] = [
  {
    name: "high-error-rate",
    metric: "error_rate",
    comparator: "gt",
    threshold: 0.05,
    severity: "critical",
  },
  {
    name: "low-cache-hit",
    metric: "cache_hit_ratio",
    comparator: "lt",
    threshold: 0.8,
    severity: "warning",
  },
];

describe("breaches", () => {
  it("evaluates every comparator", () => {
    expect(breaches(2, "gt", 1)).toBe(true);
    expect(breaches(1, "gte", 1)).toBe(true);
    expect(breaches(0, "lt", 1)).toBe(true);
    expect(breaches(1, "lte", 1)).toBe(true);
    expect(breaches(1, "eq", 1)).toBe(true);
    expect(breaches(1, "gt", 1)).toBe(false);
  });
});

describe("AlertManager", () => {
  it("fires when a rule is breached and lists it as active", () => {
    const manager = new AlertManager(rules);
    const active = manager.evaluate({ error_rate: 0.1, cache_hit_ratio: 0.9 });
    expect(active).toHaveLength(1);
    expect(active[0]?.rule).toBe("high-error-rate");
    expect(active[0]?.severity).toBe("critical");
  });

  it("emits firing and resolved transitions exactly once each", () => {
    const sink = vi.fn<(alert: Alert) => void>();
    const manager = new AlertManager(rules, { sink });

    manager.evaluate({ error_rate: 0.1 }); // fires
    manager.evaluate({ error_rate: 0.2 }); // still firing — no new emit
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0].state).toBe("firing");

    manager.evaluate({ error_rate: 0.01 }); // resolves
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[1]?.[0].state).toBe("resolved");
    expect(manager.active).toHaveLength(0);
  });

  it("ignores rules whose metric is absent from the readings", () => {
    const manager = new AlertManager(rules);
    expect(manager.evaluate({ unrelated: 1 })).toHaveLength(0);
  });
});
