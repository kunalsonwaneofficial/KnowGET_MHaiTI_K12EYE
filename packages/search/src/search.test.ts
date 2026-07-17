import { describe, expect, it } from "vitest";
import { InMemorySearchIndex, tokenize } from "./in-memory-search-index";

function seed(): InMemorySearchIndex {
  const index = new InMemorySearchIndex();
  index.index({ id: "1", text: "The quick brown fox", fields: { type: "animal" } });
  index.index({ id: "2", text: "A quick brown dog", fields: { type: "animal" } });
  index.index({ id: "3", text: "Slow green turtle", fields: { type: "reptile" } });
  return index;
}

describe("tokenize", () => {
  it("lowercases, splits and drops stopwords", () => {
    expect(tokenize("The Quick, brown FOX!")).toEqual(["quick", "brown", "fox"]);
  });
});

describe("InMemorySearchIndex", () => {
  it("ranks documents by relevance", () => {
    const result = seed().search({ text: "quick brown fox" });
    expect(result.hits[0]?.id).toBe("1"); // matches all three terms
    expect(result.total).toBe(2);
    expect(result.hits.map((h) => h.id)).toContain("2");
    expect(result.hits.every((h) => h.score > 0)).toBe(true);
  });

  it("returns no hits when nothing matches", () => {
    expect(seed().search({ text: "elephant" }).total).toBe(0);
  });

  it("applies exact-match field filters", () => {
    const result = seed().search({ text: "quick brown", filters: { type: "animal" } });
    expect(result.total).toBe(2);
    const reptile = seed().search({ text: "quick", filters: { type: "reptile" } });
    expect(reptile.total).toBe(0);
  });

  it("matches all documents for an empty query, filtered by fields", () => {
    const result = seed().search({ text: "", filters: { type: "animal" } });
    expect(result.total).toBe(2);
  });

  it("paginates deterministically", () => {
    const index = new InMemorySearchIndex();
    for (let i = 0; i < 5; i += 1) {
      index.index({ id: `d${i}`, text: "common term" });
    }
    const page1 = index.search({ text: "common", page: 1, pageSize: 2 });
    const page2 = index.search({ text: "common", page: 2, pageSize: 2 });
    expect(page1.hits).toHaveLength(2);
    expect(page2.hits).toHaveLength(2);
    expect(page1.total).toBe(5);
    const ids = new Set([...page1.hits, ...page2.hits].map((h) => h.id));
    expect(ids.size).toBe(4); // no overlap across pages
  });

  it("re-indexes and removes documents", () => {
    const index = seed();
    index.index({ id: "1", text: "updated content only" });
    expect(index.search({ text: "fox" }).total).toBe(0);
    expect(index.search({ text: "updated" }).hits[0]?.id).toBe("1");
    expect(index.remove("1")).toBe(true);
    expect(index.remove("1")).toBe(false);
    expect(index.size).toBe(2);
  });
});
