/** A predicate over candidates of type `T` (the Specification pattern). */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

class PredicateSpecification<T> implements Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) {}
  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }
}

/** Build a specification from a predicate. */
export const spec = <T>(predicate: (candidate: T) => boolean): Specification<T> =>
  new PredicateSpecification(predicate);

/** Logical AND of two specifications. */
export const and = <T>(a: Specification<T>, b: Specification<T>): Specification<T> =>
  spec((candidate) => a.isSatisfiedBy(candidate) && b.isSatisfiedBy(candidate));

/** Logical OR of two specifications. */
export const or = <T>(a: Specification<T>, b: Specification<T>): Specification<T> =>
  spec((candidate) => a.isSatisfiedBy(candidate) || b.isSatisfiedBy(candidate));

/** Logical NOT of a specification. */
export const not = <T>(a: Specification<T>): Specification<T> =>
  spec((candidate) => !a.isSatisfiedBy(candidate));
