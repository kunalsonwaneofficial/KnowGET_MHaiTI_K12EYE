import type { PageResult } from "@knowget/types";
import type { QueryOptions } from "./query";

/**
 * Reusable persistence contract. Business domains depend on this abstraction —
 * never on ORM-specific APIs — so persistence technology can evolve without
 * touching domain code.
 */
export interface Repository<TEntity, TId = string, TCreate = unknown, TUpdate = unknown> {
  findById(id: TId): Promise<TEntity | null>;
  findOne(options?: QueryOptions): Promise<TEntity | null>;
  findMany(options?: QueryOptions): Promise<PageResult<TEntity>>;
  count(options?: QueryOptions): Promise<number>;
  exists(id: TId): Promise<boolean>;
  create(data: TCreate): Promise<TEntity>;
  update(id: TId, data: TUpdate): Promise<TEntity>;
  /** Mark as deleted without removing the row. */
  softDelete(id: TId): Promise<void>;
  /** Reverse a soft delete. */
  restore(id: TId): Promise<TEntity>;
  /** Permanently remove the row. */
  hardDelete(id: TId): Promise<void>;
}
