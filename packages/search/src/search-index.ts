/** A filterable scalar value attached to a document. */
export type FieldValue = string | number | boolean;

/** A document submitted for indexing. */
export interface SearchDocument {
  readonly id: string;
  /** Free-text content that is tokenized and ranked. */
  readonly text: string;
  /** Exact-match filterable attributes (tenant, type, status, …). */
  readonly fields?: Readonly<Record<string, FieldValue>>;
}

export interface SearchQuery {
  /** Free-text query; empty matches all documents (subject to filters). */
  readonly text: string;
  readonly filters?: Readonly<Record<string, FieldValue>>;
  /** 1-based page number (default 1). */
  readonly page?: number;
  /** Page size (default 10). */
  readonly pageSize?: number;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Provider-agnostic search contract. Phase-1 ships an in-memory inverted-index
 * implementation; a PostgreSQL full-text or OpenSearch/Elasticsearch backend
 * can replace it behind this same surface.
 */
export interface SearchIndex {
  index(document: SearchDocument): void;
  remove(id: string): boolean;
  search(query: SearchQuery): SearchResult;
  readonly size: number;
}
