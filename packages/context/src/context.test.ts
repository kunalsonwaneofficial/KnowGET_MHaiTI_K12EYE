import type { CorrelationId, TenantId } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { RuntimeContextStore } from "./context-store";
import { createRuntimeContext } from "./runtime-context";

describe("createRuntimeContext", () => {
  it("fills correlationId and startedAt by default", () => {
    const ctx = createRuntimeContext();
    expect(ctx.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves provided fields", () => {
    const ctx = createRuntimeContext({ locale: "en-IN", timeZone: "Asia/Kolkata" });
    expect(ctx.locale).toBe("en-IN");
    expect(ctx.timeZone).toBe("Asia/Kolkata");
  });
});

describe("RuntimeContextStore", () => {
  it("propagates within run and is isolated outside", () => {
    const store = new RuntimeContextStore();
    expect(store.get()).toBeUndefined();
    const ctx = createRuntimeContext({ correlationId: "c1" as CorrelationId });
    const seen = store.run(ctx, () => store.getOrThrow().correlationId);
    expect(seen).toBe("c1");
    expect(store.get()).toBeUndefined();
  });

  it("merges partial updates into the active context", () => {
    const store = new RuntimeContextStore();
    store.run(createRuntimeContext(), () => {
      store.update({ tenantId: "t1" as TenantId });
      expect(store.getOrThrow().tenantId).toBe("t1");
    });
  });

  it("throws from getOrThrow when no context is active", () => {
    const store = new RuntimeContextStore();
    expect(() => store.getOrThrow()).toThrow("No runtime context is active");
  });
});
