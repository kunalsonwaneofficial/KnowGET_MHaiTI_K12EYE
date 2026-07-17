import type {
  FieldValue,
  SearchDocument,
  SearchHit,
  SearchIndex,
  SearchQuery,
  SearchResult,
} from "./search-index";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "is",
  "it",
  "for",
  "on",
  "with",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

interface IndexedDoc {
  readonly termFrequency: ReadonlyMap<string, number>;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

/**
 * In-memory full-text search over an inverted index with TF-IDF ranking.
 * `score(doc) = Σ over query terms of tf(term, doc) · idf(term)`, where
 * `idf = ln(1 + N / df)`. Exact-match `fields` filters narrow the result set;
 * an empty query text matches all documents (score 0). Deterministic ordering:
 * score descending, then document id ascending.
 */
export class InMemorySearchIndex implements SearchIndex {
  private readonly docs = new Map<string, IndexedDoc>();
  private readonly postings = new Map<string, Set<string>>();

  index(document: SearchDocument): void {
    this.remove(document.id);
    const termFrequency = new Map<string, number>();
    for (const token of tokenize(document.text)) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }
    this.docs.set(document.id, { termFrequency, fields: document.fields ?? {} });
    for (const term of termFrequency.keys()) {
      let set = this.postings.get(term);
      if (!set) {
        set = new Set<string>();
        this.postings.set(term, set);
      }
      set.add(document.id);
    }
  }

  remove(id: string): boolean {
    const existing = this.docs.get(id);
    if (!existing) {
      return false;
    }
    for (const term of existing.termFrequency.keys()) {
      const set = this.postings.get(term);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.postings.delete(term);
        }
      }
    }
    return this.docs.delete(id);
  }

  get size(): number {
    return this.docs.size;
  }

  search(query: SearchQuery): SearchResult {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const terms = tokenize(query.text);

    const scored = terms.length === 0 ? this.matchAll() : this.scoreByTerms(terms);
    const filtered = query.filters
      ? scored.filter(([id]) => this.matchesFilters(id, query.filters ?? {}))
      : scored;

    filtered.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const start = (page - 1) * pageSize;
    const hits: SearchHit[] = filtered
      .slice(start, start + pageSize)
      .map(([id, score]) => ({ id, score, fields: this.docs.get(id)?.fields ?? {} }));

    return { hits, total: filtered.length, page, pageSize };
  }

  private matchAll(): Array<[string, number]> {
    return [...this.docs.keys()].map((id) => [id, 0]);
  }

  private scoreByTerms(terms: readonly string[]): Array<[string, number]> {
    const total = this.docs.size;
    const scores = new Map<string, number>();
    for (const term of terms) {
      const posting = this.postings.get(term);
      if (!posting || posting.size === 0) {
        continue;
      }
      const idf = Math.log(1 + total / posting.size);
      for (const id of posting) {
        const tf = this.docs.get(id)?.termFrequency.get(term) ?? 0;
        scores.set(id, (scores.get(id) ?? 0) + tf * idf);
      }
    }
    return [...scores.entries()];
  }

  private matchesFilters(id: string, filters: Readonly<Record<string, FieldValue>>): boolean {
    const fields = this.docs.get(id)?.fields ?? {};
    return Object.entries(filters).every(([key, value]) => fields[key] === value);
  }
}
