import { describe, expect, it, vi } from "vitest";
import { KnowGetClient } from "./client";

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

describe("KnowGetClient", () => {
  it("requests the health endpoint at the normalized base url", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "ok" }));
    const client = new KnowGetClient({ baseUrl: "http://localhost:4000/", fetch: fetchImpl });
    const health = await client.health();
    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4000/health");
    expect(health.status).toBe("ok");
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));
    const client = new KnowGetClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });
    await expect(client.health()).rejects.toThrow("status 503");
  });
});
