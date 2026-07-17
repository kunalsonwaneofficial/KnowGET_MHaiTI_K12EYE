/**
 * Transaction/Unit-of-Work abstraction. Implementations run `work` inside a
 * single transaction, committing on success and rolling back on any thrown
 * error. `TContext` is the transactional handle passed to the work callback.
 */
export interface UnitOfWork<TContext = unknown> {
  run<T>(work: (context: TContext) => Promise<T>): Promise<T>;
}
