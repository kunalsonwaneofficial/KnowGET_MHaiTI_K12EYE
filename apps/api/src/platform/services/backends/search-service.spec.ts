import { describe, expect, it } from "vitest";
import { InMemorySearchService } from "./search-service";

describe("InMemorySearchService", () => {
  it("indexes, searches and removes documents", async () => {
    const search = new InMemorySearchService();
    await search.index({ id: "d1", text: "the quick brown fox" });
    await search.index({ id: "d2", text: "lazy dog sleeps" });

    expect(await search.size()).toBe(2);
    const result = await search.search({ text: "fox" });
    expect(result.total).toBe(1);
    expect(result.hits[0]?.id).toBe("d1");

    expect(await search.remove("d1")).toBe(true);
    expect(await search.size()).toBe(1);
  });

  it("filters by exact fields", async () => {
    const search = new InMemorySearchService();
    await search.index({ id: "a", text: "quarterly report", fields: { type: "finance" } });
    await search.index({ id: "b", text: "quarterly report", fields: { type: "hr" } });

    const result = await search.search({ text: "report", filters: { type: "finance" } });
    expect(result.total).toBe(1);
    expect(result.hits[0]?.id).toBe("a");
  });
});
