/**
 * Minimal structural view of a Prisma model delegate (e.g. `prisma.dataProbe`)
 * used by the generic repository. A concrete delegate is adapted to this shape
 * at a single documented boundary (see {@link createRepository}).
 */
export interface ModelDelegate<TEntity> {
  findUnique(args: { where: { id: string } }): Promise<TEntity | null>;
  findFirst(args: { where?: Record<string, unknown>; orderBy?: unknown }): Promise<TEntity | null>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<TEntity[]>;
  create(args: { data: Record<string, unknown> }): Promise<TEntity>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<TEntity>;
  delete(args: { where: { id: string } }): Promise<TEntity>;
  count(args: { where?: Record<string, unknown> }): Promise<number>;
}
