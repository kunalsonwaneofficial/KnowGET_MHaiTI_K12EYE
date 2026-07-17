/** Health payload returned by the platform API. */
export interface HealthStatus {
  readonly status: string;
  readonly [key: string]: unknown;
}

export interface KnowGetClientOptions {
  /** Base URL of the platform API, e.g. `http://localhost:4000`. */
  readonly baseUrl: string;
  /** Injectable fetch implementation (defaults to the global `fetch`). */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Minimal typed client for the KnowGET MHaiTI API. This foundation exposes the
 * health endpoint; capability-specific methods are generated/added as the API
 * surface grows (P3-D01 gateway + SDK generation).
 */
export class KnowGetClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: KnowGetClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /** Query the platform health endpoint. */
  async health(): Promise<HealthStatus> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
    return (await response.json()) as HealthStatus;
  }
}
