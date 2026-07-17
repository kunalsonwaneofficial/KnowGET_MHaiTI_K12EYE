import { PlatformError } from "@knowget/exceptions";

export type CircuitState = "closed" | "open" | "half_open";

/** Raised when a call is rejected because the circuit is open (maps to HTTP 503). */
export class CircuitOpenError extends PlatformError {
  constructor(name: string) {
    super(`Circuit "${name}" is open`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { circuit: name },
    });
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the circuit open. */
  readonly failureThreshold?: number;
  /** Time the circuit stays open before allowing a half-open trial. */
  readonly resetTimeoutMs?: number;
  readonly clock?: () => number;
  readonly name?: string;
}

/**
 * A circuit breaker that fails fast once a dependency is unhealthy. After
 * `failureThreshold` consecutive failures it opens; after `resetTimeoutMs` it
 * allows a single half-open trial — success closes it, failure re-opens it. The
 * clock is injectable for deterministic tests.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private stateValue: CircuitState = "closed";
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly clock: () => number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.clock = options.clock ?? Date.now;
    this.name = options.name ?? "circuit";
  }

  get state(): CircuitState {
    if (this.stateValue === "open" && this.clock() - this.openedAt >= this.resetTimeoutMs) {
      this.stateValue = "half_open";
    }
    return this.stateValue;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      throw new CircuitOpenError(this.name);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.stateValue = "closed";
  }

  private onFailure(): void {
    if (this.stateValue === "half_open") {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.stateValue = "open";
    this.openedAt = this.clock();
  }
}
