import {
  InMemorySearchIndex,
  type SearchDocument,
  type SearchQuery,
  type SearchResult,
} from "@knowget/search";

/**
 * Async, backend-agnostic full-text search. The in-memory adapter wraps the frozen
 * inverted-index `InMemorySearchIndex` (per-instance); the Postgres adapter makes
 * search a **shared** full-text index (TD-19). Async because the frozen
 * `SearchIndex` is synchronous and a database-backed index cannot be.
 */
export interface SearchService {
  index(document: SearchDocument): Promise<void>;
  remove(id: string): Promise<boolean>;
  search(query: SearchQuery): Promise<SearchResult>;
  size(): Promise<number>;
}

/** In-memory {@link SearchService} — wraps the frozen `InMemorySearchIndex`. */
export class InMemorySearchService implements SearchService {
  constructor(private readonly delegate: InMemorySearchIndex = new InMemorySearchIndex()) {}

  async index(document: SearchDocument): Promise<void> {
    this.delegate.index(document);
  }

  async remove(id: string): Promise<boolean> {
    return this.delegate.remove(id);
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    return this.delegate.search(query);
  }

  async size(): Promise<number> {
    return this.delegate.size;
  }
}
