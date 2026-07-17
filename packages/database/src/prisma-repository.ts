import {
  DEFAULT_PAGE,
  type FilterCondition,
  pageOffset,
  type QueryOptions,
  type Repository,
  toPageResult,
} from "@knowget/persistence";
import type { PageResult, SortInstruction } from "@knowget/types";
import type { ModelDelegate } from "./model-delegate";

const OPERATOR_MAP: Record<FilterCondition["operator"], string> = {
  eq: "equals",
  ne: "not",
  lt: "lt",
  lte: "lte",
  gt: "gt",
  gte: "gte",
  in: "in",
  contains: "contains",
};

function buildWhere(options: QueryOptions, softDelete: boolean): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const condition of options.filters ?? []) {
    where[condition.field] = { [OPERATOR_MAP[condition.operator]]: condition.value };
  }
  if (softDelete && !options.includeDeleted) {
    where.deletedAt = null;
  }
  return where;
}

function buildOrderBy(sort: readonly SortInstruction[] | undefined): unknown {
  if (!sort || sort.length === 0) {
    return undefined;
  }
  return sort.map((instruction) => ({ [instruction.field]: instruction.direction }));
}

export interface PrismaRepositoryOptions {
  /** Whether the model has a `deletedAt` soft-delete column. */
  readonly softDelete?: boolean;
}

/**
 * Generic repository over a Prisma model delegate implementing the reusable
 * {@link Repository} contract — pagination, filtering, sorting, soft delete and
 * hard delete — so domains never touch Prisma APIs.
 */
export class PrismaRepository<
  TEntity extends { id: string },
  TCreate = unknown,
  TUpdate = unknown,
> implements Repository<TEntity, string, TCreate, TUpdate> {
  private readonly soft: boolean;

  constructor(
    private readonly delegate: ModelDelegate<TEntity>,
    options: PrismaRepositoryOptions = {},
  ) {
    this.soft = options.softDelete ?? false;
  }

  findById(id: string): Promise<TEntity | null> {
    return this.delegate.findUnique({ where: { id } });
  }

  findOne(options: QueryOptions = {}): Promise<TEntity | null> {
    return this.delegate.findFirst({
      where: buildWhere(options, this.soft),
      orderBy: buildOrderBy(options.page?.sort),
    });
  }

  async findMany(options: QueryOptions = {}): Promise<PageResult<TEntity>> {
    const page = options.page ?? DEFAULT_PAGE;
    const where = buildWhere(options, this.soft);
    const [items, totalItems] = await Promise.all([
      this.delegate.findMany({
        where,
        orderBy: buildOrderBy(page.sort),
        skip: pageOffset(page),
        take: page.pageSize,
      }),
      this.delegate.count({ where }),
    ]);
    return toPageResult(items, totalItems, page);
  }

  count(options: QueryOptions = {}): Promise<number> {
    return this.delegate.count({ where: buildWhere(options, this.soft) });
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findById(id)) !== null;
  }

  create(data: TCreate): Promise<TEntity> {
    return this.delegate.create({ data: data as Record<string, unknown> });
  }

  update(id: string, data: TUpdate): Promise<TEntity> {
    return this.delegate.update({ where: { id }, data: data as Record<string, unknown> });
  }

  async softDelete(id: string): Promise<void> {
    this.assertSoft();
    await this.delegate.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  restore(id: string): Promise<TEntity> {
    this.assertSoft();
    return this.delegate.update({ where: { id }, data: { deletedAt: null } });
  }

  async hardDelete(id: string): Promise<void> {
    await this.delegate.delete({ where: { id } });
  }

  private assertSoft(): void {
    if (!this.soft) {
      throw new Error("Soft delete is not enabled for this repository");
    }
  }
}

/** Adapt a concrete Prisma delegate to the generic repository (single cast boundary). */
export function createRepository<
  TEntity extends { id: string },
  TCreate = unknown,
  TUpdate = unknown,
>(
  delegate: unknown,
  options?: PrismaRepositoryOptions,
): PrismaRepository<TEntity, TCreate, TUpdate> {
  return new PrismaRepository(delegate as ModelDelegate<TEntity>, options);
}
