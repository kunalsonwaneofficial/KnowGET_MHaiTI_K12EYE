import type { PageRequest, PageResult, SortDirection, SortInstruction } from "@knowget/types";

export type { PageRequest, PageResult, SortDirection, SortInstruction };

/** Supported filter operators for query conditions. */
export type FilterOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "contains";

export interface FilterCondition {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

/** Options for a query: filtering, paging, and whether to include soft-deleted rows. */
export interface QueryOptions {
  readonly filters?: readonly FilterCondition[];
  readonly page?: PageRequest;
  readonly includeDeleted?: boolean;
}

/** Sensible default page (1-based, 20 per page). */
export const DEFAULT_PAGE: PageRequest = { page: 1, pageSize: 20 };

/** Assemble a {@link PageResult} from items and a total count. */
export function toPageResult<T>(
  items: readonly T[],
  totalItems: number,
  page: PageRequest,
): PageResult<T> {
  const totalPages = page.pageSize > 0 ? Math.ceil(totalItems / page.pageSize) : 0;
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    totalItems,
    totalPages,
  };
}

/** Compute the number of rows to skip for a 1-based page request. */
export const pageOffset = (page: PageRequest): number =>
  Math.max(0, (page.page - 1) * page.pageSize);
