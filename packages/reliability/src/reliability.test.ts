import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { retry } from "./retry";
import { TimeoutError, withTimeout } from "./timeout";

const noSleep = (): Promise<void> => Promise.resolve();

describe("retry", () => {
  it("succeeds after transient failures", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rethrows after exhausting attempts", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls += 1;
          throw new Error("always");
        },
        { maxAttempts: 2, sleep: noSleep },
      ),
    ).rejects.toThrow("always");
    expect(calls).toBe(2);
  });

  it("does not retry when shouldRetry returns false", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls += 1;
          throw new Error("fatal");
        },
        { shouldRetry: () => false, sleep: noSleep },
      ),
    ).rejects.toThrow("fatal");
    expect(calls).toBe(1);
  });
});

describe("withTimeout", () => {
  it("resolves when the operation is fast", async () => {
    expect(await withTimeout(async () => "fast", 50)).toBe("fast");
  });

  it("rejects with TimeoutError when the operation is slow", async () => {
    await expect(
      withTimeout(() => new Promise((resolve) => setTimeout(() => resolve("slow"), 50)), 5),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("CircuitBreaker", () => {
  const fail = (): Promise<never> => Promise.reject(new Error("boom"));
  const ok = (): Promise<string> => Promise.resolve("ok");

  it("opens after the failure threshold and fails fast", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, clock: () => 0 });
    await expect(breaker.execute(fail)).rejects.toThrow("boom");
    await expect(breaker.execute(fail)).rejects.toThrow("boom");
    expect(breaker.state).toBe("open");
    await expect(breaker.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("half-opens after the reset timeout and closes on success", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      clock: () => now,
    });
    await expect(breaker.execute(fail)).rejects.toThrow("boom");
    expect(breaker.state).toBe("open");
    now = 1000;
    expect(breaker.state).toBe("half_open");
    expect(await breaker.execute(ok)).toBe("ok");
    expect(breaker.state).toBe("closed");
  });

  it("re-opens if the half-open trial fails", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      clock: () => now,
    });
    await expect(breaker.execute(fail)).rejects.toThrow();
    now = 1000;
    expect(breaker.state).toBe("half_open");
    await expect(breaker.execute(fail)).rejects.toThrow("boom");
    now = 1500;
    expect(breaker.state).toBe("open");
  });
});
