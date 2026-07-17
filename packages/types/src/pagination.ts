/** Sort direction for query results. */
export type SortDirection = "asc" | "desc";

/** A single sort instruction. */
export interface SortInstruction {
  readonly field: string;
  readonly direction: SortDirection;
}

/** A request for a page of results. */
export interface PageRequest {
  /** 1-based page number. */
  readonly page: number;
  /** Maximum number of items per page. */
  readonly pageSize: number;
  readonly sort?: readonly SortInstruction[];
}

/** A page of results plus pagination metadata. */
export interface PageResult<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
